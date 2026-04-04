// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {RWAHook} from "../src/RWAHook.sol";

contract LocalSmokeTestScript is Script {
    using stdJson for string;

    struct Deployment {
        address permit2;
        address swapRouter;
        address rwaToken;
        address redeemAsset;
        address hook;
    }

    struct SmokeResult {
        uint256 sharesBefore;
        uint256 sharesAfterDeposit;
        uint256 sharesAfterWithdraw;
        uint256 rwaBuyDelta;
        uint256 redeemSellDelta;
    }

    function run() external {
        require(block.chainid == 31337, "local only");

        Deployment memory deployment = _loadDeployment();
        RWAHook hook = RWAHook(deployment.hook);
        IUniswapV4Router04 router = IUniswapV4Router04(payable(deployment.swapRouter));

        (Currency currency0, Currency currency1) = _sortCurrencies(deployment.rwaToken, deployment.redeemAsset);
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 0,
            tickSpacing: 1,
            hooks: IHooks(deployment.hook)
        });

        bool rwaIsCurrency0 = hook.rwaIsCurrency0();
        bool redeemToRwa = !rwaIsCurrency0;
        bool rwaToRedeem = rwaIsCurrency0;

        address deployer = _deployer();
        uint256 depositRwaAmount = vm.envOr("SMOKE_DEPOSIT_RWA", uint256(10_000e18));
        uint256 depositRedeemAmount = vm.envOr("SMOKE_DEPOSIT_REDEEM", uint256(10_000e18));
        uint256 swapAmount = vm.envOr("SMOKE_SWAP_AMOUNT", uint256(1_000e18));

        vm.startBroadcast();
        _approveForHookAndRouter(deployment);

        SmokeResult memory result;
        result.sharesBefore = hook.shares(deployer);
        hook.deposit(depositRwaAmount, depositRedeemAmount, 0, block.timestamp + 1 hours);
        result.sharesAfterDeposit = hook.shares(deployer);
        result.rwaBuyDelta = _swapAndMeasure(
            router, deployment.rwaToken, swapAmount, redeemToRwa, poolKey, deployer
        );
        result.redeemSellDelta = _swapAndMeasure(
            router, deployment.redeemAsset, swapAmount, rwaToRedeem, poolKey, deployer
        );

        uint256 withdrawShares = result.sharesAfterDeposit - result.sharesBefore;
        hook.withdraw(withdrawShares / 2, 0, 0, block.timestamp + 1 hours);
        result.sharesAfterWithdraw = hook.shares(deployer);

        vm.stopBroadcast();

        console2.log("smoke deployer      ", deployer);
        console2.log("shares before       ", result.sharesBefore);
        console2.log("shares after deposit", result.sharesAfterDeposit);
        console2.log("shares after withdraw", result.sharesAfterWithdraw);
        console2.log("rwa buy delta       ", result.rwaBuyDelta);
        console2.log("redeem sell delta   ", result.redeemSellDelta);

        require(result.sharesAfterDeposit > result.sharesBefore, "deposit failed");
        require(result.rwaBuyDelta > 0, "redeem->rwa swap failed");
        require(result.redeemSellDelta > 0, "rwa->redeem swap failed");
        require(result.sharesAfterWithdraw < result.sharesAfterDeposit, "withdraw failed");
    }

    function _loadDeployment() internal view returns (Deployment memory deployment) {
        string memory path = string.concat(vm.projectRoot(), "/deployments/31337.json");
        string memory json = vm.readFile(path);
        deployment.permit2 = json.readAddress(".permit2");
        deployment.swapRouter = json.readAddress(".swapRouter");
        deployment.rwaToken = json.readAddress(".rwaToken");
        deployment.redeemAsset = json.readAddress(".redeemAsset");
        deployment.hook = json.readAddress(".hook");
    }

    function _approveForHookAndRouter(Deployment memory deployment) internal {
        IERC20(deployment.rwaToken).approve(deployment.hook, type(uint256).max);
        IERC20(deployment.redeemAsset).approve(deployment.hook, type(uint256).max);
        IERC20(deployment.rwaToken).approve(deployment.swapRouter, type(uint256).max);
        IERC20(deployment.redeemAsset).approve(deployment.swapRouter, type(uint256).max);

        IERC20(deployment.rwaToken).approve(deployment.permit2, type(uint256).max);
        IERC20(deployment.redeemAsset).approve(deployment.permit2, type(uint256).max);

        IPermit2(deployment.permit2).approve(
            deployment.rwaToken, deployment.swapRouter, type(uint160).max, type(uint48).max
        );
        IPermit2(deployment.permit2).approve(
            deployment.redeemAsset, deployment.swapRouter, type(uint160).max, type(uint48).max
        );
    }

    function _swapAndMeasure(
        IUniswapV4Router04 router,
        address outputToken,
        uint256 amountIn,
        bool zeroForOne,
        PoolKey memory poolKey,
        address receiver
    ) internal returns (uint256 delta) {
        uint256 balanceBefore = IERC20(outputToken).balanceOf(receiver);
        router.swapExactTokensForTokens(
            amountIn,
            0,
            zeroForOne,
            poolKey,
            "",
            receiver,
            block.timestamp + 1 hours
        );
        uint256 balanceAfter = IERC20(outputToken).balanceOf(receiver);
        delta = balanceAfter - balanceBefore;
    }

    function _deployer() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        if (wallets.length > 0) {
            return wallets[0];
        }
        return msg.sender;
    }

    function _sortCurrencies(address tokenA, address tokenB) internal pure returns (Currency, Currency) {
        require(tokenA != tokenB, "duplicate token");
        if (tokenA < tokenB) {
            return (Currency.wrap(tokenA), Currency.wrap(tokenB));
        }
        return (Currency.wrap(tokenB), Currency.wrap(tokenA));
    }
}
