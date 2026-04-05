// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {ConvergeHook} from "../src/ConvergeHook.sol";
import {IKYCRegistry} from "../src/interfaces/IKYCRegistry.sol";
import {IRWAOracle} from "../src/interfaces/IRWAOracle.sol";
import {IKYCPolicy} from "../src/interfaces/IKYCPolicy.sol";
import {IIssuerAdapter} from "../src/interfaces/IIssuerAdapter.sol";
import {IYieldVault} from "../src/interfaces/IYieldVault.sol";
import {IRebalanceStrategy} from "../src/interfaces/IRebalanceStrategy.sol";
import {RegistryKYCPolicy} from "../src/policies/RegistryKYCPolicy.sol";
import {ThresholdRebalanceStrategy} from "../src/policies/ThresholdRebalanceStrategy.sol";
import {MintableToken} from "../src/mocks/MintableToken.sol";
import {DeployableKYCRegistry} from "../src/mocks/DeployableKYCRegistry.sol";
import {DeployableRWAOracle} from "../src/mocks/DeployableRWAOracle.sol";
import {DeployableIssuerAdapter} from "../src/mocks/DeployableIssuerAdapter.sol";
import {DeployableYieldVault} from "../src/mocks/DeployableYieldVault.sol";

import {BaseScript} from "./base/BaseScript.s.sol";

