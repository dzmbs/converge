// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DemoFaucet} from "../src/DemoFaucet.sol";
import {MintableToken} from "../src/mocks/MintableToken.sol";

/// @notice Deploys a DemoFaucet and funds it from the deployer's balance.
///         Reads token addresses from the deployment JSON produced by 00_DeployStack.
contract DeployFaucetScript is Script {
    function run() external {
        string memory deploymentPath =
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(deploymentPath);

        address usdc = vm.parseJsonAddress(json, ".redeemAsset");
        address rwaToken = vm.parseJsonAddress(json, ".rwaToken");

        uint256 claimUsdc = vm.envOr("FAUCET_CLAIM_USDC", uint256(10_000e18));
        uint256 claimRwa = vm.envOr("FAUCET_CLAIM_RWA", uint256(10_000e18));
        uint256 cooldown = vm.envOr("FAUCET_COOLDOWN", uint256(1 hours));
        uint256 fundUsdc = vm.envOr("FAUCET_FUND_USDC", uint256(1_000_000e18));
        uint256 fundRwa = vm.envOr("FAUCET_FUND_RWA", uint256(1_000_000e18));

        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));

        vm.startBroadcast();

        DemoFaucet faucet = new DemoFaucet(usdc, rwaToken, claimUsdc, claimRwa, cooldown, deployer);

        // Fund the faucet — deployer must hold the tokens (or be able to mint).
        IERC20(usdc).transfer(address(faucet), fundUsdc);
        IERC20(rwaToken).transfer(address(faucet), fundRwa);

        vm.stopBroadcast();

        console2.log("DemoFaucet deployed at:", address(faucet));
        console2.log("  USDC per claim:", claimUsdc);
        console2.log("  RWA per claim: ", claimRwa);
        console2.log("  Cooldown:      ", cooldown);
    }
}
