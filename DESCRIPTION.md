# Converge

## Problem

RWAs are liquid offchain, but currently illiquid onchain. Today, issuer mint/redeem rails can move value 1:1 between offchain and onchain markets, but those flows are usually KYC-gated and take time to settle. That creates a mismatch: DeFi systems like lending markets, rebalancing vaults, flash loans, MEV strategies, and liquidations need atomic, permissionless onchain liquidity — this is aligned with RWA issuers who want deeper DeFi integration to drive mint demand and grow AUM.

Traditional onchain liquidity is a poor fit for RWAs. Incentivizing deep liquidity is expensive, xyk AMMs introduce unnecessary slippage for assets that already have a known fair value, and LPs are exposed to toxic MEV (IL, LVR, etc.). The result is that RWAs may be liquid via redemptions in theory, but remain difficult to use as composable onchain assets in practice.

---

## Solution: Converge

> **Where offchain markets achieve onchain liquidity**

Converge is a fixed-price Uniswap v4 hook that brings atomic onchain liquidity to RWAs (e.g., ACRED, BUIDL, USDY, BTC/ETH ETF) against their mint/redeem asset (e.g., USDC, BTC, ETH) without relying on traditional xyk AMMs. Built as a Uniswap v4 hook, Converge plugs directly into Uniswap's routing and aggregator network.

Converge replaces the bonding curve with oracle-priced swap logic so users can trade an RWA token against its redeem asset at a fixed price. LP capital is not standard Uniswap xyk liquidity — the hook manages deposits directly and uses Uniswap v4 mainly for routing, distribution, flashloans, and custom swap execution.

The design supports flexible compliance modes:

- **Open access** — only the pool is KYC'd mint/redeemer
- **LP-gated** — pool and LP KYC
- **Swapper-gated** — pool, LP, and swapper KYC

---

## High-Level Architecture

### Pool
Atomic, onchain liquidity pool with oracle-rate based swaps. Liquidity in the pool can be allocated to atomically-redeemable yield venues (e.g., Aave lending) to earn extra yield for LPs.

### KYC'd Rebalancer
Mint/redeem of RWA with the issuer to manage target reserves. A permissionless `rebalance()` function manages the pool's liquid reserves by routing mint/redeem flow through the issuer.

### Liquidity Waterfall
If the pool has insufficient liquid reserves to fill a swap or service an LP withdrawal, Converge follows a liquidity waterfall designed to preserve fixed-price execution instead of introducing slippage.

**For swappers:**

1. **Partial fill** — fill the portion that can be settled instantly at the oracle price; isolate the remainder instead of failing the entire order.
2. **Recall yield** — pull idle reserves back from external yield vaults so previously deployed capital can be used for settlement.
3. **Clearing house** — a clearing-house sidecar (e.g., Sky or Infinifi) fronts the missing asset instantly and settles against the RWA through the issuer rail over time, taking a spread in exchange for duration risk.
4. **Revert or async fulfillment** — the atomic swap reverts rather than executing at a worse price. The user can choose to deposit their asset, entering an async redemption queue instead of retrying later.

**For LP withdrawal:**

1. Use liquid pool reserves.
2. Recall capital from yield vaults.
3. Revert instant withdrawal.
4. LP automatically enters an async exit flow and claims once settlement completes.

---

## Stakeholder Impacts

**Swapper** — Instant 1:1 swaps at the oracle price, atomic execution, and no KYC requirement in the open-access mode = best execution.

**LP** — The best onchain RWA yield comes from (a) high swap volume driven by best execution, and (b) rehypothecating LP capital into lending protocols for additional yield. LPs are also protected if an RWA becomes toxic, since that risk is reflected in the oracle price.

**Asset issuer** — Thick atomic liquidity for RWAs enables proper integration into legacy DeFi, where liquidators and flash loans require instant swaps. That drives minting demand and TVL, improves collateral usability, and generates revenue for the issuer.

**Lenders on money markets** — More borrowing demand increases yields for lenders on money markets, expanding onchain GDP.

**BTC/ETH holders** — In-kind contribution for US ETFs enables BTC ETF–BTC pools, creating a completely novel onchain yield source for assets like BTC and ETH.

---

## Flywheel

1. Fixed-price execution gives swappers the best price, so volume naturally routes to Converge.
2. That volume, combined with rehypothecating idle LP capital into yield venues, gives LPs the highest yield and creates the deepest onchain liquidity for RWAs.
3. The best atomic liquidity makes RWAs more usable across DeFi, which drives more adoption and minting, leading to more swap volume, more LP yield, and even thicker pool liquidity.

---

## Fees

Converge uses dynamic congestion fees instead of slippage-heavy AMM pricing. When reserves are healthy, fees stay very low; as liquidity becomes constrained, fees rise to protect LPs and ration scarce liquidity while still preserving fixed-price execution.

---

## How It's Made

### Protocol Architecture

Built as a monorepo with Solidity/Foundry for the protocol and Next.js for the frontend. The core is `ConvergeHook`, a Uniswap v4 hook that intercepts swaps in `beforeSwap` and replaces the normal xyk bonding curve with oracle-priced fixed-rate execution. Instead of letting price move with pool depth, the hook uses an external RWA oracle, applies a congestion-based fee, and returns a custom `BeforeSwapDelta` so the pool behaves like a fixed-price venue inside Uniswap's routing network. Normal v4 LP positions are blocked; liquidity is instead managed through direct hook deposits with internal share accounting.

