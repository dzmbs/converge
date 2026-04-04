// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IYieldVault
/// @notice ERC4626-style vault interface for deploying idle reserves into yield strategies.
interface IYieldVault {
    /// @notice Deposit assets into the vault.
    /// @return shares Amount of vault shares received.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Withdraw assets from the vault.
    /// @return assets Amount of underlying assets received.
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256);

    /// @notice Returns the total underlying assets held for `owner`.
    function maxWithdraw(address owner) external view returns (uint256);

    /// @notice Returns the underlying asset address.
    function asset() external view returns (address);
}
