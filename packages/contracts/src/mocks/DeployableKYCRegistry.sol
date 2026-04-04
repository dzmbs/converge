// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";

contract DeployableKYCRegistry is IKYCRegistry, Ownable {
    mapping(address => bool) public verified;

    constructor(address owner_) Ownable(owner_) {}

    function setVerified(address account, bool status) external onlyOwner {
        verified[account] = status;
    }

    function isVerified(address account) external view returns (bool) {
        return verified[account];
    }
}
