// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console2} from "forge-std/Script.sol";
import {CCTPDepositor} from "../src/CCTPDepositor.sol";

/// @notice Deploys CCTPDepositor on the SOURCE chain (e.g. Base Sepolia).
///         This contract bridges USDC to the destination chain (Arc) via Circle CCTP.
contract DeployCCTPScript is Script {
    function run() external {
        address usdc = vm.envAddress("CCTP_USDC");
        address tokenMessenger = vm.envAddress("CCTP_TOKEN_MESSENGER");
        uint32 destinationDomain = uint32(vm.envUint("CCTP_DESTINATION_DOMAIN"));

        vm.startBroadcast();
        CCTPDepositor depositor = new CCTPDepositor(usdc, tokenMessenger, destinationDomain);
        vm.stopBroadcast();

        console2.log("CCTPDepositor deployed at:", address(depositor));
        console2.log("  USDC:               ", usdc);
        console2.log("  TokenMessenger:      ", tokenMessenger);
        console2.log("  Destination Domain:  ", destinationDomain);
    }
}
