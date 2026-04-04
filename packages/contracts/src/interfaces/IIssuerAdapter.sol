// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title IIssuerAdapter
/// @notice Bridge from the hook to an issuer mint/redeem rail.
///         The adapter owns the issuer-specific integration details and settlement reporting.
interface IIssuerAdapter {
    /// @notice Request redemption of RWA for the redeem asset.
    ///         Implementations are expected to pull `rwaAmount` from msg.sender.
    function requestRedemption(
        address rwaToken,
        uint256 rwaAmount,
        address recipient,
        uint256 minRedeemOut
    ) external returns (bytes32 requestId);

    /// @notice Request minting of RWA using the redeem asset.
    ///         Implementations are expected to pull `redeemAmount` from msg.sender.
    function requestMint(
        address redeemAsset,
        uint256 redeemAmount,
        address recipient,
        uint256 minRwaOut
    ) external returns (bytes32 requestId);

    /// @notice Returns settlement status and delivered output amount for a request.
    function settlementResult(bytes32 requestId)
        external
        view
        returns (bool settled, uint256 outputAmount, uint256 settledAt);

    /// @notice Expected settlement duration in seconds.
    function expectedSettlementDuration() external view returns (uint256);
}
