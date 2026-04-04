// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {RWAHook} from "../src/RWAHook.sol";
import {IOUToken} from "../src/IOUToken.sol";
import {IKYCRegistry} from "../src/interfaces/IKYCRegistry.sol";
import {IRWAOracle} from "../src/interfaces/IRWAOracle.sol";
import {IClearingHouse} from "../src/interfaces/IClearingHouse.sol";
import {IIssuerAdapter} from "../src/interfaces/IIssuerAdapter.sol";
import {IYieldVault} from "../src/interfaces/IYieldVault.sol";
import {RegistryKYCPolicy} from "../src/policies/RegistryKYCPolicy.sol";
import {ThresholdRebalanceStrategy} from "../src/policies/ThresholdRebalanceStrategy.sol";
import {IKYCPolicy} from "../src/interfaces/IKYCPolicy.sol";

// ─── Mocks ─────────────────────────────────────────────────────────────
contract MockKYCRegistry is IKYCRegistry {
    mapping(address => bool) public verified;
    function setVerified(address a, bool v) external { verified[a] = v; }
    function isVerified(address a) external view returns (bool) { return verified[a]; }
}

contract MockRWAOracle is IRWAOracle {
    uint256 private _rate;
    uint256 private _updatedAt;
    constructor(uint256 r) { _rate = r; _updatedAt = block.timestamp; }
    function setRate(uint256 r) external { _rate = r; _updatedAt = block.timestamp; }
    function rate() external view returns (uint256) { return _rate; }
    function rateWithTimestamp() external view returns (uint256, uint256) { return (_rate, _updatedAt); }
}

contract MockYieldVault is IYieldVault {
    address public _asset;
    mapping(address => uint256) public deposited;
    uint256 public yieldAccrued;
    constructor(address a) { _asset = a; }
    function asset() external view returns (address) { return _asset; }
    function deposit(uint256 assets, address receiver) external returns (uint256) {
        MockERC20(_asset).transferFrom(msg.sender, address(this), assets);
        deposited[receiver] += assets;
        return assets;
    }
    function withdraw(uint256 assets, address receiver, address o) external returns (uint256) {
        uint256 available = deposited[o] + yieldAccrued;
        uint256 w = assets > available ? available : assets;
        if (w <= deposited[o]) { deposited[o] -= w; }
        else { uint256 fromYield = w - deposited[o]; deposited[o] = 0; yieldAccrued -= fromYield; }
        MockERC20(_asset).transfer(receiver, w);
        return w;
    }
    function maxWithdraw(address o) external view returns (uint256) { return deposited[o] + yieldAccrued; }
    function accrueYield(uint256 amount) external { yieldAccrued += amount; }
}

