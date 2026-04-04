// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IRWAOracle
/// @notice Provides the fixed exchange rate between an RWA token and its mint/redeem asset.
///         For example, 1 ACRED = 1.00 USDC, or could drift if NAV changes.
interface IRWAOracle {
    /// @notice Returns the amount of redeemAsset per 1e18 of rwaToken.
    /// @dev    18-decimal fixed point. E.g. 1e18 means 1:1.
    function rate() external view returns (uint256);

    /// @notice Returns the rate and the timestamp it was last updated.
    /// @dev    Implementations that don't track timestamps can return block.timestamp.
    function rateWithTimestamp() external view returns (uint256 rate, uint256 updatedAt);
}
