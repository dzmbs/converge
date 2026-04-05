// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IClearingHouse
/// @notice A clearing house (e.g. SKY, Infiniti) that fronts liquidity for non-atomic RWA settlements.
///         When the pool lacks redeemAsset to service a swap, the clearing house provides it instantly
///         and receives RWA collateral in return while the pool rebalances through the issuer rail.
interface IClearingHouse {
    /// @notice Returns the maximum amount of redeemAsset the clearing house can front right now.
    function availableLiquidity() external view returns (uint256);

    /// @notice The clearing house provides `redeemAmount` of redeemAsset to `recipient`,
    ///         and receives `rwaAmount` of rwaToken as collateral.
    /// @param rwaToken     The RWA token address being given as collateral.
    /// @param rwaAmount    Amount of RWA token the clearing house receives.
    /// @param redeemAmount Amount of redeem asset the clearing house pays out.
    /// @param recipient    Who receives the redeem asset.
    /// @return success     Whether the clearing house accepted the deal.
    function settle(
        address rwaToken,
        uint256 rwaAmount,
        uint256 redeemAmount,
        address recipient
    ) external returns (bool success);
}
