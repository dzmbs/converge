# RWA Hook — Business Specification

## What Is This

A fixed-price AMM for trading Real World Asset tokens (e.g., ACRED, BUIDL, USDY) against their mint/redeem asset (e.g., USDC). Built as a Uniswap v4 hook, meaning it plugs directly into Uniswap's routing and aggregator network while completely replacing the default bonding curve with custom pricing logic.

---

## The Problem

RWA tokens have a known fair price set by their issuer (e.g., 1 ACRED = 1 USDC). Trading them on a traditional AMM like Uniswap v3 creates three problems:

1. **Unnecessary slippage.** The bonding curve charges more for larger trades. A $1M swap might cost 0.5-2% in price impact on an asset that *should* trade at par. Institutions won't accept this.

2. **Poor LP economics.** Stable pairs generate minimal fees from volatility. LPs earn almost nothing, so liquidity stays thin, which makes slippage worse. Death spiral.

3. **No regulatory compliance.** Many RWAs require KYC on holders, liquidity providers, or the pool itself. Uniswap has no concept of identity-gated pools.

4. **No rebalancing mechanism.** When the pool gets lopsided, the only fix is minting/redeeming through the issuer — which takes hours or days. Meanwhile the pool is stuck.

---

## The Solution

### Fixed-Price Swaps

Every swap executes at the oracle-provided rate regardless of trade size. A $100 swap and a $1M swap get the exact same price per token. Zero slippage.

