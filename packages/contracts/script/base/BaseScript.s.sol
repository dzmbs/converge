// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {Deployers} from "../../test/utils/Deployers.sol";

abstract contract BaseScript is Script, Deployers {
    struct DeploymentFile {
        address permit2;
        address poolManager;
        address positionManager;
        address swapRouter;
        address rwaToken;
        address redeemAsset;
        address oracle;
        address kycRegistry;
        address kycPolicy;
        address yieldVault;
        address rebalanceStrategy;
        address iouToken;
        address hook;
        bytes32 poolId;
    }

    function _etch(address target, bytes memory bytecode) internal override {
        if (block.chainid == 31337) {
            vm.rpc("anvil_setCode", string.concat('["', vm.toString(target), '",', '"', vm.toString(bytecode), '"]'));
        } else {
            revert("Unsupported etch on this network");
        }
    }

    function _sortCurrencies(address tokenA, address tokenB) internal pure returns (Currency, Currency) {
        require(tokenA != tokenB, "duplicate token");
        if (tokenA < tokenB) {
            return (Currency.wrap(tokenA), Currency.wrap(tokenB));
        }
        return (Currency.wrap(tokenB), Currency.wrap(tokenA));
    }

    function _deployer() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) {
            return wallets[0];
        }
        return msg.sender;
    }

    function _deploymentPath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
    }

    function _writeDeploymentFile(DeploymentFile memory deployment) internal {
        string memory root = "deployment";
        vm.serializeAddress(root, "permit2", deployment.permit2);
        vm.serializeAddress(root, "poolManager", deployment.poolManager);
        vm.serializeAddress(root, "positionManager", deployment.positionManager);
        vm.serializeAddress(root, "swapRouter", deployment.swapRouter);
        vm.serializeAddress(root, "rwaToken", deployment.rwaToken);
        vm.serializeAddress(root, "redeemAsset", deployment.redeemAsset);
        vm.serializeAddress(root, "oracle", deployment.oracle);
        vm.serializeAddress(root, "kycRegistry", deployment.kycRegistry);
        vm.serializeAddress(root, "kycPolicy", deployment.kycPolicy);
        vm.serializeAddress(root, "yieldVault", deployment.yieldVault);
        vm.serializeAddress(root, "rebalanceStrategy", deployment.rebalanceStrategy);
        vm.serializeAddress(root, "iouToken", deployment.iouToken);
        vm.serializeAddress(root, "hook", deployment.hook);
        string memory json = vm.serializeBytes32(root, "poolId", deployment.poolId);
        vm.writeJson(json, _deploymentPath());
    }

    function _logDeployment(DeploymentFile memory deployment) internal view {
        console2.log("permit2            ", deployment.permit2);
        console2.log("poolManager        ", deployment.poolManager);
        console2.log("positionManager    ", deployment.positionManager);
        console2.log("swapRouter         ", deployment.swapRouter);
        console2.log("rwaToken           ", deployment.rwaToken);
        console2.log("redeemAsset        ", deployment.redeemAsset);
        console2.log("oracle             ", deployment.oracle);
        console2.log("kycRegistry        ", deployment.kycRegistry);
        console2.log("kycPolicy          ", deployment.kycPolicy);
        console2.log("yieldVault         ", deployment.yieldVault);
        console2.log("rebalanceStrategy  ", deployment.rebalanceStrategy);
        console2.log("iouToken           ", deployment.iouToken);
        console2.log("hook               ", deployment.hook);
        console2.logBytes32(deployment.poolId);
    }

    function _approveIfNeeded(address token, address spender, uint256 amount) internal {
        if (amount > 0) {
            IERC20(token).approve(spender, type(uint256).max);
        }
    }
}
