// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IRWAOracle} from "../interfaces/IRWAOracle.sol";
import {IReceiver} from "../interfaces/IReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CREOracle
/// @notice Oracle for RWA token rates, updated by Chainlink CRE workflows via the
///         KeystoneForwarder. Implements IRWAOracle so it plugs directly into
///         ConvergeHook via `hook.setOracle(creOracle)`.
///
///         Follows the CRE SDK receiver pattern (forwarder validation, ERC-165)
///         while also conforming to IRWAOracle consumed by the hook.
contract CREOracle is IRWAOracle, IReceiver, Ownable {
    address private _forwarder;

    uint256 private _rate;
    uint256 private _updatedAt;

    uint256 public minRate;
    uint256 public maxRate;
    uint16 public maxDeviationBips;

    error InvalidForwarder();
    error InvalidSender(address sender, address expected);
    error RateOutOfBounds(uint256 rate);
    error DeviationTooLarge(uint256 oldRate, uint256 newRate);

    event RateUpdated(uint256 oldRate, uint256 newRate, uint256 timestamp);
    event BoundsUpdated(uint256 minRate, uint256 maxRate, uint16 maxDeviationBips);
    event ForwarderUpdated(address indexed previous, address indexed current);

    constructor(
        address forwarder_,
        uint256 minRate_,
        uint256 maxRate_,
        uint16 maxDeviationBips_,
        address owner_
    ) Ownable(owner_) {
        if (forwarder_ == address(0)) revert InvalidForwarder();
        _forwarder = forwarder_;
        minRate = minRate_;
        maxRate = maxRate_;
        maxDeviationBips = maxDeviationBips_;
    }

    // ─── CRE Receiver ──────────────────────────────────────────────────

    /// @notice Called by the KeystoneForwarder with a signed CRE workflow report.
    ///         Decodes a uint256 rate from the report payload and stores it.
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != _forwarder) revert InvalidSender(msg.sender, _forwarder);

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

    /// @notice ERC-165 interface support (required by CRE KeystoneForwarder).
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == 0x01ffc9a7; // IERC165
    }

    // ─── IRWAOracle ────────────────────────────────────────────────────

    function rate() external view override returns (uint256) {
        return _rate;
    }

    function rateWithTimestamp() external view override returns (uint256, uint256) {
        return (_rate, _updatedAt);
    }

    // ─── Owner ─────────────────────────────────────────────────────────

    function forwarder() external view returns (address) {
        return _forwarder;
    }

    function setForwarder(address forwarder_) external onlyOwner {
        address previous = _forwarder;
        _forwarder = forwarder_;
        emit ForwarderUpdated(previous, forwarder_);
    }

    function setBounds(uint256 minRate_, uint256 maxRate_, uint16 maxDeviationBips_) external onlyOwner {
        minRate = minRate_;
        maxRate = maxRate_;
        maxDeviationBips = maxDeviationBips_;
        emit BoundsUpdated(minRate_, maxRate_, maxDeviationBips_);
    }
}
