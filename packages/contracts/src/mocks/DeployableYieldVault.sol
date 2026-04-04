// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IYieldVault} from "../interfaces/IYieldVault.sol";

contract DeployableYieldVault is IYieldVault, Ownable {
    address public immutable underlyingAsset;
    mapping(address => uint256) public deposited;
    uint256 public yieldAccrued;

    constructor(address asset_, address owner_) Ownable(owner_) {
        underlyingAsset = asset_;
    }

    function asset() external view returns (address) {
        return underlyingAsset;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        IERC20(underlyingAsset).transferFrom(msg.sender, address(this), assets);
        deposited[receiver] += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner_) external returns (uint256) {
        uint256 available = deposited[owner_] + yieldAccrued;
        uint256 withdrawn = assets > available ? available : assets;

        if (withdrawn <= deposited[owner_]) {
            deposited[owner_] -= withdrawn;
        } else {
            uint256 fromYield = withdrawn - deposited[owner_];
            deposited[owner_] = 0;
            yieldAccrued -= fromYield;
        }

        IERC20(underlyingAsset).transfer(receiver, withdrawn);
        return withdrawn;
    }

    function maxWithdraw(address owner_) external view returns (uint256) {
        return deposited[owner_] + yieldAccrued;
    }

    function accrueYield(uint256 amount) external onlyOwner {
        IERC20(underlyingAsset).transferFrom(msg.sender, address(this), amount);
        yieldAccrued += amount;
    }
}
