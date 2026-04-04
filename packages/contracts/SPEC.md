# Converge RWA Hook -- Technical Specification

## What Is This

A fixed-price AMM for trading Real World Asset tokens (e.g., ACRED, BUIDL, USDY) against their mint/redeem asset (e.g., USDC). Built as a Uniswap v4 hook, meaning it plugs directly into Uniswap's routing and aggregator network while completely replacing the default bonding curve with custom pricing logic.

The system handles the full lifecycle of RWA liquidity: LP deposits, oracle-priced swaps, congestion-based dynamic fees, KYC/compliance enforcement via EIP-712-signed swap authorizations, yield deployment of idle reserves, clearing house integration for instant settlement of shortfalls, an IOU-based redemption queue for non-atomic redemptions, automated rebalancing via pluggable strategies with issuer mint/redeem rails, and epoch-based async LP exits for safe withdrawals during pending issuer settlements.

---

## The Problem

RWA tokens have a known fair price set by their issuer (e.g., 1 ACRED = 1 USDC). Trading them on a traditional AMM like Uniswap v3 creates four problems:

1. **Unnecessary slippage.** The bonding curve charges more for larger trades. A $1M swap might cost 0.5-2% in price impact on an asset that should trade at par. Institutions will not accept this.

2. **Poor LP economics.** Stable pairs generate minimal fees from volatility. LPs earn almost nothing, so liquidity stays thin, which makes slippage worse. Death spiral.

3. **No regulatory compliance.** Many RWAs require KYC on holders, liquidity providers, or the pool itself. Uniswap has no concept of identity-gated pools.

4. **No rebalancing mechanism.** When the pool gets lopsided, the only fix is minting/redeeming through the issuer -- which takes hours or days. Meanwhile the pool is stuck.

---

## The Solution

### Fixed-Price Swaps

Every swap executes at the oracle-provided rate regardless of trade size. A $100 swap and a $1M swap get the exact same price per token. Zero slippage.

The oracle rate is provided by an external contract implementing `IRWAOracle`. For a 1:1 stablecoin-backed RWA, the rate is simply `1e18`. For yield-bearing RWAs, the rate drifts upward over time as the underlying appreciates.

**How it works:**

- `_beforeSwap` intercepts every swap and returns a custom `BeforeSwapDelta` that completely bypasses Uniswap's xy=k math
- `_convertWithRate(amount, rate, rwaToRedeem)` handles cross-decimal-precision math using the oracle rate. For rwaToRedeem: `(amount * rate * 10^redeemDecimals) / (10^rwaDecimals * 1e18)`. For the reverse: `(amount * 1e18 * 10^rwaDecimals) / (rate * 10^redeemDecimals)`
- Only exact-input swaps are supported (`params.amountSpecified < 0`). Exact-output reverts with `ExactOutputNotSupported`
- Oracle staleness is enforced via `MAX_ORACLE_STALENESS = 1 days`. Rate of zero reverts with `OracleRateOutOfBounds`

**Token pipeline (AsyncSwap / Custom Curve pattern):**

- INPUT: hook calls `poolManager.mint()` to create ERC6909 claims. The router settles the user's real tokens to PM after `beforeSwap` returns
- OUTPUT: hook calls `poolManager.sync()` then `_safeTransfer` to PM then `poolManager.settle()` to deliver real ERC20 tokens
- Net PM balance stays constant -- it is a pipeline, not a vault

**What has been tested:**
- Fuzz-tested across random amounts (1 to 400k tokens) -- output always > 0 and <= input at 1:1 rate (`test_fuzz_swap_output_bounds`)
- Fuzz-tested that small and large swaps produce identical rates (`test_fuzz_no_slippage`, `test_swap_fixedPrice_noSlippage`)
- `getAmountOut()` view function matches actual swap output across oracle rates 0.5x to 2.0x (`test_fuzz_oracle_rate_consistency`)

---

### Congestion-Based Dynamic Fees

Fees ramp up as reserves deplete, naturally discouraging trades that would drain the pool.

| Reserve Level | Fee |
|---|---|
| Above `highThreshold` (e.g., 100k) | `minFeeBips` (e.g., 0.01%) |
| Between `lowThreshold` and `highThreshold` | Linear interpolation |
| Below `lowThreshold` (e.g., 1k) | `maxFeeBips` (e.g., 1%) |

