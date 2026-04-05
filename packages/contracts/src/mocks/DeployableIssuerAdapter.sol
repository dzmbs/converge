// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IIssuerAdapter} from "../interfaces/IIssuerAdapter.sol";
import {MintableToken} from "./MintableToken.sol";

contract DeployableIssuerAdapter is IIssuerAdapter, Ownable {
    struct Request {
        bool isMint;
        address inputToken;
        uint256 inputAmount;
        address recipient;
        bool settled;
        uint256 outputAmount;
        uint256 settledAt;
    }

    uint256 public nonce;
    mapping(bytes32 => Request) public requests;

    constructor(address owner_) Ownable(owner_) {}

    function requestRedemption(address rwaToken, uint256 rwaAmount, address recipient, uint256)
        external
        returns (bytes32 requestId)
    {
        IERC20(rwaToken).transferFrom(msg.sender, address(this), rwaAmount);
        requestId = keccak256(abi.encodePacked("redeem", nonce++, msg.sender, rwaAmount, recipient));
        requests[requestId] = Request({
            isMint: false,
            inputToken: rwaToken,
            inputAmount: rwaAmount,
            recipient: recipient,
            settled: false,
            outputAmount: 0,
            settledAt: 0
        });
    }

    function requestMint(address redeemAsset, uint256 redeemAmount, address recipient, uint256)
        external
        returns (bytes32 requestId)
    {
        IERC20(redeemAsset).transferFrom(msg.sender, address(this), redeemAmount);
        requestId = keccak256(abi.encodePacked("mint", nonce++, msg.sender, redeemAmount, recipient));
        requests[requestId] = Request({
            isMint: true,
            inputToken: redeemAsset,
            inputAmount: redeemAmount,
            recipient: recipient,
            settled: false,
            outputAmount: 0,
            settledAt: 0
        });
    }

    function settlementResult(bytes32 requestId)
        external
        view
        returns (bool settled, uint256 outputAmount, uint256 settledAt)
    {
        Request storage request = requests[requestId];
        return (request.settled, request.outputAmount, request.settledAt);
    }

    function settle(bytes32 requestId, address outputToken, uint256 outputAmount) external onlyOwner {
        Request storage request = requests[requestId];
        request.settled = true;
        request.outputAmount = outputAmount;
        request.settledAt = block.timestamp;
        MintableToken(outputToken).mint(request.recipient, outputAmount);
    }

    function expectedSettlementDuration() external pure returns (uint256) {
        return 3 days;
    }
}
