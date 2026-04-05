// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DemoFaucet
/// @notice Distributes test tokens (USDC + RWA) for hackathon demo purposes.
contract DemoFaucet is Ownable {
    IERC20 public immutable usdc;
    IERC20 public immutable rwaToken;

    uint256 public usdcAmount;
    uint256 public rwaAmount;
    uint256 public cooldown;

    mapping(address => uint256) public lastClaim;

    event Claimed(address indexed user, uint256 usdcAmt, uint256 rwaAmt);
    event Configured(uint256 usdcAmount, uint256 rwaAmount, uint256 cooldown);

    constructor(
        address usdc_,
        address rwaToken_,
        uint256 usdcAmount_,
        uint256 rwaAmount_,
        uint256 cooldown_,
        address owner_
    ) Ownable(owner_) {
        usdc = IERC20(usdc_);
        rwaToken = IERC20(rwaToken_);
        usdcAmount = usdcAmount_;
        rwaAmount = rwaAmount_;
        cooldown = cooldown_;
    }

    function claim() external {
        require(block.timestamp >= lastClaim[msg.sender] + cooldown, "Cooldown active");
        lastClaim[msg.sender] = block.timestamp;

        if (usdcAmount > 0) {
            usdc.transfer(msg.sender, usdcAmount);
        }
        if (rwaAmount > 0) {
            rwaToken.transfer(msg.sender, rwaAmount);
        }

        emit Claimed(msg.sender, usdcAmount, rwaAmount);
    }

    function configure(uint256 usdcAmount_, uint256 rwaAmount_, uint256 cooldown_) external onlyOwner {
        usdcAmount = usdcAmount_;
        rwaAmount = rwaAmount_;
        cooldown = cooldown_;
        emit Configured(usdcAmount_, rwaAmount_, cooldown_);
    }

    function timeUntilNextClaim(address user) external view returns (uint256) {
        uint256 nextClaim = lastClaim[user] + cooldown;
        if (block.timestamp >= nextClaim) return 0;
        return nextClaim - block.timestamp;
    }
}
