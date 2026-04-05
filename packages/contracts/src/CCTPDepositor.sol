// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ITokenMessenger
/// @notice Minimal interface for Circle's CCTP TokenMessenger contract.
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);
}

/// @title CCTPDepositor
/// @notice Helper contract deployed on the **source chain** (e.g. Base Sepolia).
///         Allows users to bridge USDC to a destination chain (e.g. Arc) via Circle CCTP.
///         The user calls `bridge()`, USDC is burned on the source chain and Circle
///         mints native USDC on the destination chain to the user's address.
contract CCTPDepositor {
    IERC20 public immutable usdc;
    ITokenMessenger public immutable tokenMessenger;
    uint32 public immutable destinationDomain;

    event BridgeInitiated(
        address indexed sender,
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        uint64 nonce
    );

    constructor(address usdc_, address tokenMessenger_, uint32 destinationDomain_) {
        usdc = IERC20(usdc_);
        tokenMessenger = ITokenMessenger(tokenMessenger_);
        destinationDomain = destinationDomain_;
    }

    /// @notice Bridge USDC to the destination chain. Caller must approve this contract first.
    /// @param amount Amount of USDC to bridge (6 decimals).
    /// @param recipient The recipient address on the destination chain (padded to bytes32).
    function bridge(uint256 amount, address recipient) external returns (uint64 nonce) {
        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(tokenMessenger), amount);

        bytes32 mintRecipient = bytes32(uint256(uint160(recipient)));

        nonce = tokenMessenger.depositForBurn(amount, destinationDomain, mintRecipient, address(usdc));

        emit BridgeInitiated(msg.sender, amount, destinationDomain, mintRecipient, nonce);
    }

    /// @notice Convenience: bridge to msg.sender on the destination chain.
    function bridge(uint256 amount) external returns (uint64 nonce) {
        usdc.transferFrom(msg.sender, address(this), amount);
        usdc.approve(address(tokenMessenger), amount);

        bytes32 mintRecipient = bytes32(uint256(uint160(msg.sender)));

        nonce = tokenMessenger.depositForBurn(amount, destinationDomain, mintRecipient, address(usdc));

        emit BridgeInitiated(msg.sender, amount, destinationDomain, mintRecipient, nonce);
    }
}
