// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {ConvergeHook} from "./ConvergeHook.sol";
import {IClearingHouse} from "./interfaces/IClearingHouse.sol";
import {IYieldVault} from "./interfaces/IYieldVault.sol";

/// @title ConvergeQuoter
/// @notice Read-only helper for frontend and offchain quoting against ConvergeHook.
contract ConvergeQuoter {
    uint16 internal constant PENDING_SETTLEMENT_CREDIT_BIPS = 5_000;
    uint256 internal constant MAX_ORACLE_STALENESS = 1 days;

    struct PoolSnapshot {
        uint256 totalValue;
        uint256 totalShares;
        uint256 rwaReserve;
        uint256 redeemReserve;
        uint256 claimsRwa;
        uint256 claimsRedeem;
        uint256 deployedToYield;
        uint256 pendingRwaSentToIssuer;
        uint256 pendingRedeemSentToIssuer;
        uint256 pendingRwaExpectedFromIssuer;
        uint256 pendingRedeemExpectedFromIssuer;
        uint256 pendingAsyncSwapCount;
        uint256 claimableAsyncRwa;
        uint256 claimableAsyncRedeem;
    }

    struct LpSnapshot {
        uint256 shareBalance;
        uint256 shareValue;
        uint256 totalShares;
        uint256 totalValue;
    }

    struct Quote {
        uint256 rate;
        uint256 feeBips;
        uint256 feeAmount;
        uint256 amountOut;
        uint256 maxSwappableAmount;
    }

    error OracleStale();
    error OracleRateOutOfBounds();

    function getPoolSnapshot(ConvergeHook hook) external view returns (PoolSnapshot memory snapshot) {
        snapshot.totalValue = totalValue(hook);
        snapshot.totalShares = hook.totalShares();
        snapshot.rwaReserve = hook.rwaReserve();
        snapshot.redeemReserve = hook.redeemReserve();
        snapshot.claimsRwa = hook.claimsRwa();
        snapshot.claimsRedeem = hook.claimsRedeem();
        snapshot.deployedToYield = hook.deployedToYield();
        snapshot.pendingRwaSentToIssuer = hook.pendingRwaSentToIssuer();
        snapshot.pendingRedeemSentToIssuer = hook.pendingRedeemSentToIssuer();
        snapshot.pendingRwaExpectedFromIssuer = hook.pendingRwaExpectedFromIssuer();
        snapshot.pendingRedeemExpectedFromIssuer = hook.pendingRedeemExpectedFromIssuer();
        snapshot.pendingAsyncSwapCount = hook.pendingAsyncSwapCount();
        snapshot.claimableAsyncRwa = hook.claimableAsyncRwa();
        snapshot.claimableAsyncRedeem = hook.claimableAsyncRedeem();
    }

    function getLpSnapshot(ConvergeHook hook, address lp) external view returns (LpSnapshot memory snapshot) {
        snapshot.shareBalance = hook.shares(lp);
        snapshot.totalShares = hook.totalShares();
        snapshot.totalValue = totalValue(hook);
        if (snapshot.totalShares != 0) {
            snapshot.shareValue = (snapshot.totalValue * snapshot.shareBalance) / snapshot.totalShares;
        }
    }

    function getQuote(ConvergeHook hook, uint256 amountIn, bool swapRwaForRedeem)
        external
        view
        returns (Quote memory quote)
    {
        uint256 rate = _getValidRate(hook);
        uint256 feeBips = _currentFeeBips(hook, swapRwaForRedeem, rate);
        uint256 feeAmount = (amountIn * feeBips) / 10_000;

        quote.rate = rate;
        quote.feeBips = feeBips;
        quote.feeAmount = feeAmount;
        quote.amountOut = _convertWithRate(hook, amountIn - feeAmount, rate, swapRwaForRedeem);
        quote.maxSwappableAmount = _maxSwappableAmount(hook, swapRwaForRedeem, rate);
    }

    function totalValue(ConvergeHook hook) public view returns (uint256) {
        uint256 rate = _getValidRate(hook);
        uint256 totalRwa = hook.rwaReserve() + hook.claimsRwa();
        uint256 rwaValue = _convertWithRate(hook, totalRwa, rate, true);
        uint256 pendingIssuerValue = hook.pendingRedeemExpectedFromIssuer()
            + _convertWithRate(hook, hook.pendingRwaExpectedFromIssuer(), rate, true);
        return hook.redeemReserve() + hook.claimsRedeem() + _yieldVaultBalance(hook) + rwaValue + pendingIssuerValue;
    }

    function shareValue(ConvergeHook hook, address lp) public view returns (uint256) {
        uint256 totalShares = hook.totalShares();
        if (totalShares == 0) return 0;
        return (totalValue(hook) * hook.shares(lp)) / totalShares;
    }

    function maxSwappableAmount(ConvergeHook hook, bool swapRwaForRedeem) public view returns (uint256) {
        return _maxSwappableAmount(hook, swapRwaForRedeem, _getValidRate(hook));
    }

    function currentFeeBips(ConvergeHook hook, bool swapRwaForRedeem) public view returns (uint256) {
        return _currentFeeBips(hook, swapRwaForRedeem, _getValidRate(hook));
    }

    function amountOut(ConvergeHook hook, uint256 amountIn, bool swapRwaForRedeem) public view returns (uint256) {
        uint256 rate = _getValidRate(hook);
        uint256 feeAmount = (amountIn * _currentFeeBips(hook, swapRwaForRedeem, rate)) / 10_000;
        return _convertWithRate(hook, amountIn - feeAmount, rate, swapRwaForRedeem);
    }

    function _yieldVaultBalance(ConvergeHook hook) internal view returns (uint256) {
        IYieldVault yieldVault = hook.yieldVault();
        uint256 deployedToYield = hook.deployedToYield();
        if (address(yieldVault) == address(0) || deployedToYield == 0) return 0;
        return yieldVault.maxWithdraw(address(hook));
    }

    function _getValidRate(ConvergeHook hook) internal view returns (uint256 rate) {
        uint256 updatedAt;
        (rate, updatedAt) = hook.oracle().rateWithTimestamp();
        if (rate == 0) revert OracleRateOutOfBounds();
        if (block.timestamp - updatedAt > MAX_ORACLE_STALENESS) revert OracleStale();
    }

    function _currentFeeBips(ConvergeHook hook, bool swapRwaForRedeem, uint256 rate) internal view returns (uint256) {
        uint256 reserve = swapRwaForRedeem ? _effectiveRedeemReserve(hook) : _effectiveRwaReserve(hook);
        return _congestionFee(hook, reserve);
    }

    function _effectiveRedeemReserve(ConvergeHook hook) internal view returns (uint256) {
        return hook.redeemReserve() + (hook.pendingRedeemExpectedFromIssuer() * PENDING_SETTLEMENT_CREDIT_BIPS) / 10_000;
    }

    function _effectiveRwaReserve(ConvergeHook hook) internal view returns (uint256) {
        return hook.rwaReserve() + (hook.pendingRwaExpectedFromIssuer() * PENDING_SETTLEMENT_CREDIT_BIPS) / 10_000;
    }

    function _maxSwappableAmount(ConvergeHook hook, bool swapRwaForRedeem, uint256 rate)
        internal
        view
        returns (uint256)
    {
        if (swapRwaForRedeem) {
            uint256 totalRedeem = hook.redeemReserve() + _yieldVaultBalance(hook);
            IClearingHouse clearingHouse = hook.clearingHouse();
            if (address(clearingHouse) != address(0)) {
                uint256 maxCollateralizedByWallet = _convertWithRate(hook, hook.rwaReserve(), rate, true);
                uint256 chLiquidity = clearingHouse.availableLiquidity();
                totalRedeem += chLiquidity < maxCollateralizedByWallet ? chLiquidity : maxCollateralizedByWallet;
            }
            return _convertWithRate(hook, totalRedeem, rate, false);
        }

        return _convertWithRate(hook, hook.rwaReserve(), rate, true);
    }

    function _congestionFee(ConvergeHook hook, uint256 reserve) internal view returns (uint256) {
        (uint16 minFeeBips, uint16 maxFeeBips, uint256 lowThreshold, uint256 highThreshold) = hook.feeConfig();
        if (reserve >= highThreshold) return minFeeBips;
        if (reserve <= lowThreshold) return maxFeeBips;
        uint256 range = highThreshold - lowThreshold;
        uint256 position = reserve - lowThreshold;
        uint256 feeRange = maxFeeBips - minFeeBips;
        return maxFeeBips - (position * feeRange) / range;
    }

    function _convertWithRate(ConvergeHook hook, uint256 amount, uint256 rate, bool rwaToRedeem)
        internal
        view
        returns (uint256)
    {
        if (amount == 0) return 0;

        uint256 rwaScale = 10 ** uint256(hook.rwaDecimals());
        uint256 redeemScale = 10 ** uint256(hook.redeemDecimals());

        if (rwaToRedeem) {
            return (amount * rate * redeemScale) / (rwaScale * 1e18);
        }

        return (amount * 1e18 * rwaScale) / (rate * redeemScale);
    }
}
