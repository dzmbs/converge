import fs from "node:fs";
import path from "node:path";

const DAYS_PER_YEAR = 365;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function ensureNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function applyVenueSnapshots(baseDir, rawVenues) {
  return rawVenues.map((entry) => {
    if (!entry.snapshot) return clone(entry);
    const snapshotPath = path.resolve(baseDir, entry.snapshot);
    return loadJson(snapshotPath);
  });
}

function venueScore(venue) {
  return ensureNumber(venue.netApyBps) - ensureNumber(venue.recallPenaltyBps) - ensureNumber(venue.riskPenaltyBps);
}

function deployedRedeem(state) {
  return state.venues.reduce((sum, venue) => sum + venue.deployed, 0);
}

function pendingNotional(queue, rate) {
  return queue.reduce((sum, item) => {
    const face = item.type === "mint" ? item.amountRwa * rate : item.amountRedeem;
    return sum + face;
  }, 0);
}

function totalNav(state, config) {
  const rate = state.oracleRate;
  const haircut = ensureNumber(config.market.pendingAssetHaircutBps) / 10_000;
  return (
    state.liquidRedeem +
    state.liquidRwa * rate +
    deployedRedeem(state) +
    pendingNotional(state.pendingIssuer, rate) * (1 - haircut)
  );
}

function sharePrice(state, config) {
  return state.shares > 0 ? totalNav(state, config) / state.shares : 0;
}

function matured(queue, day) {
  const settled = [];
  const remaining = [];
  for (const item of queue) {
    if (item.settleDay <= day) settled.push(item);
    else remaining.push(item);
  }
  return { settled, remaining };
}

function settleIssuerQueue(state, day) {
  const { settled, remaining } = matured(state.pendingIssuer, day);
  state.pendingIssuer = remaining;
  for (const item of settled) {
    if (item.type === "mint") {
      state.liquidRwa += item.amountRwa;
    } else {
      state.liquidRedeem += item.amountRedeem;
    }
  }
  return settled;
}

function accrueVenueYield(state) {
  let accrued = 0;
  for (const venue of state.venues) {
    const dailyYield = venue.deployed * (ensureNumber(venue.netApyBps) / 10_000) / DAYS_PER_YEAR;
    venue.deployed += dailyYield;
    accrued += dailyYield;
  }
  return accrued;
}

function recallFromVenues(state, amountNeeded) {
  let recalledNet = 0;
  let recalledGross = 0;
  const venues = [...state.venues].sort((a, b) => {
    if (ensureNumber(a.recallPenaltyBps) !== ensureNumber(b.recallPenaltyBps)) {
      return ensureNumber(a.recallPenaltyBps) - ensureNumber(b.recallPenaltyBps);
    }
    return ensureNumber(b.deployed) - ensureNumber(a.deployed);
  });

  let remaining = amountNeeded;
  for (const venue of venues) {
    if (remaining <= 0) break;
    const gross = Math.min(venue.deployed, remaining);
    if (gross <= 0) continue;
    const penalty = gross * (ensureNumber(venue.recallPenaltyBps) / 10_000);
    const net = gross - penalty;
    venue.deployed -= gross;
    state.liquidRedeem += net;
    recalledGross += gross;
    recalledNet += net;
    remaining -= net;
  }

  return { recalledGross, recalledNet };
}

function bestVenue(state) {
  const venues = [...state.venues].sort((a, b) => venueScore(b) - venueScore(a));
  return venues[0] ?? null;
}

function deployExcessRedeem(state, amount) {
  let remaining = amount;
  let deployed = 0;

  while (remaining > 0.000001) {
    const venue = bestVenue(state);
    if (!venue) break;
    const room = Math.max(0, ensureNumber(venue.capacity) - venue.deployed);
    if (room <= 0) break;
    const move = Math.min(room, remaining, state.liquidRedeem);
    if (move <= 0) break;
    venue.deployed += move;
    state.liquidRedeem -= move;
    remaining -= move;
    deployed += move;
  }

  return deployed;
}