The oracle rate is provided by an external contract (e.g., the RWA issuer's NAV feed). For a 1:1 stablecoin-backed RWA, the rate is simply `1e18`. For yield-bearing RWAs, the rate drifts upward over time as the underlying appreciates.

**What has been implemented:**
- `beforeSwap` hook intercepts every swap and returns a custom `BeforeSwapDelta` that completely bypasses Uniswap's xy=k math
- Conversion functions `_convertRwaToRedeem` and `_convertRedeemToRwa` handle cross-decimal-precision math using the oracle rate
- Only exact-input swaps are supported (user specifies how much they want to sell)

**What has been tested:**
- Fuzz-tested across 256 random amounts (0.001 to 400k tokens) — output always > 0 and < input
- Fuzz-tested that small and large swaps produce identical rates (no slippage property)
- `getAmountOut()` view function matches actual swap output across all oracle rates (0.5x to 2.0x)

---

### Congestion-Based Dynamic Fees

Fees are not fixed. They ramp up as reserves deplete, naturally discouraging trades that would drain the pool.

| Reserve Level | Fee |
|---|---|
| Above `highThreshold` (e.g., 100k) | `minFeeBips` (e.g., 0.01%) |
| Between `lowThreshold` and `highThreshold` | Linear interpolation |
| Below `lowThreshold` (e.g., 1k) | `maxFeeBips` (e.g., 1%) |

This replaces the typical DEX approach of fixed fees. When the pool is healthy, fees are near-zero to attract volume. When reserves are stressed, fees spike to protect LPs.

**What has been implemented:**
- `_congestionFee()` performs linear interpolation between min and max fee based on current reserve level
- Fee applies to the input side of the swap (deducted before conversion)
- Fee config is owner-updatable with validation (min <= max, lowThreshold < highThreshold)

**What has been tested:**
- Fees monotonically increase as reserves drain (never decrease) — tested across 30 sequential swaps
- Fees always within configured [min, max] bounds — fuzz-tested across 256 random states
- Zero-fee config produces exact 1:1 swaps

---

### Three-Tier KYC

The hook supports three compliance modes, configurable by the pool owner:

| Mode | Who Needs KYC | Use Case |
|---|---|---|
| `POOL_ONLY` | Just the pool contract address | Pool is whitelisted with the RWA issuer. Trading is fully permissionless. Lightest compliance. |
| `POOL_AND_LP` | Pool + anyone providing liquidity | LPs must be verified, but anyone can trade. Suitable for securities where holder registration is required but secondary trading is open. |
| `FULL` | Pool + LPs + swappers | Everyone interacting with the pool must be KYC'd. Required for restricted securities. |

KYC status is checked against an on-chain registry (`IKYCRegistry`). The actual identity verification happens off-chain with a KYC provider who writes verified addresses to the registry.

For swapper KYC (`FULL` mode), the user's address is passed via the swap's `hookData` parameter. This requires a trusted router or frontend that encodes `msg.sender` into the hook data.

**What has been implemented:**
- `beforeSwap` checks KYC for `FULL` mode via `hookData`
- `deposit` checks KYC for `POOL_AND_LP` and `FULL` modes
- KYC mode and registry are owner-updatable

**What has been tested:**
- `POOL_ONLY`: unverified users can swap freely
- `POOL_AND_LP`: unverified deposits revert, verified deposits succeed
- `FULL`: unverified swaps revert, verified swaps succeed

---

### LP Deposit & Withdrawal

Liquidity providers deposit RWA tokens and/or redeem assets directly into the hook contract. They receive shares (internal accounting, not an ERC20) proportional to the pool's total value.

**Deposit:**
- Accepts any combination of RWA and redeem asset
- Deposit value is normalized to redeem asset terms using the oracle rate
- First depositor sets the share price; subsequent depositors get proportional shares
- Slippage protection via `minShares` parameter

**Withdrawal:**
- Burns shares and returns pro-rata RWA + redeem asset
- If redeem asset reserves are insufficient (e.g., deployed to yield), automatically recalls from the yield vault
- Slippage protection via `minRwaOut` and `minRedeemOut` parameters
- Deadline parameter prevents stale transactions

**What has been tested:**
- Deposit-withdraw roundtrip returns ~100% of deposited value (within 1%) — fuzz-tested across 256 amounts
- New depositors do not dilute existing LP share value — fuzz-tested across 256 amounts
- Share rates are proportional across different deposit amounts
- LP share value increases over time from accumulated swap fees — verified across 20 sequential swaps

---

### Yield Deployment

Idle redeem asset reserves can be deployed to external yield vaults (ERC4626-compatible) to earn additional return for LPs.

**How it works:**
1. Owner calls `deployToYield(amount)` — moves redeem asset from hook to yield vault
2. Deployed amount is tracked in `deployedToYield` and included in LP share value calculations
3. Owner calls `recallFromYield(amount)` — withdraws from yield vault back to hook
4. On LP withdrawal, if hook doesn't have enough redeem asset, it automatically recalls from the vault

**What has been implemented:**
- `deployToYield` / `recallFromYield` with owner-only access
- Automatic recall during withdrawal when reserves are insufficient
- `deployedToYield` is included in `_totalValue()` so LP share prices reflect deployed capital

**What has been tested:**
- Deploy reduces `redeemReserve`, recall restores it
- Share value unchanged by deployment (capital is moved, not lost)
- Full yield deployment blocks RWA-to-redeem swaps (no available liquidity)
- Withdrawal with most capital deployed to yield succeeds (auto-recall works)
- Reserve accounting matches actual ERC20 balances after yield operations

---

### Clearing House Integration

When the pool lacks sufficient redeem asset to service a swap, a clearing house partner (e.g., SKY, Infiniti) can front the liquidity instantly.

**How it works:**
1. User swaps RWA for redeem asset, but pool doesn't have enough
2. Hook calculates the shortfall
3. Hook sends RWA tokens to the clearing house as collateral
4. Clearing house sends redeem asset back to the hook
5. User receives the full swap output instantly

The clearing house earns yield by holding the RWA through the redemption period. This eliminates the need for receipt tokens or async waiting from the user's perspective.

**Fallback:** If no clearing house is configured, or it declines the settlement, the swap reverts with `InsufficientLiquidity`.

**What has been implemented:**
- `IClearingHouse.settle()` called mid-swap with RWA collateral
- Input tokens are taken from PoolManager *before* clearing house settlement (ordering requirement — the hook needs the tokens to give to the clearing house)
- Graceful fallback: if clearing house returns `false`, swap reverts

**What has been tested:**
- 600k RWA swap against 500k pool succeeds when clearing house covers shortfall
- Pool is fully drained (`redeemReserve = 0`) after clearing house swap
- Failed clearing house results in clean revert
- PoolManager balance unchanged after clearing house swaps (pipeline invariant holds)

---

### Redemption Queue

A FIFO queue for handling non-atomic RWA redemptions as a fallback mechanism.

**How it works:**
1. Owner calls `fulfillRedemptions(amount)` with redeem asset when the RWA issuer completes a redemption
2. Pending requests are fulfilled in order (FIFO)
3. Recipients call `claimRedemption(id)` to collect their tokens

**Current status:** The queue infrastructure is implemented but not yet integrated into the swap flow. It exists as a manual fulfillment mechanism for the owner. In the current implementation, the clearing house handles the instant settlement case, and swaps revert if neither pool reserves nor the clearing house can cover the amount.

---

### Uniswap v4 Integration

The hook uses the following v4 permissions:

| Permission | Purpose |
|---|---|
| `beforeInitialize` | Marks pool as initialized, prevents re-initialization |
| `beforeSwap` | Intercepts swaps, applies fixed pricing + fees + KYC |
| `beforeSwapReturnDelta` | Returns custom delta that bypasses xy=k entirely |
| `beforeAddLiquidity` | Blocks direct `modifyLiquidity` calls (LP must use `deposit()`) |

**Token pipeline:** The PoolManager holds a buffer of both tokens. During a swap, the hook takes input from PM and settles output to PM. The router then settles input to PM and takes output from PM. Net PM balance stays constant — it's just a pipeline.

**What has been tested:**
- PM balance invariant verified across 20 bidirectional swaps
- PM balance invariant holds when all swaps go one direction (drain scenario)
- Proper PM seeding via `unlock` / `settle` / `clear` pattern (using `HookTestRouter`)

---

## Architecture

```
                          UNISWAP V4 POOLMANAGER
                                  │
                     ┌────────────┴────────────┐
                     │       RWAHook            │
                     │                          │
                     │  beforeSwap()            │
                     │  ├─ KYC check            │
                     │  ├─ Fixed-price calc     │
                     │  ├─ Congestion fee       │
                     │  ├─ Reserve update       │
                     │  ├─ Clearing house       │──── IClearingHouse
                     │  └─ Delta accounting     │     (SKY, Infiniti)
                     │                          │
                     │  deposit() / withdraw()  │
                     │  ├─ Share accounting     │
                     │  └─ Auto yield recall    │──── IYieldVault
                     │                          │     (Aave, Morpho, etc.)
                     │  KYC enforcement         │──── IKYCRegistry
                     │  Price feed              │──── IRWAOracle
                     └──────────────────────────┘
```

---

## Contract Inventory

| Contract | Lines | Purpose |
|---|---|---|
| `RWAHook.sol` | ~580 | Core hook: swaps, LP management, yield, clearing house, KYC, fees |
| `IKYCRegistry.sol` | 8 | Interface: on-chain KYC verification |
| `IRWAOracle.sol` | 11 | Interface: RWA exchange rate feed |
| `IClearingHouse.sol` | 22 | Interface: instant settlement for liquidity gaps |
| `IYieldVault.sol` | 17 | Interface: ERC4626-style yield vault |

---

## Test Coverage

### Unit Tests (34 tests)

| Category | Count | Coverage |
|---|---|---|
| Deposits | 6 | Both tokens, slippage protection, deadline, zero amount |
| Withdrawals | 3 | Full, partial, insufficient shares |
| Swaps | 5 | Both directions, fixed price proof, insufficient liquidity, exact output rejection |
| Fees | 1 | Congestion-based fee increase |
| KYC | 5 | All three modes, block and allow scenarios |
| Clearing House | 2 | Shortfall coverage, graceful failure |
| Yield | 4 | Deploy, recall, share value, access control |
| Oracle | 1 | Rate change effects |
| Admin | 4 | Ownership, fee config, validation |
| View Functions | 2 | Total value, amount out prediction |

### Battle Tests (23 tests, ~1,500 fuzz runs)

| Category | Count | What It Proves |
|---|---|---|
| PM Pipeline Invariant | 2 | PoolManager balance unchanged across all swaps |
| Gas Snapshots | 4 | Regression baselines for swap, deposit, withdraw |
| Fuzz: Swap Properties | 2 | Output bounds, direction independence, reserve consistency |
| Fuzz: LP Accounting | 3 | Roundtrip recovery, share proportionality, no dilution |
| Fuzz: Oracle | 1 | View function matches actual swap across all rates |
| Fuzz: Fees | 2 | Monotonicity, bounds |
| Fuzz: Fixed Price | 1 | No size-based slippage |
| Share Value | 1 | LPs earn from swap fees |
| Multi-User Stress | 1 | 5 users, 6 phases: deposit/swap/yield/rate-change/withdraw |
| Clearing House Stress | 1 | Large shortfall with PM invariant check |
| Edge Cases | 5 | Minimum swap, zero fees, yield drain, auto-recall |

### Bugs Found by Tests

1. **Clearing house reserve accounting** — `redeemReserve` was set to a wrong value after clearing house settlement. Fixed to `redeemReserve = 0`.
2. **Withdraw yield recall double-counting** — `_recallFromYield` adds to `redeemReserve`, then withdrawal subtracted the wrong offset. Fixed to subtract `redeemOut` from the updated `redeemReserve`.

---

## What Is NOT Implemented Yet

| Feature | Status | Notes |
|---|---|---|
| Exact-output swaps | Rejected (reverts) | Only exact-input supported |
| ERC20 LP token | Not implemented | Shares are internal accounting only (not transferable) |
| Timelock on admin operations | Not implemented | Owner can change fee config, KYC mode, modules instantly |
| Reentrancy guard | Not implemented | Clearing house call is an external call mid-swap |
| Mixed-decimal testing | Not done | All tests use 18-decimal tokens; 6-decimal USDC needs dedicated testing |
| Hook address mining | Not done | Production deployment needs CREATE2 salt mining for permission-bit-encoded address |
| Fork testing | Not done | Not tested against a real deployed PoolManager |
| Redemption queue integration | Partial | Queue exists but is not triggered by swaps; only manual fulfillment |
| Multi-pool support | Not implemented | One hook instance = one RWA/redeem pair |

---

## Gas Profile

| Operation | Gas |
|---|---|
| Swap (either direction) | ~189k |
| Deposit | ~91k |
| Withdraw | ~98k |

These are within v4's recommended hook gas budgets (target <150k for beforeSwap, hard ceiling 300k with external calls).