The effective reserve used for fee calculation includes a credit for pending issuer settlements at 50% (`PENDING_SETTLEMENT_CREDIT_BIPS = 5_000`). `_effectiveRedeemReserve` returns `redeemReserve + (pendingRedeemExpectedFromIssuer * 5000) / 10000`, and `_effectiveRwaReserve` does likewise for the RWA side.

**What has been implemented:**
- `_congestionFee(reserve)` performs linear interpolation between min and max fee based on current reserve level
- Fee applies to the input side of the swap (deducted before conversion)
- Fee config is owner-updatable via `setFeeConfig(FeeConfig)` with validation: `min <= max`, `max <= 10000`, `lowThreshold < highThreshold`

**What has been tested:**
- Fees monotonically increase as reserves drain -- tested across 30 sequential swaps (`test_fee_monotonically_increases_as_reserves_drain`)
- Fees always within configured [min, max] bounds -- fuzz-tested (`test_fuzz_fee_always_within_bounds`)
- Zero-fee config produces exact 1:1 swaps (`test_edge_zero_fee_swap`)
- Pending issuer mint credits reduce congestion fee (`test_getCurrentFee_creditsPendingIssuerMint`)

---

### Pluggable KYC Policy

Compliance is handled by an external `IKYCPolicy` contract. The hook delegates all authorization decisions to the policy. The policy interface has three methods:

- `validateSwap(SwapValidationContext, hookData)` -- called during `_beforeSwap` if a policy is set
- `validateDeposit(account)` -- called during `deposit`
- `validateRedemption(account)` -- called during `requestRedemption`

The shipped policy implementation is `RegistryKYCPolicy`, which supports three modes:

| Mode | Behavior |
|---|---|
| `NONE` | All actions permitted. Swap validation always returns true. Deposit/redemption validation always returns true. |
| `LP_ONLY` | Swaps are unrestricted. Deposits and redemptions require the caller to be verified in the `IKYCRegistry`. |
| `FULL_COMPLIANCE_SIGNER` | Deposits and redemptions require registry verification. Swaps require an EIP-712 signed `SwapAuthorization` from an approved compliance signer, passed via `hookData`. |

**SwapAuthorization (EIP-712 signed struct):**
- Fields: `swapper`, `hook`, `poolId`, `router`, `tokenIn`, `tokenOut`, `amountIn`, `zeroForOne`, `nonce`, `deadline`
- The policy verifies the swap router is trusted (`trustedRouters[router]`), the compliance signer is approved (`complianceSigners[signer]`), the authorization is not expired, the nonce is correct, every field matches the actual swap context, and the EIP-712 signature is valid
- Nonces are incremented per-swapper to prevent replay

**What has been tested:**
- `NONE` mode: unverified users can swap freely (`test_kyc_poolOnly_anyoneCanSwap`)
- `LP_ONLY` mode: unverified deposits revert, verified deposits succeed (`test_kyc_poolAndLP_blocksNonKYCDeposit`, `test_kyc_poolAndLP_allowsKYCDeposit`)
- `FULL_COMPLIANCE_SIGNER` mode: untrusted router blocked (`test_kyc_full_blocksUntrustedRouter`), authorized swap succeeds (`test_kyc_full_allowsKYCSwap`), wrong swapper blocked (`test_kyc_full_blocksUnauthorizedSwapper`), replay blocked (`test_kyc_full_blocksReplay`), wrong amount blocked (`test_kyc_full_blocksWrongAmountSignature`), untrusted compliance signer blocked (`test_kyc_full_blocksUntrustedComplianceSigner`)

---

### LP Deposit and Withdrawal

Liquidity providers deposit RWA tokens and/or redeem assets directly into the hook contract. They receive shares (internal accounting, not an ERC20) proportional to the pool's total value.

**Deposit -- `deposit(rwaAmount, redeemAmount, minShares, deadline)`:**
- Accepts any combination of RWA and redeem asset
- Deposit value is normalized to redeem asset terms using the oracle rate
- First depositor: `MINIMUM_SHARES = 1000` are locked to `address(1)` as dead shares. Depositor receives `depositValue - MINIMUM_SHARES`
- Subsequent depositors: `newShares = (depositValue * totalShares) / preDepositValue`
- Slippage protection via `minShares` parameter
- KYC check if policy is set

