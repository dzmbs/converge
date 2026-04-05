// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IKYCPolicy
/// @notice Pluggable compliance policy for swap, deposit, and redemption flows.
///         Returning false indicates the action should be rejected by the hook.
interface IKYCPolicy {
    struct SwapValidationContext {
        address router;
        bytes32 poolId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bool zeroForOne;
    }

    struct DirectSwapValidationContext {
        address requester;
        address recipient;
        address hook;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bool swapRwaForRedeem;
    }

    function validateSwap(SwapValidationContext calldata context, bytes calldata hookData) external returns (bool);
    function validateDirectSwap(DirectSwapValidationContext calldata context, bytes calldata authorization)
        external
        returns (bool);
    function validateDeposit(address account) external view returns (bool);
    function validateRedemption(address account) external view returns (bool);
}