The protocol is modular by design:

- **`ConvergeHook`** — handles swaps, LP deposits/withdrawals, async swap requests, yield deployment, clearing-house fallback, issuer settlement tracking, and async LP exits.
- **`RegistryKYCPolicy`** — handles compliance, including EIP-712 signed swap authorizations for stricter modes.
- **`ConvergeQuoter`** — provides read-only NAV, fee, quote, and capacity views.
- **`ThresholdRebalanceStrategy`** — computes reserve targets using parameters like `rwaBufferBips`, `redeemBufferBips`, `minRwaReserve`, and `minRedeemReserve`, keeping enough liquidity on hand while deploying excess capital efficiently.

A key implementation detail is the **dual-reserve model**: the hook tracks both ERC20 balances held directly in the contract and ERC6909 claims sitting inside Uniswap's `PoolManager`. Swap inputs accumulate as claims while outputs are paid from liquid ERC20 reserves. When needed, the hook syncs claims back into reserves, recalls capital from a yield vault, or escalates to a clearing-house sidecar to preserve fixed-price execution. If issuer settlement is still pending, users can fall back to async settlement flows rather than forcing slippage.

---

## Partner Integrations

### Chainlink CRE

**Chainlink CRE as Oracle Layer**

Built a Chainlink Runtime Environment workflow for the Apollo Diversified Credit Securitize Fund (ACRED), replacing a mock oracle with a live issuer-backed NAV feed for Converge swaps, deployed on Base Sepolia and wired directly into the hook's oracle interface.

**CRE Workflow:**

1. Pulls ACRED NAV from RedStone's API.
2. Multiple Chainlink DON nodes independently fetch and medianize the result.
3. A signed report is sent through the `KeystoneForwarder` to an onchain oracle consumer.
4. The consumer validates trusted sender, rate bounds, and max deviation per update.
5. Exposes `rate()` and `rateWithTimestamp()` via the same `IRWAOracle` interface used by Converge.

**Why this matters:** Fixed-price RWA swaps need a reliable real-world reference price. CRE provides decentralized, tamper-resistant, serverless oracle updates. Deviation thresholds reduce unnecessary writes and save gas. Because the consumer matches `IRWAOracle`, it can be swapped into any Converge pool with a single `setOracle()` call.

In future, Chainlink CRE can be used to run a keeper that calls `rebalance()` in accordance with results from agentic simulation.

**Chainlink tools used:** Chainlink Runtime Environment (CRE), Chainlink DON, KeystoneForwarder, CRE Oracle Consumer.

---

### Circle & Arc

**Arc Testnet as Primary Chain**

Deployed the full Uniswap v4 stack on Arc (first RWA hook on Arc). USDC is Arc's native gas token — users pay fees in USDC with no ETH needed. A second pool uses Arc's native USDC precompile (`0x3600...`) for real settlement.

**Circle CCTP V2 — Cross-Chain USDC Bridge**

Integrated `TokenMessengerV2.depositForBurn()` directly with no wrapper contracts needed. Supports bidirectional bridging between Arc and Base Sepolia using native USDC burn-and-mint — no wrapped tokens, no bridge risk, no liquidity pools. Users bridge USDC to Arc, then use it in Converge pools for RWA swaps.

**Why this matters for USDC:** Converge creates thick atomic liquidity for RWAs settled in USDC. Every swap generates USDC volume; every LP deposit adds USDC TVL; every clearing house settlement creates USDC flow. CCTP enables cross-chain USDC aggregation, allowing liquidity from any chain to flow into Converge pools on Arc. The more RWAs onboarded, the more USDC demand (minting, settlement, yield deployment).

**Circle tools used:** Arc Testnet, CCTP V2, Native USDC Pool, Circle Faucet.

---

## Appendix: Simulations

### Rebalancing

Target rebalancing parameters based on agentic simulation to maximize LP yield and swap execution:

- Keep **35%** of the pool's total value immediately liquid.
- Split that liquid inventory roughly **50/50** between mint asset and RWA.
- Only rebalance when either side drifts more than **~15%** away from its target.

### LP Yield

Simulator to test how an oracle-priced RWA/USDC pool performs under different liquidity conditions. The model includes adaptive liquidity buffers, sequential trade execution (swap size matters), a 4% baseline lending yield on deployed USDC, clearing-house usage for large redeem-side shortfalls, and LP withdrawal stress.

**Test parameters:** $1.5M–$5.0M pool TVL, 10–35 bps swap fees, ~3.5%–17.0% daily turnover, trade sizes ranging from 0.14% to 5.5% of TVL.

**Results:**

- In normal conditions, LPs earned **~4%–12% annualized** with near-perfect service and full withdrawals.
- **Base case:** at $2.0M TVL and 10 bps, LP return was **6.87%**, driven by both fees and 4% USDC lending yield.
- Higher fees or stronger buy flow pushed LP returns up to **~11.5%–12%** without hurting service much.
- In larger, lower-turnover pools, lending yield mattered more than fees.
- When sell pressure increased, the optimal pool mix shifted heavily toward USDC rather than staying 50/50.
- Extreme stress produced high headline APR but poor service and heavy clearing-house dependence — not a good target state.