**Withdrawal -- `withdraw(sharesToBurn, minRwaOut, minRedeemOut, deadline)`:**
- Burns shares and returns pro-rata RWA + redeem asset. Total reserves include both ERC20 balances and ERC6909 claims: `totalRwa = rwaReserve + claimsRwa`, `totalRedeem = redeemReserve + claimsRedeem + yieldBalance`
- If ERC20 balances are insufficient, calls `_ensureRwaLiquidity` / `_ensureRedeemLiquidity` which: (1) sync claims from PM via `unlockCallback`, (2) recall from yield vault
- Slippage protection via `minRwaOut` and `minRedeemOut`
- Blocked while issuer settlements are pending (`ActiveSettlementsPending`)

**Async LP Exit -- `requestWithdraw(sharesToQueue)` / `processExitEpoch(epochId)` / `claimExit(epochId)`:**
- For use when instant withdrawal is blocked by pending issuer settlements
- `requestWithdraw` moves shares from the user to the current exit epoch
- `processExitEpoch` finalizes completed settlements, syncs all claims, recalls all yield, reserves pro-rata tokens for the epoch's total shares, and registers the epoch's claim on any remaining active settlements
- `claimExit` distributes the epoch's reserved tokens to the user proportionally. Blocked while the epoch still has pending settlements (`pendingSettlementCount > 0`)

**What has been tested:**
- Deposit-withdraw roundtrip returns ~100% of deposited value within 1% (`test_fuzz_deposit_withdraw_roundtrip`)
- New depositors do not dilute existing LP share value (`test_fuzz_new_depositor_no_dilution`)
- Share rates proportional across different deposit amounts (`test_fuzz_deposit_share_proportionality`)
- LP share value increases over time from accumulated swap fees (`test_share_value_accrues_from_fees`)
- Withdraw blocked during pending settlements (`test_withdraw_revertsWhileIssuerSettlementPending`)
- Async exit waits for settlement then claims (`test_asyncExit_waitsForIssuerSettlementThenClaims`)

---

### Dual Reserve Model: ERC20 and ERC6909 Claims

The hook tracks two types of reserves:

- **ERC20 balances** held directly in the hook's wallet (from LP deposits, clearing house, yield recalls). Tracked as `rwaReserve` / `redeemReserve`
- **ERC6909 claims** held in the PoolManager (from swap inputs via `poolManager.mint()`). Tracked as `claimsRwa` / `claimsRedeem`

Swap outputs are always paid from ERC20 reserves. Swap inputs accumulate as ERC6909 claims. Claims can be converted to ERC20 via `syncClaimsToReserves(token, amount)` (public, callable by anyone) which calls `poolManager.unlock()` triggering `unlockCallback` to `burn` claims and `take` real tokens.

`_ensureRwaLiquidity` and `_ensureRedeemLiquidity` handle automatic conversion during withdrawals and issuer operations: sync claims first, then recall from yield if needed.

**What has been tested:**
- Claims accumulate from swaps (`test_claims_accumulateFromSwaps`)
- Claims sync restores reserves (`test_claims_withdraw`)

---

### IOU Redemption Queue

A mechanism for non-atomic RWA redemptions where users receive transferable IOU tokens.

**Flow:**
1. User calls `requestRedemption(rwaAmount)` -- transfers RWA to hook, mints IOUs at oracle rate via `IOUToken.mint()`. RWA goes to `rwaRedemptionReserve` (separate from LP reserves). Amount tracked in `totalPendingRedemptions`
2. Owner calls `resolveIOUs(amount)` -- deposits redeem asset into `iouReserve`, decrements `totalPendingRedemptions`
3. User calls `redeemIOU(iouAmount)` -- burns IOUs, sends redeem asset from `iouReserve` 1:1
4. Alternatively, owner calls `airdropAndBurnIOUs(holders[])` -- batch burn and payout

**IOUToken:**
- Minimal ERC20 (76 lines). Only the hook can mint/burn (`onlyHook` modifier)
- Transferable -- IOUs can be traded on secondary markets
- Decimals match the redeem asset

**Redemption collateral:**
- `rwaRedemptionReserve` tracks RWA locked for pending redemptions, separate from LP reserves
- Owner can move collateral off-chain via `transferRedemptionCollateral(recipient, amount)` for issuer settlement
- Redemption collateral is NOT included in LP value calculations (`_totalValueWithRate` does not include `rwaRedemptionReserve`)

