// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";

/// @title CREOracleConsumer
/// @notice Oracle for RWA token rates, updated by CRE workflows via the KeystoneForwarder.
///         CRE workflow fetches NAV from issuer API, reaches DON consensus, and submits
///         a signed report containing the new rate.
contract CREOracleConsumer is ReceiverTemplate {
    uint256 public rate;
    uint256 public updatedAt;
    uint256 public minRate;
    uint256 public maxRate;
    uint16 public maxDeviationBips;

    error RateOutOfBounds(uint256 newRate);
    error DeviationTooLarge(uint256 oldRate, uint256 newRate);

    event RateUpdated(uint256 oldRate, uint256 newRate, uint256 timestamp);
    event BoundsUpdated(uint256 minRate, uint256 maxRate, uint16 maxDeviationBips);

    constructor(
        address forwarder,
        uint256 _minRate,
        uint256 _maxRate,
        uint16 _maxDeviationBips
    ) ReceiverTemplate(forwarder) {
        minRate = _minRate;
        maxRate = _maxRate;
        maxDeviationBips = _maxDeviationBips;
    }

    /// @notice Called by ReceiverTemplate after forwarder validation.
    ///         Decodes uint256 rate from the report, validates bounds + deviation, stores it.
    function _processReport(bytes calldata report) internal override {
        uint256 newRate = abi.decode(report, (uint256));

        if (newRate < minRate || newRate > maxRate) revert RateOutOfBounds(newRate);

        uint256 oldRate = rate;
        if (oldRate != 0) {
            uint256 deviation = newRate > oldRate ? newRate - oldRate : oldRate - newRate;
            if (deviation * 10_000 > oldRate * maxDeviationBips) {
                revert DeviationTooLarge(oldRate, newRate);
            }
        }

        emit RateUpdated(oldRate, newRate, block.timestamp);
        rate = newRate;
        updatedAt = block.timestamp;
    }

    /// @notice IRWAOracle-compatible view: returns rate and timestamp.
    function rateWithTimestamp() external view returns (uint256, uint256) {
        return (rate, updatedAt);
    }

    function setBounds(uint256 _minRate, uint256 _maxRate, uint16 _maxDeviationBips) external onlyOwner {
        minRate = _minRate;
        maxRate = _maxRate;
        maxDeviationBips = _maxDeviationBips;
        emit BoundsUpdated(_minRate, _maxRate, _maxDeviationBips);
    }
}