function queueIssuerAction(state, policy, kind, amount, rate, day) {
  if (amount <= 0) return 0;
  const settleDay = day + policy.settlementDelayDays;
  if (kind === "mint") {
    const amountRwa = amount / rate;
    state.liquidRedeem -= amount;
    state.pendingIssuer.push({ type: "mint", settleDay, amountRwa, notional: amount });
    return amount;
  }

  const amountRedeem = amount * rate;
  state.liquidRwa -= amount;
  state.pendingIssuer.push({ type: "redeem", settleDay, amountRedeem, notional: amountRedeem });
  return amountRedeem;
}

function resolveDailyFlows(config, day) {
  const flows = clone(config.scenario.daily ?? {});
  for (const window of config.scenario.windows ?? []) {
    if (day >= window.startDay && day <= window.endDay) {
      Object.assign(flows, window.flows);
    }
  }

  let oracleRate = config.market.oracleRate;
  for (const shock of config.scenario.shocks ?? []) {
    if (shock.day === day) {
      if (typeof shock.oracleRate === "number") oracleRate = shock.oracleRate;
      for (const [key, value] of Object.entries(shock)) {
        if (key === "day" || key === "oracleRate") continue;
        flows[key] = value;
      }
    }
  }

  return { flows, oracleRate };
}

function processLpFlows(state, config, flows, dayMetrics) {
  const currentSharePrice = sharePrice(state, config) || 1;
  const depositRedeem = ensureNumber(flows.lpDepositRedeem);
  const depositRwa = ensureNumber(flows.lpDepositRwa);
  const depositNotional = depositRedeem + depositRwa * state.oracleRate;

  if (depositRedeem > 0) state.liquidRedeem += depositRedeem;
  if (depositRwa > 0) state.liquidRwa += depositRwa;
  if (depositNotional > 0) {
    state.shares += depositNotional / currentSharePrice;
  }

  const withdrawDemand = ensureNumber(flows.lpWithdrawRedeemDemand);
  if (withdrawDemand <= 0) return;

  const burnShares = Math.min(state.shares, withdrawDemand / currentSharePrice);
  state.shares -= burnShares;

  let remaining = withdrawDemand;
  const direct = Math.min(state.liquidRedeem, remaining);
  state.liquidRedeem -= direct;
  remaining -= direct;

  if (remaining > 0) {
    const recalled = recallFromVenues(state, remaining);
    dayMetrics.recallGross += recalled.recalledGross;
    dayMetrics.recallNet += recalled.recalledNet;
    const afterRecall = Math.min(state.liquidRedeem, remaining);
    state.liquidRedeem -= afterRecall;
    remaining -= afterRecall;
  }

  if (remaining > 0) {
    dayMetrics.withdrawShortfall += remaining;
    dayMetrics.serviceFailures += 1;
  }
}

function processBuyRwaFlow(state, config, flows, dayMetrics) {
  const amountIn = ensureNumber(flows.buyRwaRedeemIn);
  if (amountIn <= 0) return;

  const fee = amountIn * (ensureNumber(config.market.swapFeeBps) / 10_000);
  const amountAfterFee = amountIn - fee;
  const rwaOut = amountAfterFee / state.oracleRate;

  if (state.liquidRwa + 1e-9 < rwaOut) {
    dayMetrics.rejectedBuyVolume += amountIn;
    dayMetrics.serviceFailures += 1;
    return;
  }

  state.liquidRedeem += amountIn;
  state.liquidRwa -= rwaOut;
  dayMetrics.feeIncome += fee;
  dayMetrics.buyRwaRedeemIn = amountIn;
  dayMetrics.buyRwaOut = rwaOut;
}