**What has been tested:**
- Full request-resolve-redeem cycle (`test_iou_requestAndRedeem`)
- Batch airdrop (`test_iou_airdrop`)
- IOU transferability (`test_iou_transferable`)
- Cannot redeem before resolve (`test_iou_cannotRedeemBeforeResolve`)
- Pending redemption collateral not included in LP value (`test_pendingRedemptionCollateral_notIncludedInLpValue`)

---

### Yield Deployment

Idle redeem asset reserves can be deployed to external yield vaults (ERC4626-compatible) to earn additional return for LPs.

**Functions:**
- `deployToYield(amount)` -- owner-only. Moves redeem asset from hook to yield vault. Decrements `redeemReserve`, increments `deployedToYield`
- `recallFromYield(amount)` -- owner-only. Withdraws from yield vault back to hook
- `_recallFromYield(amount)` -- internal. Called automatically during swaps and withdrawals when reserves are insufficient
- `_yieldVaultBalance()` -- queries `yieldVault.maxWithdraw(address(this))`. Returns 0 if no vault or nothing deployed

Deployed capital is included in LP share value calculations (`_totalValueWithRate` includes `yieldBalance`). The vault can be swapped via `setYieldVault` only when `deployedToYield == 0`.

**What has been tested:**
- Deploy reduces `redeemReserve`, recall restores it (`test_yield_deploy`, `test_yield_recall`)
- Share value unchanged by deployment (`test_yield_includesInShareValue`)
- Owner-only access control (`test_yield_onlyOwner`)
- Auto-recall during swap (`test_edge_yield_deploy_swap_recalls_automatically`)
- Auto-recall during withdrawal (`test_edge_yield_recall_on_withdraw`)
- Yield accrual reflected in share value (`test_adversarial_yieldAccrual_reflected_in_shares`)
- Yield accrual is withdrawable (`test_adversarial_yieldAccrual_withdrawable`)

---

### Clearing House Integration

When the pool lacks sufficient redeem asset to service a swap, a clearing house partner (e.g., SKY, Infiniti) can front the liquidity instantly.

**Flow (within `_beforeSwap` for RWA-to-redeem swaps):**
1. Calculate `amountOut`. If `amountOut > redeemReserve`, compute `shortfall`
2. First try to recall from yield vault (waterfall)
3. If shortfall remains and clearing house is set: compute `rwaForClearing = _convertWithRate(shortfall, rate, false)`
4. Approve and call `clearingHouse.settle(rwaToken, rwaForClearing, shortfall, address(this))`
5. Verify `received >= shortfall` or revert with `ClearingHousePaymentFailed`
6. Update: `rwaReserve -= rwaForClearing`, `redeemReserve = 0`

If no clearing house is configured, or it returns `false`, the swap reverts with `InsufficientLiquidity`.

**What has been tested:**
- Swap with insufficient liquidity reverts (`test_swap_insufficientLiquidity`)
- Yield recall covers shortfall mid-swap (`test_swap_yieldRecall_coversShortfall`)

---

### Automated Rebalancing with Issuer Adapter

The `rebalance()` function (publicly callable) syncs claims, recalls yield, and initiates issuer mint/redeem operations to bring reserves toward strategy targets.

**Rebalance flow:**
1. Finalize any completed issuer settlements
2. Build `RebalanceState` struct with all reserve, claims, yield, and pending issuer data
3. Call `rebalanceStrategy.computeTargets(state)` to get `targetRwaReserve` and `targetRedeemReserve`
4. Sync claims from PM if reserves are below target
5. Recall from yield if redeem reserves are still below target
6. If `issuerAdapter` is set:
   - If effective redeem assets < target and free RWA > target: initiate issuer redemption (sell RWA for redeem)
   - If effective RWA < target and free redeem > target: initiate issuer mint (buy RWA with redeem)
7. If redeem reserves exceed target and yield vault is set: deploy excess to yield

**ThresholdRebalanceStrategy:**
- `computeTargets` returns `max(freeAssets * bufferBips / 10000, minReserve)` for each side
- Config: `rwaBufferBips`, `redeemBufferBips`, `minRwaReserve`, `minRedeemReserve`
- Owner-updatable via `setConfig`

