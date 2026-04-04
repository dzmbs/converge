// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IRebalanceStrategy
/// @notice Strategy contract that computes target liquid reserves for the hook.
///         The hook remains the executor; the strategy only returns targets.
interface IRebalanceStrategy {
    struct RebalanceState {
        uint256 rwaReserve;
        uint256 redeemReserve;
        uint256 claimsRwa;
        uint256 claimsRedeem;
        uint256 deployedToYield;
        uint256 pendingRwaSentToIssuer;
        uint256 pendingRedeemSentToIssuer;
        uint256 pendingRwaExpectedFromIssuer;
        uint256 pendingRedeemExpectedFromIssuer;
        uint256 freeRwaAssets;
        uint256 freeRedeemAssets;
        uint256 totalManagedValueInRedeem;
        uint256 rate;
    }

    function computeTargets(RebalanceState calldata state)
        external
        view
        returns (uint256 targetRwaReserve, uint256 targetRedeemReserve);
}
