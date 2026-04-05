// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IRWAOracle} from "../interfaces/IRWAOracle.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CREOracle
/// @notice Oracle for RWA token rates, updated by Chainlink CRE workflows via the
///         KeystoneForwarder. Implements IRWAOracle so it can be plugged directly
///         into RWAHook via `hook.setOracle(creOracle)`.
contract CREOracle is IRWAOracle, IReceiver, Ownable {
    address public immutable forwarder;

    uint256 private _rate;
    uint256 private _updatedAt;

    uint256 public minRate;
    uint256 public maxRate;
    uint16 public maxDeviationBips;

    error OnlyForwarder();
    error RateOutOfBounds(uint256 rate);
    error DeviationTooLarge(uint256 oldRate, uint256 newRate);

    event RateUpdated(uint256 oldRate, uint256 newRate, uint256 timestamp);
    event BoundsUpdated(uint256 minRate, uint256 maxRate, uint16 maxDeviationBips);

    constructor(
        address _forwarder,
        uint256 _minRate,
        uint256 _maxRate,
        uint16 _maxDeviationBips,
        address _owner
    ) Ownable(_owner) {
        forwarder = _forwarder;
        minRate = _minRate;
        maxRate = _maxRate;
        maxDeviationBips = _maxDeviationBips;
    }

    /// @notice Called by the KeystoneForwarder with a signed CRE workflow report.
    ///         Decodes a uint256 rate from the report payload and stores it.
    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder) revert OnlyForwarder();

        uint256 newRate = abi.decode(report, (uint256));

        if (newRate < minRate || newRate > maxRate) revert RateOutOfBounds(newRate);

        uint256 oldRate = _rate;
        if (oldRate != 0) {
            uint256 deviation = newRate > oldRate ? newRate - oldRate : oldRate - newRate;
            if (deviation * 10_000 > oldRate * maxDeviationBips) {
                revert DeviationTooLarge(oldRate, newRate);
            }
        }

        emit RateUpdated(oldRate, newRate, block.timestamp);

        _rate = newRate;
        _updatedAt = block.timestamp;
    }

    // ─── IRWAOracle ────────────────────────────────────────────────────

    function rate() external view returns (uint256) {
        return _rate;
    }

    function rateWithTimestamp() external view returns (uint256, uint256) {
        return (_rate, _updatedAt);
    }

    // ─── Owner ─────────────────────────────────────────────────────────

    function setBounds(uint256 _minRate, uint256 _maxRate, uint16 _maxDeviationBips) external onlyOwner {
        minRate = _minRate;
        maxRate = _maxRate;
        maxDeviationBips = _maxDeviationBips;
        emit BoundsUpdated(_minRate, _maxRate, _maxDeviationBips);
    }
}