**IssuerAdapter interface:**
- `requestRedemption(rwaToken, rwaAmount, recipient, minRedeemOut)` -- sends RWA, returns `requestId`
- `requestMint(redeemAsset, redeemAmount, recipient, minRwaOut)` -- sends redeem, returns `requestId`
- `settlementResult(requestId)` -- returns `(settled, outputAmount, settledAt)`

**Settlement tracking:**
- `ActiveSettlement` struct records `requestId`, `isMint`, `inputAmount`, `expectedOutputAmount`, `requestRate`, `initiatedAt`
- `activeSettlementIds[]` array with O(1) removal via swap-and-pop
- `pendingRwaSentToIssuer`, `pendingRedeemSentToIssuer`, `pendingRwaExpectedFromIssuer`, `pendingRedeemExpectedFromIssuer` track in-flight amounts
- Pending expected values are included in `_totalValueWithRate` so LP share prices remain accurate during settlements
- `_finalizeSettlement` distributes output proportionally between the live pool and any processed exit epochs that claimed the settlement

**What has been tested:**
- Rebalance syncs claims and redeploys excess (`test_rebalance_syncsClaimsAndRedeploysExcess`)
- Rebalance initiates issuer mint for RWA shortfall (`test_rebalance_initiatesIssuerMint_forRwaShortfall`)
- Rebalance initiates issuer redemption for redeem shortfall (`test_rebalance_initiatesIssuerRedemption_forRedeemShortfall`)
- Settlement finalization adds reserves (`test_finalizeSettlement_addsRwaReserve`)
- Rebalance does not overcorrect with pending mint (`test_rebalance_doesNotOvercorrectWithPendingMint`)
- LP value preserved through rebalance cycle

---

### Uniswap v4 Integration

The hook uses the following v4 permissions:

| Permission | Purpose |
|---|---|
| `beforeInitialize` | Validates token pair matches `rwaToken`/`redeemAsset`, marks pool as initialized, prevents re-initialization |
| `beforeSwap` | Intercepts swaps, applies fixed pricing + fees + KYC, returns custom `BeforeSwapDelta` |
| `beforeSwapReturnDelta` | Returns custom delta that bypasses xy=k entirely |
| `beforeAddLiquidity` | Reverts with `HookNotImplemented` -- LP must use `deposit()` |
| `beforeRemoveLiquidity` | Reverts with `HookNotImplemented` -- LP must use `withdraw()` |

**Two-step ownership transfer:**
- `proposeOwnership(newOwner)` sets `pendingOwner`
- `acceptOwnership()` callable only by `pendingOwner`, calls `_transferOwnership`

**What has been tested:**
- Pool hijack with wrong tokens blocked (`test_adversarial_poolHijack_blocked`)
- Two-step ownership works (`test_admin_twoStepOwnership`)
- Owner-only access enforced (`test_admin_onlyOwner`)

---

## Architecture

```
                          UNISWAP V4 POOLMANAGER
                                  |
                     +------------+------------+
                     |       RWAHook            |
                     |                          |
                     |  _beforeSwap()           |
                     |  +- KYC policy check     |---- IKYCPolicy
                     |  +- Fixed-price calc     |     +-- RegistryKYCPolicy
                     |  +- Congestion fee       |         +-- IKYCRegistry
                     |  +- ERC6909 claim mint   |         +-- EIP-712 signer auth
                     |  +- Reserve waterfall    |
                     |  |  +- ERC20 reserve     |
                     |  |  +- Yield vault       |---- IYieldVault (ERC4626)
                     |  |  +- Clearing house    |---- IClearingHouse
                     |  +- PM settle pipeline   |
                     |                          |
                     |  deposit() / withdraw()  |
                     |  +- Share accounting     |
                     |  +- Auto claim sync      |
                     |  +- Auto yield recall    |
                     |                          |
                     |  requestWithdraw()       |
                     |  processExitEpoch()      |
                     |  claimExit()             |
                     |  +- Epoch segregation    |
                     |  +- Settlement tracking  |
                     |                          |
                     |  requestRedemption()     |
                     |  resolveIOUs()           |---- IOUToken (ERC20)
                     |  redeemIOU()             |
                     |  airdropAndBurnIOUs()    |
                     |                          |
                     |  rebalance()             |---- IRebalanceStrategy
                     |  +- Claim sync           |     +-- ThresholdRebalanceStrategy
                     |  +- Yield recall/deploy  |
                     |  +- Issuer mint/redeem   |---- IIssuerAdapter
                     |  +- Settlement finalize  |
                     |                          |
                     |  Price feed              |---- IRWAOracle
                     +--+--+--+--+--+--+--+--+-+
```

