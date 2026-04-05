// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IReceiver
/// @notice Chainlink CRE consumer interface. Contracts implementing this receive
///         signed workflow reports via the KeystoneForwarder.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