function processSellRwaFlow(state, config, flows, dayMetrics) {
  const amountIn = ensureNumber(flows.sellRwaIn);
  if (amountIn <= 0) return;

  const grossRedeemOut = amountIn * state.oracleRate;
  const fee = grossRedeemOut * (ensureNumber(config.market.swapFeeBps) / 10_000);
  const redeemOut = grossRedeemOut - fee;

  state.liquidRwa += amountIn;
  dayMetrics.sellRwaIn = amountIn;
  dayMetrics.feeIncome += fee;

  let remaining = redeemOut;
  const direct = Math.min(state.liquidRedeem, remaining);
  state.liquidRedeem -= direct;
  remaining -= direct;

  if (remaining > 0) {
    const recalled = recallFromVenues(state, remaining);
    dayMetrics.recallGross += recalled.recalledGross;
    dayMetrics.recallNet += recalled.recalledNet;
    const afterRecall = Math.min(state.liquidRedeem, remaining);
    state.liquidRedeem -= afterRecall;
    remaining -= afterRecall;
  }

  if (remaining > 0 && config.policy.useClearingHouse) {
    const covered = remaining;
    const rwaTransferred = covered / state.oracleRate;
    const cost = covered * (ensureNumber(config.policy.clearingCostBps) / 10_000);
    const transferableRwa = Math.min(state.liquidRwa, rwaTransferred);
    const actualCovered = transferableRwa * state.oracleRate;
    state.liquidRwa -= transferableRwa;
    remaining -= actualCovered;
    dayMetrics.clearingUsed += actualCovered;
    dayMetrics.clearingCost += actualCovered > 0 ? cost * (actualCovered / covered) : 0;
  }

  if (remaining > 0 && config.policy.useIouFallback) {
    dayMetrics.iouIssued += remaining;
    remaining = 0;
  }

  if (remaining > 0) {
    dayMetrics.rejectedSellVolume += remaining;
    dayMetrics.serviceFailures += 1;
  }
}

function rebalance(state, config, day, dayMetrics) {
  const { policy } = config;

  if (state.liquidRedeem < policy.minLiquidRedeem) {
    const recalled = recallFromVenues(state, policy.targetLiquidRedeem - state.liquidRedeem);
    dayMetrics.recallGross += recalled.recalledGross;
    dayMetrics.recallNet += recalled.recalledNet;
  }

  if (state.liquidRwa > policy.maxLiquidRwa) {
    const rwaToRedeem = state.liquidRwa - policy.targetLiquidRwa;
    const redeemQueued = queueIssuerAction(state, policy, "redeem", rwaToRedeem, state.oracleRate, day);
    dayMetrics.issuerRedeemQueued += redeemQueued;
  }

  if (state.liquidRwa < policy.minLiquidRwa && state.liquidRedeem > policy.targetLiquidRedeem) {
    const maxRedeemSpend = state.liquidRedeem - policy.targetLiquidRedeem;
    const rwaNeeded = policy.targetLiquidRwa - state.liquidRwa;
    const redeemToSpend = Math.min(maxRedeemSpend, rwaNeeded * state.oracleRate);
    const mintQueued = queueIssuerAction(state, policy, "mint", redeemToSpend, state.oracleRate, day);
    dayMetrics.issuerMintQueued += mintQueued;
  }

  if (state.liquidRedeem > policy.maxLiquidRedeem) {
    const deployed = deployExcessRedeem(state, state.liquidRedeem - policy.targetLiquidRedeem);
    dayMetrics.deployedToYield += deployed;
  }
}

function buildInitialState(config) {
  return {
    liquidRwa: ensureNumber(config.initialState.liquidRwa),
    liquidRedeem: ensureNumber(config.initialState.liquidRedeem),
    shares: ensureNumber(config.initialState.shares, 1_000_000),
    oracleRate: ensureNumber(config.market.oracleRate, 1),
    venues: config.venues.map((venue) => ({ ...clone(venue), deployed: 0 })),
    pendingIssuer: []
  };
}

function csvEscape(value) {
  const string = String(value);
  if (/[,"\n]/.test(string)) return `"${string.replaceAll('"', '""')}"`;
  return string;
}

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => csvEscape(row[key] ?? "")).join(","));
  }
  return lines.join("\n");
}

export function loadScenario(scenarioPath) {
  const absolutePath = path.resolve(scenarioPath);
  const baseDir = path.dirname(absolutePath);
  const raw = loadJson(absolutePath);
  return {
    ...raw,
    venues: applyVenueSnapshots(baseDir, raw.venues ?? [])
  };
}