---

## Contract Inventory

| Contract | Lines | Purpose |
|---|---|---|
| `RWAHook.sol` | 1141 | Core hook: swaps, LP management, dual reserve model, yield, clearing house, IOU redemption, rebalancing, issuer settlement, async exits, KYC enforcement, fees |
| `IOUToken.sol` | 76 | Minimal ERC20 receipt token for non-atomic redemptions. Hook-only mint/burn |
| `RegistryKYCPolicy.sol` | 148 | Registry-backed KYC policy with three modes (NONE, LP_ONLY, FULL_COMPLIANCE_SIGNER). EIP-712 signed swap authorizations |
| `ThresholdRebalanceStrategy.sol` | 68 | Configurable minimum reserves + buffer ratios for rebalancing |
| `IKYCPolicy.sol` | 20 | Interface: pluggable compliance policy with swap/deposit/redemption validation |
| `IKYCRegistry.sol` | 8 | Interface: on-chain KYC verification registry |
| `IRWAOracle.sol` | 15 | Interface: RWA exchange rate feed with staleness tracking |
| `IClearingHouse.sol` | 25 | Interface: instant settlement for liquidity gaps |
| `IYieldVault.sol` | 20 | Interface: ERC4626-style yield vault |
| `IRebalanceStrategy.sol` | 28 | Interface: rebalance target computation with full state input |
| `IIssuerAdapter.sol` | 34 | Interface: issuer mint/redeem rail with settlement tracking |

**Total source:** ~1583 lines across 11 contracts/interfaces.
**Test file:** 1474 lines (`RWAHook.t.sol`) plus test utilities.

---

## Test Coverage

### 71 Tests Total

| Category | Count | Tests |
|---|---|---|
| Deposits | 6 | `test_deposit_redeemOnly`, `test_deposit_rwaOnly`, `test_deposit_zeroAmount_reverts`, `test_deposit_both`, `test_deposit_deadlineExpired`, `test_deposit_slippageProtection` |
| Withdrawals | 3 | `test_withdraw_full`, `test_withdraw_partial`, `test_withdraw_insufficientShares` |
| Swaps | 5 | `test_swap_redeemForRwa`, `test_swap_rwaForRedeem`, `test_swap_fixedPrice_noSlippage`, `test_swap_insufficientLiquidity`, `test_swap_yieldRecall_coversShortfall` |
| Fees | 2 | `test_fee_congestionBased`, `test_fee_monotonically_increases_as_reserves_drain` |
| KYC (basic) | 3 | `test_kyc_poolOnly_anyoneCanSwap`, `test_kyc_poolAndLP_blocksNonKYCDeposit`, `test_kyc_poolAndLP_allowsKYCDeposit` |
| KYC (full compliance signer) | 6 | `test_kyc_full_blocksUntrustedRouter`, `test_kyc_full_allowsKYCSwap`, `test_kyc_full_blocksUnauthorizedSwapper`, `test_kyc_full_blocksReplay`, `test_kyc_full_blocksWrongAmountSignature`, `test_kyc_full_blocksUntrustedComplianceSigner` |
| IOU Redemption | 4 | `test_iou_requestAndRedeem`, `test_iou_airdrop`, `test_iou_transferable`, `test_iou_cannotRedeemBeforeResolve` |
| Yield | 4 | `test_yield_deploy`, `test_yield_recall`, `test_yield_includesInShareValue`, `test_yield_onlyOwner` |
| Oracle | 1 | `test_oracle_rateChange` |
| Admin | 4 | `test_admin_twoStepOwnership`, `test_admin_onlyOwner`, `test_admin_setFeeConfig`, `test_admin_invalidFeeConfig` |
| Claims Management | 2 | `test_claims_accumulateFromSwaps`, `test_claims_withdraw` |
| View Functions | 3 | `test_totalValue`, `test_getAmountOut`, `test_maxSwappableAmount` |
| Share Value | 2 | `test_share_value_accrues_from_fees`, `test_pendingRedemptionCollateral_notIncludedInLpValue` |
| Fuzz | 8 | `test_fuzz_swap_output_bounds`, `test_fuzz_deposit_withdraw_roundtrip`, `test_fuzz_no_slippage`, `test_fuzz_new_depositor_no_dilution`, `test_fuzz_swap_both_directions`, `test_fuzz_deposit_share_proportionality`, `test_fuzz_fee_always_within_bounds`, `test_fuzz_oracle_rate_consistency` |
| Edge Cases | 5 | `test_edge_minimum_swap`, `test_edge_zero_fee_swap`, `test_edge_deposit_then_swap_then_withdraw`, `test_edge_yield_deploy_swap_recalls_automatically`, `test_edge_yield_recall_on_withdraw` |
| Adversarial | 3 | `test_adversarial_poolHijack_blocked`, `test_adversarial_yieldAccrual_reflected_in_shares`, `test_adversarial_yieldAccrual_withdrawable` |
| Multi-User Stress | 1 | `test_multiUser_full_lifecycle` (4 users, 6 phases: deposit/swap/yield/oracle-change/more-swaps/recall-and-withdraw) |
| Rebalance + Issuer | 7 | `test_rebalance_syncsClaimsAndRedeploysExcess`, `test_rebalance_initiatesIssuerMint_forRwaShortfall`, `test_finalizeSettlement_addsRwaReserve`, `test_rebalance_doesNotOvercorrectWithPendingMint`, `test_rebalance_initiatesIssuerRedemption_forRedeemShortfall`, `test_getCurrentFee_creditsPendingIssuerMint`, `test_withdraw_revertsWhileIssuerSettlementPending` |
| Async Exit | 1 | `test_asyncExit_waitsForIssuerSettlementThenClaims` |
| Gas Snapshots | 2 | `test_gas_swap`, `test_gas_deposit` |

