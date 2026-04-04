// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IKYCRegistry
/// @notice On-chain registry of KYC-verified addresses. Managed off-chain by a KYC provider.
interface IKYCRegistry {
    function isVerified(address account) external view returns (bool);
}