export function simulate(config) {
  const state = buildInitialState(config);
  const rows = [];

  let totalFeeIncome = 0;
  let totalYield = 0;
  let totalClearingUsed = 0;
  let totalClearingCost = 0;
  let totalIouIssued = 0;
  let totalRejectedVolume = 0;
  let totalFailures = 0;

  const startingNav = totalNav(state, config);

  for (let day = 1; day <= config.days; day += 1) {
    const { flows, oracleRate } = resolveDailyFlows(config, day);
    state.oracleRate = oracleRate;

    const settled = settleIssuerQueue(state, day);
    const dayMetrics = {
      day,
      oracleRate: round(state.oracleRate),
      settledIssuerEvents: settled.length,
      feeIncome: 0,
      yieldAccrued: 0,
      recallGross: 0,
      recallNet: 0,
      clearingUsed: 0,
      clearingCost: 0,
      iouIssued: 0,
      issuerMintQueued: 0,
      issuerRedeemQueued: 0,
      serviceFailures: 0,
      rejectedBuyVolume: 0,
      rejectedSellVolume: 0,
      withdrawShortfall: 0,
      deployedToYield: 0,
      buyRwaRedeemIn: 0,
      buyRwaOut: 0,
      sellRwaIn: 0
    };

    dayMetrics.yieldAccrued = accrueVenueYield(state);
    processLpFlows(state, config, flows, dayMetrics);
    processBuyRwaFlow(state, config, flows, dayMetrics);
    processSellRwaFlow(state, config, flows, dayMetrics);
    rebalance(state, config, day, dayMetrics);

    const nav = totalNav(state, config);
    const px = sharePrice(state, config);

    totalFeeIncome += dayMetrics.feeIncome;
    totalYield += dayMetrics.yieldAccrued;
    totalClearingUsed += dayMetrics.clearingUsed;
    totalClearingCost += dayMetrics.clearingCost;
    totalIouIssued += dayMetrics.iouIssued;
    totalRejectedVolume += dayMetrics.rejectedBuyVolume + dayMetrics.rejectedSellVolume + dayMetrics.withdrawShortfall;
    totalFailures += dayMetrics.serviceFailures;

    rows.push({
      day,
      oracleRate: round(state.oracleRate),
      liquidRwa: round(state.liquidRwa),
      liquidRedeem: round(state.liquidRedeem),
      pendingIssuerNotional: round(pendingNotional(state.pendingIssuer, state.oracleRate)),
      deployedRedeem: round(deployedRedeem(state)),
      aaveDeployed: round(state.venues.find((venue) => venue.id === "aave-usdc")?.deployed ?? 0),
      morphoDeployed: round(state.venues.find((venue) => venue.id === "morpho-usdc")?.deployed ?? 0),
      feeIncome: round(dayMetrics.feeIncome),
      yieldAccrued: round(dayMetrics.yieldAccrued),
      recallNet: round(dayMetrics.recallNet),
      clearingUsed: round(dayMetrics.clearingUsed),
      clearingCost: round(dayMetrics.clearingCost),
      iouIssued: round(dayMetrics.iouIssued),
      issuerMintQueued: round(dayMetrics.issuerMintQueued),
      issuerRedeemQueued: round(dayMetrics.issuerRedeemQueued),
      rejectedVolume: round(dayMetrics.rejectedBuyVolume + dayMetrics.rejectedSellVolume),
      withdrawShortfall: round(dayMetrics.withdrawShortfall),
      serviceFailures: dayMetrics.serviceFailures,
      nav: round(nav),
      sharePrice: round(px)
    });
  }

  const endingNav = totalNav(state, config);
  return {
    summary: {
      scenario: config.name,
      days: config.days,
      startingNav: round(startingNav),
      endingNav: round(endingNav),
      navReturnPct: round(((endingNav / startingNav) - 1) * 100),
      annualizedReturnPct: round((((endingNav / startingNav) ** (DAYS_PER_YEAR / config.days)) - 1) * 100),
      totalFeeIncome: round(totalFeeIncome),
      totalYield: round(totalYield),
      totalClearingUsed: round(totalClearingUsed),
      totalClearingCost: round(totalClearingCost),
      totalIouIssued: round(totalIouIssued),
      totalRejectedVolume: round(totalRejectedVolume),
      totalServiceFailures: totalFailures,
      endingLiquidRwa: round(state.liquidRwa),
      endingLiquidRedeem: round(state.liquidRedeem),
      endingDeployedRedeem: round(deployedRedeem(state)),
      endingPendingIssuerNotional: round(pendingNotional(state.pendingIssuer, state.oracleRate))
    },
    daily: rows
  };
}

export function writeOutputs(outputDir, result) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(result.summary, null, 2));
  fs.writeFileSync(path.join(outputDir, "daily.csv"), toCsv(result.daily));
}