---

## Gas Profile

Measured via `vm.snapshotGasLastCall` in Foundry:

| Operation | Gas (RWAHookTest) | Gas (RWAHookBattleTest) |
|---|---|---|
| Swap (redeem for RWA, 10k) | 172,752 | 177,326 |
| Swap (RWA for redeem, 10k) | -- | 177,304 |
| Swap (minimum amount) | -- | 177,326 |
| Deposit (100k redeem) | 93,679 | 85,217 |
| Withdraw (all shares) | -- | 32,370 |

These are within v4's recommended hook gas budgets (target <150k for beforeSwap, hard ceiling 300k with external calls). Swap gas includes the full `_beforeSwap` path with oracle check, fee calculation, claim minting, reserve update, and PM settlement.

---

## What Is NOT Implemented Yet

| Feature | Status | Notes |
|---|---|---|
| Exact-output swaps | Rejected (reverts) | Only exact-input supported. `params.amountSpecified >= 0` reverts with `ExactOutputNotSupported` |
| ERC20 LP token | Not implemented | Shares are internal accounting only (`mapping(address => uint256) shares`), not transferable |
| Timelock on admin operations | Not implemented | Owner can change fee config, KYC policy, oracle, modules, and yield vault instantly |
| Mixed-decimal testing | Not done | All tests use 18-decimal tokens; 6-decimal USDC needs dedicated testing. Conversion math supports it via `rwaDecimals`/`redeemDecimals` |
| Hook address mining | Not done | Production deployment needs CREATE2 salt mining for permission-bit-encoded address. Tests use `deployCodeTo` |
| Fork testing | Not done | Not tested against a real deployed PoolManager or production issuer adapters |
| Multi-pool support | Not implemented | One hook instance = one RWA/redeem pair. `poolInitialized` flag prevents re-initialization |
| Clearing house integration test | Partial | `IClearingHouse` integration is coded in swap flow but no dedicated clearing house mock test exists in the current test file. The waterfall works (yield recall is tested) but the clearing house branch is only indirectly tested via `test_swap_insufficientLiquidity` |
| Exit epoch edge cases | Minimal | Only one test (`test_asyncExit_waitsForIssuerSettlementThenClaims`). Multi-user epoch exits, partial claims, and epoch rollover are not tested |
| Issuer adapter fuzz testing | Not done | Rebalance + settlement tests are deterministic only. No fuzz testing of settlement amounts, partial fills, or timing |
| Fee-on-transfer token support | Not implemented | `_safeTransfer`/`_safeTransferFrom` do not account for transfer fees |