contract DeployStackScript is BaseScript {
    using PoolIdLibrary for PoolKey;

    struct Config {
        address rwaToken;
        address redeemAsset;
        uint8 rwaDecimals;
        uint8 redeemDecimals;
        uint256 initialOracleRate;
        uint256 rwaMintAmount;
        uint256 redeemMintAmount;
        uint24 poolFee;
        int24 tickSpacing;
        uint160 startingPrice;
        uint16 minFeeBips;
        uint16 maxFeeBips;
        uint256 lowThreshold;
        uint256 highThreshold;
        uint16 targetRwaReserveBips;
        uint16 targetRedeemReserveBips;
        uint256 minRwaReserve;
        uint256 minRedeemReserve;
        uint256 initialRwaSeed;
        uint256 initialRedeemSeed;
        address kycRegistryAddr;
        address oracleAddr;
        address yieldVaultAddr;
        address rebalanceStrategyAddr;
        address issuerAdapterAddr;
        address complianceSigner;
        RegistryKYCPolicy.Mode mode;
    }

    struct DeployedModules {
        address rwaToken;
        address redeemAsset;
        address kycRegistryAddr;
        address oracleAddr;
        address yieldVaultAddr;
        address rebalanceStrategyAddr;
        address issuerAdapterAddr;
        RegistryKYCPolicy kycPolicy;
        bool kycRegistryWasDeployed;
        bool rwaTokenWasDeployed;
        bool redeemAssetWasDeployed;
        bool issuerAdapterWasDeployed;
    }

    function run() external {
        address deployer = _deployer();
        Config memory config = _loadConfig(deployer);

        vm.startBroadcast();
        deployArtifacts();
        DeployedModules memory deployed = _deployModules(config, deployer);

        ConvergeHook.FeeConfig memory feeConfig = ConvergeHook.FeeConfig({
            minFeeBips: config.minFeeBips,
            maxFeeBips: config.maxFeeBips,
            lowThreshold: config.lowThreshold,
            highThreshold: config.highThreshold
        });

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG |
            Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
        );

        bytes memory constructorArgs = abi.encode(
            IPoolManager(address(poolManager)),
            deployed.rwaToken,
            deployed.redeemAsset,
            IRWAOracle(deployed.oracleAddr),
            IKYCPolicy(address(deployed.kycPolicy)),
            deployer,
            config.rwaDecimals,
            config.redeemDecimals,
            feeConfig
        );

        (address expectedHookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(ConvergeHook).creationCode, constructorArgs);

        ConvergeHook hook;
        if (expectedHookAddress.code.length == 0) {
            hook = new ConvergeHook{salt: salt}(
                IPoolManager(address(poolManager)),
                deployed.rwaToken,
                deployed.redeemAsset,
                IRWAOracle(deployed.oracleAddr),
                IKYCPolicy(address(deployed.kycPolicy)),
                deployer,
                config.rwaDecimals,
                config.redeemDecimals,
                feeConfig
            );
            require(address(hook) == expectedHookAddress, "hook address mismatch");
        } else {
            hook = ConvergeHook(expectedHookAddress);
        }

        hook.setYieldVault(IYieldVault(deployed.yieldVaultAddr));
        hook.setRebalanceStrategy(IRebalanceStrategy(deployed.rebalanceStrategyAddr));
        if (deployed.issuerAdapterAddr != address(0)) {
            hook.setIssuerAdapter(IIssuerAdapter(deployed.issuerAdapterAddr));
        }

        (Currency currency0, Currency currency1) = _sortCurrencies(deployed.rwaToken, deployed.redeemAsset);
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: config.poolFee,
            tickSpacing: config.tickSpacing,
            hooks: IHooks(address(hook))
        });

        if (!hook.poolInitialized()) {
            poolManager.initialize(poolKey, config.startingPrice);
        }

        if (config.initialRwaSeed > 0) {
            _approveIfNeeded(deployed.rwaToken, address(hook), config.initialRwaSeed);
        }
        if (config.initialRedeemSeed > 0) {
            _approveIfNeeded(deployed.redeemAsset, address(hook), config.initialRedeemSeed);
        }
        if (config.initialRwaSeed > 0 || config.initialRedeemSeed > 0) {
            hook.deposit(config.initialRwaSeed, config.initialRedeemSeed, 0, block.timestamp + 1 hours);
        }

        vm.stopBroadcast();

        BaseScript.DeploymentFile memory deployment = BaseScript.DeploymentFile({
            permit2: address(permit2),
            poolManager: address(poolManager),
            positionManager: address(positionManager),
            swapRouter: address(swapRouter),
            rwaToken: deployed.rwaToken,
            redeemAsset: deployed.redeemAsset,
            oracle: deployed.oracleAddr,
            kycRegistry: deployed.kycRegistryAddr,
            kycPolicy: address(deployed.kycPolicy),
            yieldVault: deployed.yieldVaultAddr,
            rebalanceStrategy: deployed.rebalanceStrategyAddr,
            issuerAdapter: deployed.issuerAdapterAddr,
            iouToken: address(0),
            hook: address(hook),
            poolId: PoolId.unwrap(poolKey.toId())
        });

        _writeDeploymentFile(deployment);
        _logDeployment(deployment);
    }

    function _loadConfig(address deployer) internal view returns (Config memory config) {
        config.rwaToken = vm.envOr("RWA_TOKEN", address(0));
        config.redeemAsset = vm.envOr("REDEEM_ASSET", address(0));
        config.rwaDecimals = uint8(vm.envOr("RWA_DECIMALS", uint256(18)));
        config.redeemDecimals = uint8(vm.envOr("REDEEM_DECIMALS", uint256(18)));
        config.initialOracleRate = vm.envOr("ORACLE_RATE", uint256(1e18));
        config.rwaMintAmount = vm.envOr("MOCK_RWA_MINT", uint256(10_000_000e18));
        config.redeemMintAmount = vm.envOr("MOCK_REDEEM_MINT", uint256(10_000_000e18));
        config.poolFee = uint24(vm.envOr("POOL_FEE", uint256(0)));
        config.tickSpacing = int24(int256(vm.envOr("TICK_SPACING", uint256(1))));
        config.startingPrice = uint160(vm.envOr("STARTING_PRICE_X96", uint256(2 ** 96)));
        config.minFeeBips = uint16(vm.envOr("MIN_FEE_BIPS", uint256(1)));
        config.maxFeeBips = uint16(vm.envOr("MAX_FEE_BIPS", uint256(100)));
        config.lowThreshold = vm.envOr("LOW_THRESHOLD", uint256(1_000e18));
        config.highThreshold = vm.envOr("HIGH_THRESHOLD", uint256(100_000e18));
        config.targetRwaReserveBips = uint16(vm.envOr("TARGET_RWA_RESERVE_BIPS", uint256(2_500)));
        config.targetRedeemReserveBips = uint16(vm.envOr("TARGET_REDEEM_RESERVE_BIPS", uint256(2_500)));
        config.minRwaReserve = vm.envOr("MIN_RWA_RESERVE", uint256(10_000e18));
        config.minRedeemReserve = vm.envOr("MIN_REDEEM_RESERVE", uint256(10_000e18));
        config.initialRwaSeed = vm.envOr("INITIAL_RWA_SEED", uint256(0));
        config.initialRedeemSeed = vm.envOr("INITIAL_REDEEM_SEED", uint256(500_000e18));
        config.kycRegistryAddr = vm.envOr("KYC_REGISTRY", address(0));
        config.oracleAddr = vm.envOr("ORACLE", address(0));
        config.yieldVaultAddr = vm.envOr("YIELD_VAULT", address(0));
        config.rebalanceStrategyAddr = vm.envOr("REBALANCE_STRATEGY", address(0));
        config.issuerAdapterAddr = vm.envOr("ISSUER_ADAPTER", address(0));
        config.complianceSigner = vm.envOr("COMPLIANCE_SIGNER", deployer);
        config.mode = RegistryKYCPolicy.Mode(
            uint8(vm.envOr("KYC_MODE", uint256(uint8(RegistryKYCPolicy.Mode.NONE))))
        );
    }

    function _deployModules(Config memory config, address deployer) internal returns (DeployedModules memory deployed) {
        deployed.rwaToken = config.rwaToken;
        deployed.redeemAsset = config.redeemAsset;
        deployed.kycRegistryAddr = config.kycRegistryAddr;
        deployed.oracleAddr = config.oracleAddr;
        deployed.yieldVaultAddr = config.yieldVaultAddr;
        deployed.rebalanceStrategyAddr = config.rebalanceStrategyAddr;
        deployed.issuerAdapterAddr = config.issuerAdapterAddr;

        if (deployed.rwaToken == address(0)) {
            deployed.rwaTokenWasDeployed = true;
            deployed.rwaToken = address(
                new MintableToken(
                    vm.envOr("RWA_NAME", string("Converge Test RWA")),
                    vm.envOr("RWA_SYMBOL", string("aRWA")),
                    config.rwaDecimals,
                    deployer,
                    config.rwaMintAmount
                )
            );
        }

        if (deployed.redeemAsset == address(0)) {
            deployed.redeemAssetWasDeployed = true;
            deployed.redeemAsset = address(
                new MintableToken(
                    vm.envOr("REDEEM_NAME", string("Converge Test USD")),
                    vm.envOr("REDEEM_SYMBOL", string("aUSD")),
                    config.redeemDecimals,
                    deployer,
                    config.redeemMintAmount
                )
            );
        }

        if (deployed.kycRegistryAddr == address(0)) {
            deployed.kycRegistryAddr = address(new DeployableKYCRegistry(deployer));
            deployed.kycRegistryWasDeployed = true;
        }

        if (deployed.oracleAddr == address(0)) {
            deployed.oracleAddr = address(new DeployableRWAOracle(config.initialOracleRate, deployer));
        }

        if (deployed.yieldVaultAddr == address(0)) {
            deployed.yieldVaultAddr = address(new DeployableYieldVault(deployed.redeemAsset, deployer));
        }

        if (deployed.rebalanceStrategyAddr == address(0)) {
            deployed.rebalanceStrategyAddr = address(
                new ThresholdRebalanceStrategy(
                    config.targetRwaReserveBips,
                    config.targetRedeemReserveBips,
                    config.minRwaReserve,
                    config.minRedeemReserve,
                    deployer
                )
            );
        }

        if (deployed.issuerAdapterAddr == address(0) && block.chainid == 31337) {
            deployed.issuerAdapterWasDeployed = true;
            deployed.issuerAdapterAddr = address(new DeployableIssuerAdapter(deployer));
        }

        if (deployed.issuerAdapterWasDeployed) {
            if (deployed.rwaTokenWasDeployed) {
                MintableToken(deployed.rwaToken).transferOwnership(deployed.issuerAdapterAddr);
            }
            if (deployed.redeemAssetWasDeployed) {
                MintableToken(deployed.redeemAsset).transferOwnership(deployed.issuerAdapterAddr);
            }
        }

        deployed.kycPolicy = new RegistryKYCPolicy(IKYCRegistry(deployed.kycRegistryAddr), config.mode, deployer);

        if (config.mode != RegistryKYCPolicy.Mode.NONE && deployed.kycRegistryWasDeployed) {
            DeployableKYCRegistry(deployed.kycRegistryAddr).setVerified(deployer, true);
        }

        if (config.mode == RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER) {
            deployed.kycPolicy.setTrustedRouter(address(swapRouter), true);
            deployed.kycPolicy.setComplianceSigner(config.complianceSigner, true);
        }
    }
}
