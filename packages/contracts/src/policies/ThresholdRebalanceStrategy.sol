// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IRebalanceStrategy} from "../interfaces/IRebalanceStrategy.sol";

/// @title ThresholdRebalanceStrategy
/// @notice Keeps configurable minimum liquid balances and optional buffer ratios
///         against total free assets. This is intentionally simple and acts as a
///         default strategy for many RWA pools.
contract ThresholdRebalanceStrategy is IRebalanceStrategy, Ownable {
    error InvalidConfig();

    event ConfigUpdated(uint16 rwaBufferBips, uint16 redeemBufferBips, uint256 minRwa, uint256 minRedeem);

    uint16 public rwaBufferBips;
    uint16 public redeemBufferBips;
    uint256 public minRwaReserve;
    uint256 public minRedeemReserve;

    constructor(
        uint16 _rwaBufferBips,
        uint16 _redeemBufferBips,
        uint256 _minRwaReserve,
        uint256 _minRedeemReserve,
        address _owner
    ) Ownable(_owner) {
        _setConfig(_rwaBufferBips, _redeemBufferBips, _minRwaReserve, _minRedeemReserve);
    }

    function setConfig(
        uint16 _rwaBufferBips,
        uint16 _redeemBufferBips,
        uint256 _minRwaReserve,
        uint256 _minRedeemReserve
    ) external onlyOwner {
        _setConfig(_rwaBufferBips, _redeemBufferBips, _minRwaReserve, _minRedeemReserve);
    }

    function computeTargets(RebalanceState calldata state)
        external
        view
        returns (uint256 targetRwaReserve, uint256 targetRedeemReserve)
    {
        targetRwaReserve = (state.freeRwaAssets * rwaBufferBips) / 10_000;
        if (targetRwaReserve < minRwaReserve) targetRwaReserve = minRwaReserve;

        targetRedeemReserve = (state.freeRedeemAssets * redeemBufferBips) / 10_000;
        if (targetRedeemReserve < minRedeemReserve) targetRedeemReserve = minRedeemReserve;
    }

    function _setConfig(
        uint16 _rwaBufferBips,
        uint16 _redeemBufferBips,
        uint256 _minRwaReserve,
        uint256 _minRedeemReserve
    ) internal {
        if (_rwaBufferBips > 10_000 || _redeemBufferBips > 10_000) revert InvalidConfig();

        rwaBufferBips = _rwaBufferBips;
        redeemBufferBips = _redeemBufferBips;
        minRwaReserve = _minRwaReserve;
        minRedeemReserve = _minRedeemReserve;

        emit ConfigUpdated(_rwaBufferBips, _redeemBufferBips, _minRwaReserve, _minRedeemReserve);
    }
}