contract MockIssuerAdapter is IIssuerAdapter {
    struct Request {
        bool isMint;
        address inputToken;
        uint256 inputAmount;
        address outputToken;
        address recipient;
        bool settled;
        uint256 outputAmount;
        uint256 settledAt;
    }

    uint256 public nonce;
    mapping(bytes32 => Request) public requests;

    function requestRedemption(address rwaToken, uint256 rwaAmount, address recipient, uint256)
        external
        returns (bytes32 requestId)
    {
        MockERC20(rwaToken).transferFrom(msg.sender, address(this), rwaAmount);
        requestId = keccak256(abi.encodePacked("redeem", nonce++, msg.sender, rwaAmount, recipient));
        requests[requestId] = Request({
            isMint: false,
            inputToken: rwaToken,
            inputAmount: rwaAmount,
            outputToken: address(0),
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
        MockERC20(redeemAsset).transferFrom(msg.sender, address(this), redeemAmount);
        requestId = keccak256(abi.encodePacked("mint", nonce++, msg.sender, redeemAmount, recipient));
        requests[requestId] = Request({
            isMint: true,
            inputToken: redeemAsset,
            inputAmount: redeemAmount,
            outputToken: address(0),
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

    function settle(bytes32 requestId, address outputToken, uint256 outputAmount) external {
        Request storage request = requests[requestId];
        request.settled = true;
        request.outputToken = outputToken;
        request.outputAmount = outputAmount;
        request.settledAt = block.timestamp;
        MockERC20(outputToken).mint(request.recipient, outputAmount);
    }

    function expectedSettlementDuration() external pure returns (uint256) {
        return 3 days;
    }
}

// ─── Test ──────────────────────────────────────────────────────────────
contract RWAHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    RWAHook hook;
    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;

    MockKYCRegistry kycRegistry;
    MockRWAOracle oracle;
    MockYieldVault yieldVault;
    MockIssuerAdapter issuerAdapter;
    RegistryKYCPolicy kycPolicy;
    ThresholdRebalanceStrategy rebalanceStrategy;

    address alice;
    uint256 alicePk;
    address bob;
    uint256 bobPk;
    address complianceSigner;
    uint256 complianceSignerPk;

    bool _rwaIsCurrency0;

    function setUp() public {
        // Deploy all v4 artifacts (Permit2, PoolManager, PositionManager, SwapRouter)
        deployArtifactsAndLabel();

        // Deploy token pair
        (currency0, currency1) = deployCurrencyPair();

        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");
        (complianceSigner, complianceSignerPk) = makeAddrAndKey("compliance-signer");

        // Deploy mocks
        kycRegistry = new MockKYCRegistry();
        oracle = new MockRWAOracle(1e18);
        yieldVault = new MockYieldVault(Currency.unwrap(currency1));
        kycPolicy = new RegistryKYCPolicy(kycRegistry, RegistryKYCPolicy.Mode.NONE, address(this));
        rebalanceStrategy = new ThresholdRebalanceStrategy(2_500, 2_500, 10_000e18, 10_000e18, address(this));

        kycRegistry.setVerified(alice, true);
        kycRegistry.setVerified(bob, true);

        // Deploy hook at flag-encoded address (v4-template pattern)
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG |
                Hooks.BEFORE_SWAP_FLAG |
                Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG |
                Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
                Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x4444 << 144)
        );
        bytes memory constructorArgs = abi.encode(
            poolManager,
            Currency.unwrap(currency0), // rwaToken
            Currency.unwrap(currency1), // redeemAsset
            oracle,
            kycPolicy,
            address(this),
            uint8(18),
            uint8(18),
            RWAHook.FeeConfig({
                minFeeBips: 1,
                maxFeeBips: 100,
                lowThreshold: 1_000e18,
                highThreshold: 100_000e18
            })
        );
        deployCodeTo("RWAHook.sol:RWAHook", constructorArgs, flags);
        hook = RWAHook(flags);

        // Setup modules
        hook.setYieldVault(yieldVault);
        hook.setRebalanceStrategy(rebalanceStrategy);

        // Deploy and set IOU token
        IOUToken iou = new IOUToken("RWA IOU", "IOU-RWA", flags, 18);
        hook.setIOUToken(iou);

        // Create pool
        poolKey = PoolKey(currency0, currency1, 0, 1, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        _rwaIsCurrency0 = hook.rwaIsCurrency0();

        // Fund users
        _fundUser(alice);
        _fundUser(bob);

        // Initial liquidity: owner deposits 500k redeem asset
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        MockERC20(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        hook.deposit(0, 500_000e18, 0, block.timestamp + 1);
    }

    function _fundUser(address user) internal {
        MockERC20 token0 = MockERC20(Currency.unwrap(currency0));
        MockERC20 token1 = MockERC20(Currency.unwrap(currency1));
        token0.mint(user, 1_000_000e18);
        token1.mint(user, 1_000_000e18);
        vm.startPrank(user);
        token0.approve(address(hook), type(uint256).max);
        token1.approve(address(hook), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);
        token0.approve(address(permit2), type(uint256).max);
        token1.approve(address(permit2), type(uint256).max);
        permit2.approve(address(token0), address(swapRouter), type(uint160).max, type(uint48).max);
        permit2.approve(address(token1), address(swapRouter), type(uint160).max, type(uint48).max);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     DEPOSIT TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_deposit_redeemOnly() public {
        vm.startPrank(alice);
        uint256 sharesBefore = hook.shares(alice);
        hook.deposit(0, 10_000e18, 0, block.timestamp + 1);
        vm.stopPrank();
        assertGt(hook.shares(alice), sharesBefore, "should receive shares");
    }

    function test_deposit_rwaOnly() public {
        vm.startPrank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        assertGt(hook.shares(alice), 0, "should receive shares for RWA deposit");
    }

    function test_deposit_zeroAmount_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(RWAHook.ZeroAmount.selector);
        hook.deposit(0, 0, 0, block.timestamp + 1);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     SWAP TESTS (using production router)
    // ═══════════════════════════════════════════════════════════════════

    function test_swap_redeemForRwa() public {
        // Deposit RWA so pool has both sides
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        // Bob swaps redeem → rwa
        uint256 amountIn = 1_000e18;
        bool zeroForOne = !_rwaIsCurrency0; // redeem → rwa

        uint256 rwaBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(bob);

        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: "",
            receiver: bob,
            deadline: block.timestamp + 1
        });
        vm.stopPrank();

        uint256 rwaAfter = MockERC20(Currency.unwrap(currency0)).balanceOf(bob);
        assertGt(rwaAfter, rwaBefore, "bob should receive RWA tokens");
    }

    function test_swap_rwaForRedeem() public {
        uint256 amountIn = 1_000e18;
        bool zeroForOne = _rwaIsCurrency0; // rwa → redeem

        uint256 redeemBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(bob);

        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: "",
            receiver: bob,
            deadline: block.timestamp + 1
        });
        vm.stopPrank();

        uint256 redeemAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(bob);
        assertGt(redeemAfter, redeemBefore, "bob should receive redeem asset");
    }

    function test_swap_fixedPrice_noSlippage() public {
        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        bool zeroForOne = !_rwaIsCurrency0;
        address rwa = Currency.unwrap(currency0);

        // Small swap
        uint256 rwaBefore1 = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0, zeroForOne: zeroForOne,
            poolKey: poolKey, hookData: "", receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
        uint256 smallOut = MockERC20(rwa).balanceOf(bob) - rwaBefore1;

        // Large swap
        uint256 rwaBefore2 = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: 100_000e18, amountOutMin: 0, zeroForOne: zeroForOne,
            poolKey: poolKey, hookData: "", receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
        uint256 largeOut = MockERC20(rwa).balanceOf(bob) - rwaBefore2;

        uint256 smallRate = (smallOut * 1e18) / 100e18;
        uint256 largeRate = (largeOut * 1e18) / 100_000e18;
        assertApproxEqAbs(smallRate, largeRate, 2, "no slippage: same rate regardless of size");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     WITHDRAW TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_withdraw_full() public {
        vm.startPrank(alice);
        hook.deposit(0, 50_000e18, 0, block.timestamp + 1);
        uint256 aliceShares = hook.shares(alice);
        hook.withdraw(aliceShares, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        assertEq(hook.shares(alice), 0, "shares should be 0");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     IOU TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_iou_requestAndRedeem() public {
        vm.startPrank(alice);
        uint256 iouAmount = hook.requestRedemption(10_000e18);
        vm.stopPrank();

        IOUToken iou = hook.iouToken();
        assertEq(iou.balanceOf(alice), iouAmount, "alice got IOUs");

        // Owner resolves
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), iouAmount);
        hook.resolveIOUs(iouAmount);

        // Alice redeems
        uint256 balBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        vm.prank(alice);
        hook.redeemIOU(iouAmount);
        uint256 balAfter = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        assertEq(balAfter - balBefore, iouAmount, "alice received redeem asset");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ADMIN TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_admin_twoStepOwnership() public {
        hook.proposeOwnership(alice);
        vm.prank(alice);
        hook.acceptOwnership();
        assertEq(hook.owner(), alice);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     VIEW TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_totalValue() public {
        assertGt(hook.totalValue(), 0, "should have value from setUp deposit");
    }

    function test_getAmountOut() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);
        uint256 out = hook.getAmountOut(1_000e18, false);
        assertGt(out, 900e18, "output close to 1:1");
        assertLt(out, 1_000e18, "output less than input (fees)");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     MORE DEPOSIT/WITHDRAW TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_deposit_both() public {
        vm.startPrank(alice);
        hook.deposit(5_000e18, 5_000e18, 0, block.timestamp + 1);
        vm.stopPrank();
        assertGt(hook.shares(alice), 0);
    }

    function test_deposit_deadlineExpired() public {
        vm.startPrank(alice);
        vm.expectRevert(RWAHook.DeadlineExpired.selector);
        hook.deposit(0, 1000e18, 0, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_deposit_slippageProtection() public {
        vm.startPrank(alice);
        vm.expectRevert(RWAHook.SlippageExceeded.selector);
        hook.deposit(0, 1000e18, type(uint256).max, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_withdraw_partial() public {
        vm.startPrank(alice);
        hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        uint256 aliceShares = hook.shares(alice);
        hook.withdraw(aliceShares / 2, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        assertApproxEqAbs(hook.shares(alice), aliceShares - aliceShares / 2, 1);
    }

    function test_withdraw_insufficientShares() public {
        vm.startPrank(alice);
        vm.expectRevert(RWAHook.InsufficientLiquidity.selector);
        hook.withdraw(1, 0, 0, block.timestamp + 1);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     FEE TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_fee_congestionBased() public {
        vm.prank(alice);
        hook.deposit(2_000e18, 0, 0, block.timestamp + 1);

        uint256 feeHigh = hook.getCurrentFee(false);

        // Drain RWA reserves
        vm.startPrank(bob);
        for (uint256 i = 0; i < 15; i++) {
            if (hook.rwaReserve() < 100e18) break;
            _doSwap(false, 100e18);
        }
        vm.stopPrank();

        uint256 feeLow = hook.getCurrentFee(false);
        assertGe(feeLow, feeHigh, "fee should increase as reserves decrease");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     KYC TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_kyc_poolOnly_anyoneCanSwap() public {
        address charlie = makeAddr("charlie");
        _fundUser(charlie);

        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        address rwa = Currency.unwrap(currency0);
        uint256 rwaBefore = MockERC20(rwa).balanceOf(charlie);
        bool zeroForOne = !_rwaIsCurrency0;
        vm.startPrank(charlie);
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0, zeroForOne: zeroForOne,
            poolKey: poolKey, hookData: "", receiver: charlie, deadline: block.timestamp + 1
        });
        vm.stopPrank();
        assertGt(MockERC20(rwa).balanceOf(charlie), rwaBefore);
    }

    function test_kyc_poolAndLP_blocksNonKYCDeposit() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.LP_ONLY);
        address charlie = makeAddr("charlie");
        _fundUser(charlie);

        vm.startPrank(charlie);
        vm.expectRevert(RWAHook.KYCRequired.selector);
        hook.deposit(0, 1000e18, 0, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_kyc_poolAndLP_allowsKYCDeposit() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.LP_ONLY);
        vm.prank(alice); // alice is KYC'd
        hook.deposit(0, 1000e18, 0, block.timestamp + 1);
        assertGt(hook.shares(alice), 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     YIELD TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_yield_deploy() public {
        uint256 reserveBefore = hook.redeemReserve();
        hook.deployToYield(100_000e18);
        assertEq(hook.redeemReserve(), reserveBefore - 100_000e18);
        assertEq(hook.deployedToYield(), 100_000e18);
    }

    function test_yield_recall() public {
        hook.deployToYield(100_000e18);
        uint256 reserveBefore = hook.redeemReserve();
        hook.recallFromYield(50_000e18);
        assertEq(hook.redeemReserve(), reserveBefore + 50_000e18);
    }

    function test_yield_includesInShareValue() public {
        vm.prank(alice);
        hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        uint256 valueBefore = hook.shareValue(alice);
        hook.deployToYield(200_000e18);
        uint256 valueAfter = hook.shareValue(alice);
        assertEq(valueAfter, valueBefore, "yield deployment shouldn't change share value");
    }

    function test_yield_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        hook.deployToYield(1000e18);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     IOU EXTENDED TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_iou_airdrop() public {
        vm.prank(alice);
        hook.requestRedemption(5_000e18);
        vm.prank(bob);
        hook.requestRedemption(8_000e18);

        uint256 total = 13_000e18;
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), total);
        hook.resolveIOUs(total);

        address[] memory holders = new address[](2);
        holders[0] = alice;
        holders[1] = bob;
        hook.airdropAndBurnIOUs(holders);

        IOUToken iou = hook.iouToken();
        assertEq(iou.balanceOf(alice), 0, "alice IOUs burned");
        assertEq(iou.balanceOf(bob), 0, "bob IOUs burned");
    }

    function test_iou_transferable() public {
        vm.prank(alice);
        uint256 iouAmount = hook.requestRedemption(5_000e18);

        IOUToken iou = hook.iouToken();
        vm.prank(alice);
        iou.transfer(bob, iouAmount);
        assertEq(iou.balanceOf(bob), iouAmount);

        MockERC20(Currency.unwrap(currency1)).approve(address(hook), iouAmount);
        hook.resolveIOUs(iouAmount);

        uint256 balBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(bob);
        vm.prank(bob);
        hook.redeemIOU(iouAmount);
        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(bob) - balBefore, iouAmount);
    }

    function test_iou_cannotRedeemBeforeResolve() public {
        vm.prank(alice);
        uint256 iouAmount = hook.requestRedemption(5_000e18);
        vm.prank(alice);
        vm.expectRevert(RWAHook.InsufficientLiquidity.selector);
        hook.redeemIOU(iouAmount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ORACLE TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_oracle_rateChange() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        uint256 out1 = hook.getAmountOut(1_000e18, false);
        oracle.setRate(1.1e18);
        uint256 out2 = hook.getAmountOut(1_000e18, false);
        assertLt(out2, out1, "fewer RWA when RWA price increases");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ADMIN EXTENDED TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_admin_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        hook.proposeOwnership(alice);
    }

    function test_admin_setFeeConfig() public {
        hook.setFeeConfig(RWAHook.FeeConfig({
            minFeeBips: 5, maxFeeBips: 200,
            lowThreshold: 500e18, highThreshold: 50_000e18
        }));
        (uint16 min, uint16 max,,) = hook.feeConfig();
        assertEq(min, 5);
        assertEq(max, 200);
    }

    function test_admin_invalidFeeConfig() public {
        vm.expectRevert(RWAHook.InvalidFeeConfig.selector);
        hook.setFeeConfig(RWAHook.FeeConfig({
            minFeeBips: 200, maxFeeBips: 100,
            lowThreshold: 500e18, highThreshold: 50_000e18
        }));
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     CLAIMS MANAGEMENT TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_claims_accumulateFromSwaps() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        uint256 claimsBefore = hook.claimsRedeem();

        vm.startPrank(bob);
        _doSwap(false, 10_000e18); // redeem → rwa
        vm.stopPrank();

        assertGt(hook.claimsRedeem(), claimsBefore, "claims should increase after swap");
    }

    function test_claims_withdraw() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        // Do swap to create claims
        vm.startPrank(bob);
        _doSwap(false, 10_000e18);
        vm.stopPrank();

        uint256 claimsBefore = hook.claimsRedeem();
        uint256 reserveBefore = hook.redeemReserve();

        hook.syncClaimsToReserves(Currency.unwrap(currency1), claimsBefore);

        assertEq(hook.claimsRedeem(), 0, "claims should be zero after withdrawal");
        assertEq(hook.redeemReserve(), reserveBefore + claimsBefore, "reserve should increase");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_fuzz_swap_output_bounds(uint256 amountIn) public {
        amountIn = bound(amountIn, 1e18, 400_000e18); // min 1 token

        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        address rwa = Currency.unwrap(currency0);
        address redeem = Currency.unwrap(currency1);
        uint256 rwaBefore = MockERC20(rwa).balanceOf(bob);
        uint256 redeemBefore = MockERC20(redeem).balanceOf(bob);

        vm.startPrank(bob);
        _doSwapTo(false, amountIn, bob);
        vm.stopPrank();

        uint256 rwaReceived = MockERC20(rwa).balanceOf(bob) - rwaBefore;
        uint256 redeemPaid = redeemBefore - MockERC20(redeem).balanceOf(bob);

        assertEq(redeemPaid, amountIn, "exact input");
        assertGt(rwaReceived, 0, "non-zero output");
        assertLe(rwaReceived, amountIn, "output <= input at 1:1");
    }

    function test_fuzz_deposit_withdraw_roundtrip(uint256 amount) public {
        amount = bound(amount, 1e18, 1_000_000e18);

        vm.startPrank(alice);
        uint256 shares = hook.deposit(0, amount, 0, block.timestamp + 1);
        (uint256 rwaOut, uint256 redeemOut) = hook.withdraw(shares, 0, 0, block.timestamp + 1);
        vm.stopPrank();

        assertApproxEqRel(redeemOut + rwaOut, amount, 0.01e18, "roundtrip within 1%");
    }

    function test_fuzz_no_slippage(uint256 small, uint256 large) public {
        small = bound(small, 1e18, 1_000e18);
        large = bound(large, 10_000e18, 200_000e18);

        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        address rwa = Currency.unwrap(currency0);

        uint256 b1 = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        _doSwap(false, small);
        vm.stopPrank();
        uint256 smallOut = MockERC20(rwa).balanceOf(bob) - b1;

        uint256 b2 = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        _doSwap(false, large);
        vm.stopPrank();
        uint256 largeOut = MockERC20(rwa).balanceOf(bob) - b2;

        uint256 smallRate = (smallOut * 1e18) / small;
        uint256 largeRate = (largeOut * 1e18) / large;
        assertApproxEqAbs(smallRate, largeRate, 2, "no size-based slippage");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     SHARE VALUE TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_share_value_accrues_from_fees() public {
        uint256 valueBefore = hook.shareValue(address(this)); // setUp depositor

        for (uint256 i = 0; i < 5; i++) {
            vm.startPrank(alice);
            hook.deposit(50_000e18, 0, 0, block.timestamp + 1);
            vm.stopPrank();

            vm.startPrank(bob);
            _doSwap(false, 10_000e18);
            _doSwap(true, 10_000e18);
            vm.stopPrank();
        }

        uint256 valueAfter = hook.shareValue(address(this));
        assertGt(valueAfter, valueBefore, "LP value increases from swap fees");
    }

    function test_fuzz_new_depositor_no_dilution(uint256 newDeposit) public {
        newDeposit = bound(newDeposit, 1e18, 5_000_000e18);

        uint256 valueBefore = hook.shareValue(address(this));

        MockERC20(Currency.unwrap(currency1)).mint(alice, newDeposit);
        vm.startPrank(alice);
        MockERC20(Currency.unwrap(currency1)).approve(address(hook), newDeposit);
        hook.deposit(0, newDeposit, 0, block.timestamp + 1);
        vm.stopPrank();

        uint256 valueAfter = hook.shareValue(address(this));
        assertApproxEqRel(valueAfter, valueBefore, 0.001e18, "no dilution");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     GAS SNAPSHOTS
    // ═══════════════════════════════════════════════════════════════════

    function test_gas_swap() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        vm.startPrank(bob);
        _doSwap(false, 10_000e18);
        vm.snapshotGasLastCall("swap redeemForRwa 10k");
        vm.stopPrank();
    }

    function test_gas_deposit() public {
        vm.startPrank(alice);
        hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        vm.snapshotGasLastCall("deposit 100k redeem");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ADVERSARIAL TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_adversarial_poolHijack_blocked() public {
        // Deploy a fresh hook (different address)
        address flags2 = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG |
                Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG |
                Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            ) ^ (0x5555 << 144)
        );
        bytes memory args2 = abi.encode(
            poolManager, Currency.unwrap(currency0), Currency.unwrap(currency1),
            oracle, kycPolicy, address(this), uint8(18), uint8(18),
            RWAHook.FeeConfig({ minFeeBips: 1, maxFeeBips: 100, lowThreshold: 1_000e18, highThreshold: 100_000e18 })
        );
        deployCodeTo("RWAHook.sol:RWAHook", args2, flags2);
        RWAHook hook2 = RWAHook(flags2);

        // Try to initialize with wrong tokens — should revert
        MockERC20 fakeToken = new MockERC20("FAKE", "FAKE", 18);
        Currency fakeCurrency = Currency.wrap(address(fakeToken));
        Currency c1 = currency1;
        if (Currency.unwrap(fakeCurrency) > Currency.unwrap(c1)) {
            (fakeCurrency, c1) = (c1, fakeCurrency);
        }
        PoolKey memory fakeKey = PoolKey(fakeCurrency, c1, 0, 1, IHooks(hook2));

        vm.expectRevert();
        poolManager.initialize(fakeKey, Constants.SQRT_PRICE_1_1);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     HELPERS
    // ═══════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════
    //                     SWAP EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    function test_swap_insufficientLiquidity() public {
        // Pool has 500k redeem from setUp, try to swap too much RWA
        vm.startPrank(bob);
        vm.expectRevert();
        _doSwapTo(true, 10_000_000e18, bob);
        vm.stopPrank();
    }

    // NOTE: exact-output test removed — production router only has swapExactTokensForTokens
    // which always does exact-input. Our hook reverts on exact-output via ExactOutputNotSupported.

    function test_swap_yieldRecall_coversShortfall() public {
        uint256 keepBuffer = 10_000e18;
        hook.deployToYield(hook.redeemReserve() - keepBuffer);

        uint256 redeemBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(bob);
        vm.startPrank(bob);
        _doSwapTo(true, 50_000e18, bob);
        vm.stopPrank();
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(bob), redeemBefore, "swap via yield recall");
    }

    function test_maxSwappableAmount() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);
        assertGt(hook.maxSwappableAmount(false), 0, "max for redeem to rwa");
        assertGt(hook.maxSwappableAmount(true), 0, "max for rwa to redeem");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     KYC FULL MODE TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_kyc_full_blocksUntrustedRouter() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setComplianceSigner(complianceSigner, true);
        // Do NOT add swapRouter as trusted
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        bytes memory auth = _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0);
        vm.startPrank(bob);
        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
    }

    function test_kyc_full_allowsKYCSwap() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setTrustedRouter(address(swapRouter), true);
        kycPolicy.setComplianceSigner(complianceSigner, true);
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        uint256 rwaBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(bob);
        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0), receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
        assertGt(MockERC20(Currency.unwrap(currency0)).balanceOf(bob), rwaBefore, "bob got RWA");
    }

    function test_kyc_full_blocksUnauthorizedSwapper() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setTrustedRouter(address(swapRouter), true);
        kycPolicy.setComplianceSigner(complianceSigner, true);
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        (address charlie,) = makeAddrAndKey("charlie2");
        _fundUser(charlie);
        bytes memory auth = _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0);
        vm.startPrank(charlie);
        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: charlie, deadline: block.timestamp + 1
        });
        vm.stopPrank();
    }

    function test_kyc_full_blocksReplay() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setTrustedRouter(address(swapRouter), true);
        kycPolicy.setComplianceSigner(complianceSigner, true);
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        bytes memory auth = _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0);

        vm.startPrank(bob);
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: bob, deadline: block.timestamp + 1
        });

        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
    }

    function test_kyc_full_blocksWrongAmountSignature() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setTrustedRouter(address(swapRouter), true);
        kycPolicy.setComplianceSigner(complianceSigner, true);
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        bytes memory auth = _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0);
        vm.startPrank(bob);
        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 150e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
    }

    function test_kyc_full_blocksUntrustedComplianceSigner() public {
        kycPolicy.setMode(RegistryKYCPolicy.Mode.FULL_COMPLIANCE_SIGNER);
        kycPolicy.setTrustedRouter(address(swapRouter), true);
        vm.prank(alice);
        hook.deposit(10_000e18, 0, 0, block.timestamp + 1);

        bytes memory auth = _signedSwapHookData(bob, 100e18, !_rwaIsCurrency0);
        vm.startPrank(bob);
        vm.expectRevert();
        swapRouter.swapExactTokensForTokens({
            amountIn: 100e18, amountOutMin: 0,
            zeroForOne: !_rwaIsCurrency0,
            poolKey: poolKey, hookData: auth, receiver: bob, deadline: block.timestamp + 1
        });
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    function test_edge_minimum_swap() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);
        vm.startPrank(bob);
        _doSwapTo(false, 1e15, bob); // 0.001 tokens
        vm.stopPrank();
    }

    function test_edge_zero_fee_swap() public {
        hook.setFeeConfig(RWAHook.FeeConfig({ minFeeBips: 0, maxFeeBips: 0, lowThreshold: 0, highThreshold: 1 }));
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        address rwa = Currency.unwrap(currency0);
        uint256 rwaBefore = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        _doSwapTo(false, 10_000e18, bob);
        vm.stopPrank();
        assertEq(MockERC20(rwa).balanceOf(bob) - rwaBefore, 10_000e18, "zero fee = exact 1:1");
    }

    function test_edge_deposit_then_swap_then_withdraw() public {
        vm.startPrank(bob);
        uint256 shares = hook.deposit(0, 50_000e18, 0, block.timestamp + 1);
        // Swap using bob as receiver — need RWA reserve for this direction
        vm.stopPrank();

        // Deposit RWA so there's something to swap into
        vm.prank(alice);
        hook.deposit(50_000e18, 0, 0, block.timestamp + 1);

        vm.startPrank(bob);
        _doSwapTo(false, 10_000e18, bob);
        hook.withdraw(shares, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        assertEq(hook.shares(bob), 0, "no shares left");
    }

    function test_edge_yield_deploy_swap_recalls_automatically() public {
        uint256 deployed = hook.redeemReserve();
        hook.deployToYield(deployed);
        assertEq(hook.redeemReserve(), 0);

        // Swap RWA -> Redeem should still work (waterfall auto-recalls from yield)
        uint256 redeemBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(bob);
        vm.startPrank(bob);
        _doSwapTo(true, 1_000e18, bob);
        vm.stopPrank();
        assertGt(MockERC20(Currency.unwrap(currency1)).balanceOf(bob), redeemBefore, "auto-recall from yield");
    }

    function test_edge_yield_recall_on_withdraw() public {
        vm.prank(alice);
        uint256 shares = hook.deposit(0, 100_000e18, 0, block.timestamp + 1);

        // Deploy most but not all to yield
        uint256 toDeploy = hook.redeemReserve() / 2;
        hook.deployToYield(toDeploy);

        // Withdraw should auto-recall from yield
        vm.startPrank(alice);
        hook.withdraw(shares, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        assertEq(hook.shares(alice), 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     BATTLE FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════

    function test_fuzz_swap_both_directions(uint256 amountIn, bool direction) public {
        amountIn = bound(amountIn, 1e18, 200_000e18);
        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        vm.startPrank(bob);
        _doSwap(direction, amountIn);
        vm.stopPrank();
    }

    function test_fuzz_deposit_share_proportionality(uint256 a, uint256 b) public {
        a = bound(a, 1e18, 500_000e18);
        b = bound(b, 1e18, 500_000e18);
        vm.prank(alice);
        uint256 s1 = hook.deposit(0, a, 0, block.timestamp + 1);
        vm.prank(bob);
        uint256 s2 = hook.deposit(0, b, 0, block.timestamp + 1);
        uint256 r1 = (s1 * 1e18) / a;
        uint256 r2 = (s2 * 1e18) / b;
        assertApproxEqRel(r1, r2, 0.01e18, "share rate consistent");
    }

    function test_fuzz_fee_always_within_bounds(uint256) public view {
        (uint16 minFee, uint16 maxFee,,) = hook.feeConfig();
        uint256 feeTrue = hook.getCurrentFee(true);
        uint256 feeFalse = hook.getCurrentFee(false);
        assertGe(feeTrue, minFee);
        assertLe(feeTrue, maxFee);
        assertGe(feeFalse, minFee);
        assertLe(feeFalse, maxFee);
    }

    function test_fuzz_oracle_rate_consistency(uint256 rate) public {
        rate = bound(rate, 0.5e18, 2e18);
        oracle.setRate(rate);

        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        uint256 swapAmt = 10_000e18;
        uint256 expectedOut = hook.getAmountOut(swapAmt, false);

        address rwa = Currency.unwrap(currency0);
        uint256 rwaBefore = MockERC20(rwa).balanceOf(bob);
        vm.startPrank(bob);
        _doSwapTo(false, swapAmt, bob);
        vm.stopPrank();
        uint256 actualOut = MockERC20(rwa).balanceOf(bob) - rwaBefore;

        assertEq(actualOut, expectedOut, "getAmountOut matches actual swap");
    }

    function test_fee_monotonically_increases_as_reserves_drain() public {
        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        uint256 prevFee = hook.getCurrentFee(false);
        vm.startPrank(bob);
        for (uint256 i = 0; i < 30; i++) {
            if (hook.rwaReserve() < 20_000e18) break;
            _doSwap(false, 10_000e18);
            uint256 currentFee = hook.getCurrentFee(false);
            assertGe(currentFee, prevFee, "fee monotonically increases");
            prevFee = currentFee;
        }
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     MULTI-USER STRESS
    // ═══════════════════════════════════════════════════════════════════

    function test_multiUser_full_lifecycle() public {
        address[] memory users = new address[](4);
        for (uint256 i = 0; i < 4; i++) {
            users[i] = makeAddr(string(abi.encodePacked("stressuser", vm.toString(i))));
            _fundUser(users[i]);
        }

        // Phase 1: deposits (both RWA and redeem for balanced pool)
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(users[i]);
            hook.deposit((i + 1) * 25_000e18, (i + 1) * 25_000e18, 0, block.timestamp + 1);
        }

        // Phase 2: swaps
        vm.startPrank(users[0]);
        _doSwapTo(false, 30_000e18, users[0]);
        vm.stopPrank();
        vm.startPrank(users[1]);
        _doSwapTo(true, 20_000e18, users[1]);
        vm.stopPrank();

        // Phase 3: yield
        hook.deployToYield(100_000e18);

        // Phase 4: oracle rate change
        oracle.setRate(1.05e18);

        // Phase 5: more swaps
        vm.startPrank(users[2]);
        _doSwapTo(false, 25_000e18, users[2]);
        vm.stopPrank();

        // Phase 6: recall yield, withdraw claims, then everyone withdraws
        hook.recallFromYield(hook.deployedToYield());
        // Withdraw any accumulated claims to real tokens
        if (hook.claimsRwa() > 0) hook.syncClaimsToReserves(Currency.unwrap(currency0), hook.claimsRwa());
        if (hook.claimsRedeem() > 0) hook.syncClaimsToReserves(Currency.unwrap(currency1), hook.claimsRedeem());

        for (uint256 i = 0; i < 4; i++) {
            vm.startPrank(users[i]);
            uint256 s = hook.shares(users[i]);
            if (s > 0) hook.withdraw(s, 0, 0, block.timestamp + 1);
            vm.stopPrank();
        }

        // All lifecycle users withdrew. setUp depositor + dead shares remain.
        for (uint256 i = 0; i < 4; i++) {
            assertEq(hook.shares(users[i]), 0, "lifecycle user withdrew all");
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     ADVERSARIAL: YIELD ACCRUAL
    // ═══════════════════════════════════════════════════════════════════

    function test_adversarial_yieldAccrual_reflected_in_shares() public {
        vm.prank(alice);
        hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        uint256 valueBefore = hook.shareValue(alice);
        hook.deployToYield(50_000e18);

        // Simulate yield accrual
        MockERC20(Currency.unwrap(currency1)).mint(address(yieldVault), 5_000e18);
        MockYieldVault(address(yieldVault)).accrueYield(5_000e18);

        uint256 valueAfter = hook.shareValue(alice);
        assertGt(valueAfter, valueBefore, "share value must include accrued yield");
    }

    function test_adversarial_yieldAccrual_withdrawable() public {
        vm.prank(alice);
        uint256 aliceShares = hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        hook.deployToYield(50_000e18);

        // Simulate yield accrual
        MockERC20(Currency.unwrap(currency1)).mint(address(yieldVault), 5_000e18);
        MockYieldVault(address(yieldVault)).accrueYield(5_000e18);

        uint256 balBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        vm.startPrank(alice);
        hook.withdraw(aliceShares, 0, 0, block.timestamp + 1);
        vm.stopPrank();
        uint256 received = MockERC20(Currency.unwrap(currency1)).balanceOf(alice) - balBefore;
        assertGt(received, 100_000e18 - 1000, "received more than deposited due to yield");
    }

    function test_pendingRedemptionCollateral_notIncludedInLpValue() public {
        uint256 valueBefore = hook.totalValue();

        vm.prank(alice);
        hook.requestRedemption(10_000e18);

        assertEq(hook.rwaRedemptionReserve(), 10_000e18, "locked redemption collateral tracked separately");
        assertEq(hook.totalValue(), valueBefore, "LP value should ignore pending redemption collateral");
    }

    function test_rebalance_syncsClaimsAndRedeploysExcess() public {
        vm.prank(alice);
        hook.deposit(100_000e18, 0, 0, block.timestamp + 1);

        vm.startPrank(bob);
        _doSwap(false, 20_000e18); // creates redeem claims
        vm.stopPrank();

        assertGt(hook.claimsRedeem(), 0, "claims should exist");
        hook.rebalance();
        assertGt(hook.redeemReserve(), 0, "rebalance should sync some claims into liquid reserve");
    }

    function test_rebalance_initiatesIssuerMint_forRwaShortfall() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        uint256 valueBefore = hook.totalValue();
        hook.rebalance();

        assertEq(hook.activeSettlementCount(), 1, "mint settlement should be active");
        assertGt(hook.pendingRedeemSentToIssuer(), 0, "redeem asset should be in flight");
        assertGt(hook.pendingRwaExpectedFromIssuer(), 0, "rwa should be expected from issuer");
        assertApproxEqAbs(hook.totalValue(), valueBefore, 1, "pending mint keeps LP value intact");
    }

    function test_finalizeSettlement_addsRwaReserve() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        hook.rebalance();
        bytes32 requestId = hook.activeSettlementIds(0);
        (, bool isMint, , uint256 expectedOutput,,) = hook.activeSettlements(requestId);
        assertTrue(isMint, "expected mint settlement");

        issuerAdapter.settle(requestId, Currency.unwrap(currency0), expectedOutput);
        hook.finalizeSettlement(requestId);

        assertEq(hook.activeSettlementCount(), 0, "settlement should be removed");
        assertEq(hook.pendingRedeemSentToIssuer(), 0, "no redeem should remain in flight");
        assertEq(hook.pendingRwaExpectedFromIssuer(), 0, "no rwa should remain pending");
        assertEq(hook.rwaReserve(), expectedOutput, "minted rwa becomes liquid reserve");
    }

    function test_rebalance_doesNotOvercorrectWithPendingMint() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        hook.rebalance();
        uint256 pendingRedeemAfterFirst = hook.pendingRedeemSentToIssuer();

        hook.rebalance();

        assertEq(hook.activeSettlementCount(), 1, "should not open a second same-direction settlement");
        assertEq(hook.pendingRedeemSentToIssuer(), pendingRedeemAfterFirst, "pending mint should not grow");
    }

    function test_rebalance_initiatesIssuerRedemption_forRedeemShortfall() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        uint256 ownerShares = hook.shares(address(this));
        hook.withdraw((ownerShares * 9) / 10, 0, 0, block.timestamp + 1);

        vm.prank(alice);
        hook.deposit(500_000e18, 0, 0, block.timestamp + 1);

        uint256 valueBefore = hook.totalValue();
        hook.rebalance();

        assertEq(hook.activeSettlementCount(), 1, "redemption settlement should be active");
        assertGt(hook.pendingRwaSentToIssuer(), 0, "rwa should be in flight");
        assertGt(hook.pendingRedeemExpectedFromIssuer(), 0, "redeem asset should be expected");
        assertApproxEqAbs(hook.totalValue(), valueBefore, 1, "pending redemption keeps LP value intact");
    }

    function test_getCurrentFee_creditsPendingIssuerMint() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        uint256 feeBefore = hook.getCurrentFee(false);
        hook.rebalance();
        uint256 feeAfter = hook.getCurrentFee(false);

        assertLt(feeAfter, feeBefore, "pending rwa from issuer should soften buy-side congestion fee");
    }

    function test_withdraw_revertsWhileIssuerSettlementPending() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        hook.rebalance();

        vm.expectRevert(RWAHook.ActiveSettlementsPending.selector);
        hook.withdraw(1e18, 0, 0, block.timestamp + 1);
    }

    function test_asyncExit_waitsForIssuerSettlementThenClaims() public {
        issuerAdapter = new MockIssuerAdapter();
        hook.setIssuerAdapter(issuerAdapter);
        rebalanceStrategy.setConfig(0, 0, 100_000e18, 100_000e18);

        vm.startPrank(alice);
        uint256 aliceShares = hook.deposit(0, 100_000e18, 0, block.timestamp + 1);
        hook.requestWithdraw(aliceShares);
        vm.stopPrank();

        hook.rebalance();
        bytes32 requestId = hook.activeSettlementIds(0);
        (, bool isMint, , uint256 expectedOutput,,) = hook.activeSettlements(requestId);
        assertTrue(isMint, "expected mint settlement");

        hook.processExitEpoch(0);
        (, , , uint256 pendingSettlementCount, bool processed) = hook.exitEpochs(0);
        assertTrue(processed, "epoch should be processed");
        assertEq(pendingSettlementCount, 1, "epoch should own pending settlement");

        issuerAdapter.settle(requestId, Currency.unwrap(currency0), expectedOutput);
        hook.finalizeSettlement(requestId);

        uint256 valueBeforeClaim = hook.totalValue();

        uint256 rwaBefore = MockERC20(Currency.unwrap(currency0)).balanceOf(alice);
        uint256 redeemBefore = MockERC20(Currency.unwrap(currency1)).balanceOf(alice);
        vm.prank(alice);
        (uint256 rwaOut, uint256 redeemOut) = hook.claimExit(0);

        assertEq(MockERC20(Currency.unwrap(currency0)).balanceOf(alice) - rwaBefore, rwaOut, "claimed rwa");
        assertEq(MockERC20(Currency.unwrap(currency1)).balanceOf(alice) - redeemBefore, redeemOut, "claimed redeem");
        assertGt(rwaOut + redeemOut, 0, "claim should return value");
        assertEq(hook.totalValue(), valueBeforeClaim, "claim should not change live pool NAV after epoch processing");
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     HELPERS
    // ═══════════════════════════════════════════════════════════════════

    function _doSwap(bool rwaForRedeem, uint256 amountIn) internal {
        _doSwapTo(rwaForRedeem, amountIn, address(this));
    }

    function _doSwapTo(bool rwaForRedeem, uint256 amountIn, address receiver) internal {
        bool zeroForOne = _rwaIsCurrency0 ? rwaForRedeem : !rwaForRedeem;
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: "",
            receiver: receiver,
            deadline: block.timestamp + 1
        });
    }

    function _signedSwapHookData(address swapper, uint256 amountIn, bool zeroForOne)
        internal
        view
        returns (bytes memory)
    {
        RegistryKYCPolicy.SwapAuthorization memory auth = RegistryKYCPolicy.SwapAuthorization({
            swapper: swapper,
            hook: address(hook),
            poolId: PoolId.unwrap(poolKey.toId()),
            router: address(swapRouter),
            tokenIn: zeroForOne ? Currency.unwrap(poolKey.currency0) : Currency.unwrap(poolKey.currency1),
            tokenOut: zeroForOne ? Currency.unwrap(poolKey.currency1) : Currency.unwrap(poolKey.currency0),
            amountIn: amountIn,
            zeroForOne: zeroForOne,
            nonce: kycPolicy.nonces(swapper),
            deadline: block.timestamp + 1,
            signature: ""
        });

        bytes32 structHash = keccak256(
            abi.encode(
                kycPolicy.SWAP_AUTHORIZATION_TYPEHASH(),
                auth.swapper,
                auth.hook,
                auth.poolId,
                auth.router,
                auth.tokenIn,
                auth.tokenOut,
                auth.amountIn,
                auth.zeroForOne,
                auth.nonce,
                auth.deadline
            )
        );

        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("RWAHookKYCPolicy")),
                keccak256(bytes("1")),
                block.chainid,
                address(kycPolicy)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(complianceSignerPk, digest);
        auth.signature = abi.encodePacked(r, s, v);

        return abi.encode(auth, complianceSigner);
    }
}
