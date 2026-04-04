// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IRWAOracle} from "../interfaces/IRWAOracle.sol";

contract DeployableRWAOracle is IRWAOracle, Ownable {
    uint256 private _rate;
    uint256 private _updatedAt;

    constructor(uint256 initialRate, address owner_) Ownable(owner_) {
        _setRate(initialRate);
    }

    function setRate(uint256 newRate) external onlyOwner {
        _setRate(newRate);
    }

    function rate() external view returns (uint256) {
        return _rate;
    }

    function rateWithTimestamp() external view returns (uint256, uint256) {
        return (_rate, _updatedAt);
    }

    function _setRate(uint256 newRate) internal {
        _rate = newRate;
        _updatedAt = block.timestamp;
    }
}
