// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
// CurrencySettler removed — was a test utility. settle() is inlined below.
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IKYCPolicy} from "./interfaces/IKYCPolicy.sol";
import {IRWAOracle} from "./interfaces/IRWAOracle.sol";
import {IClearingHouse} from "./interfaces/IClearingHouse.sol";
import {IYieldVault} from "./interfaces/IYieldVault.sol";
import {IRebalanceStrategy} from "./interfaces/IRebalanceStrategy.sol";
import {IIssuerAdapter} from "./interfaces/IIssuerAdapter.sol";
import {IOUToken} from "./IOUToken.sol";

/// @title RWAHook
/// @notice Uniswap v4 hook implementing a fixed-price AMM for Real World Assets.
///
/// Token flow (AsyncSwap / Custom Curve pattern per Uniswap docs):
///   INPUT:  hook calls poolManager.mint() → creates ERC6909 claims, no PM buffer needed.
///           The router settles the user's real tokens to PM after beforeSwap returns.
///   OUTPUT: hook calls outputCurrency.settle() → transfers real tokens from hook to PM.
///           The router takes output tokens from PM to the user.
///
/// The hook tracks two types of reserves:
///   - ERC6909 claims (input tokens accumulated in PM, tracked as `claimsRwa`/`claimsRedeem`)
///   - ERC20 balances (tokens in hook's wallet from LP deposits, tracked as `rwaReserve`/`redeemReserve`)
///
/// The hook implements IUnlockCallback so it can call poolManager.unlock() to convert
/// ERC6909 claims into real ERC20 tokens when needed (yield deployment, clearing house, etc).
contract RWAHook is BaseHook, IUnlockCallback, Ownable {
    using PoolIdLibrary for PoolKey;

    struct FeeConfig {
        uint16 minFeeBips;
        uint16 maxFeeBips;
        uint256 lowThreshold;
        uint256 highThreshold;
    }

    struct ActiveSettlement {
        bytes32 requestId;
        bool isMint;
        uint256 inputAmount;
        uint256 expectedOutputAmount;
        uint256 requestRate;
        uint256 initiatedAt;
    }

    struct ExitEpoch {
        uint256 totalShares;
        uint256 rwaReserved;
        uint256 redeemReserved;
        uint256 pendingSettlementCount;
        bool processed;
    }

    uint16 public constant MAX_FEE_BIPS = 10_000;
    uint16 public constant PENDING_SETTLEMENT_CREDIT_BIPS = 5_000;
    uint256 public constant MINIMUM_SHARES = 1000;
    uint256 public constant MAX_ORACLE_STALENESS = 1 days;

    // ─── Immutables ────────────────────────────────────────────────────
    // poolManager is inherited from BaseHook
    address public immutable rwaToken;
    address public immutable redeemAsset;
    uint8 public immutable rwaDecimals;
    uint8 public immutable redeemDecimals;

    // ─── State ─────────────────────────────────────────────────────────
    bool public poolInitialized;
    bool public rwaIsCurrency0;

    IRWAOracle public oracle;
    IKYCPolicy public kycPolicy;
    IClearingHouse public clearingHouse;
    IYieldVault public yieldVault;
    IRebalanceStrategy public rebalanceStrategy;
    IIssuerAdapter public issuerAdapter;
    IOUToken public iouToken;
    address public pendingOwner;
    FeeConfig public feeConfig;

    // LP accounting
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    // Reserves: ERC20 tokens held directly in hook's wallet (from LP deposits)
    uint256 public rwaReserve;
    uint256 public redeemReserve;
    uint256 public rwaRedemptionReserve;

    // Claims: ERC6909 tokens held in PM (from swap inputs via mint())
    uint256 public claimsRwa;
    uint256 public claimsRedeem;

    // Yield & IOU tracking
    uint256 public deployedToYield;
    uint256 public iouReserve;
    uint256 public totalPendingRedemptions;

    // Issuer settlement tracking
    mapping(bytes32 => ActiveSettlement) public activeSettlements;
    bytes32[] public activeSettlementIds;
    mapping(bytes32 => uint256) private _activeSettlementIndexPlusOne;
    uint256 public pendingRwaSentToIssuer;
    uint256 public pendingRedeemSentToIssuer;
    uint256 public pendingRwaExpectedFromIssuer;
    uint256 public pendingRedeemExpectedFromIssuer;

    // Async LP exit tracking
    uint256 public currentExitEpoch;
    mapping(uint256 => ExitEpoch) public exitEpochs;
    mapping(uint256 => mapping(address => uint256)) public exitEpochShares;
    mapping(uint256 => mapping(bytes32 => uint256)) public exitEpochSettlementShares;
    mapping(bytes32 => uint256[]) private _settlementEpochIds;
    mapping(bytes32 => uint256) public allocatedSettlementShares;

    // Reentrancy lock
    uint256 private _locked = 1;

    // ─── Events ────────────────────────────────────────────────────────
    event Deposit(address indexed lp, uint256 rwaAmount, uint256 redeemAmount, uint256 shares);
    event Withdraw(address indexed lp, uint256 shares, uint256 rwaOut, uint256 redeemOut);
    event YieldDeployed(uint256 amount);
    event YieldRecalled(uint256 amount);
    event ClearingHouseSettlement(uint256 rwaAmount, uint256 redeemAmount, address indexed recipient);
    event IOUMinted(address indexed recipient, uint256 amount);
    event IOUResolved(uint256 amount);
    event IOURedeemed(address indexed holder, uint256 iouBurned, uint256 redeemReceived);
    event ClaimsWithdrawn(address indexed token, uint256 amount);
    event OwnershipTransferProposed(address indexed currentOwner, address indexed pendingOwner);
    event ClearingHouseUpdated(address indexed oldCH, address indexed newCH);
    event YieldVaultUpdated(address indexed oldVault, address indexed newVault);
    event IOUTokenUpdated(address indexed token);
    event KYCPolicyUpdated(address indexed policy);
    event FeeConfigUpdated(uint16 minFeeBips, uint16 maxFeeBips, uint256 lowThreshold, uint256 highThreshold);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event RebalanceStrategyUpdated(address indexed strategy);
    event IssuerAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
    event ClaimsSynced(address indexed token, uint256 amount);
    event Rebalanced(uint256 targetRwaReserve, uint256 targetRedeemReserve);
    event RedemptionCollateralTransferred(address indexed recipient, uint256 amount);
    event IssuerRedemptionInitiated(bytes32 indexed requestId, uint256 rwaAmount, uint256 expectedRedeemOut);
    event IssuerMintInitiated(bytes32 indexed requestId, uint256 redeemAmount, uint256 expectedRwaOut);
    event IssuerSettlementFinalized(bytes32 indexed requestId, bool isMint, uint256 outputAmount);
    event WithdrawRequested(address indexed lp, uint256 indexed epochId, uint256 shares);
    event ExitEpochProcessed(uint256 indexed epochId, uint256 sharesBurned, uint256 rwaReserved, uint256 redeemReserved);
    event ExitClaimed(address indexed lp, uint256 indexed epochId, uint256 rwaOut, uint256 redeemOut);

    // ─── Errors ────────────────────────────────────────────────────────
    error PoolAlreadyInitialized();
    error PoolNotInitialized();
    error NotOwner();
    error NotPendingOwner();
    error KYCRequired();
    error InsufficientLiquidity();
    error ZeroAmount();
    error ZeroAddress();
    error DeadlineExpired();
    error SlippageExceeded();
    error InvalidFeeConfig();
    // HookNotImplemented inherited from BaseHook
    error ExactOutputNotSupported();
    error OracleStale();
    error OracleRateOutOfBounds();
    error Reentrancy();
    error YieldStillDeployed();
    error ClearingHousePaymentFailed();
    error UnknownSettlement();
    error SettlementNotReady();
    error SettlementAlreadyExists();
    error SettlementBalanceMismatch();
    error ActiveSettlementsPending();
    error ExitEpochNotReady();
    error ExitEpochAlreadyProcessed();
    // InvalidPool inherited from BaseHook
    error RouterNotAllowed();

    // ─── Modifiers ─────────────────────────────────────────────────────
    // onlyPoolManager is inherited from BaseHook

    modifier onlyInitialized() {
        _onlyInitialized();
        _;
    }

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    // ─── Constructor ───────────────────────────────────────────────────
    constructor(
        IPoolManager _poolManager,
        address _rwaToken,
        address _redeemAsset,
        IRWAOracle _oracle,
        IKYCPolicy _kycPolicy,
        address _owner,
        uint8 _rwaDecimals,
        uint8 _redeemDecimals,
        FeeConfig memory _feeConfig
    ) BaseHook(_poolManager) Ownable(_owner) {
        rwaToken = _rwaToken;
        redeemAsset = _redeemAsset;
        oracle = _oracle;
        kycPolicy = _kycPolicy;
        rwaDecimals = _rwaDecimals;
        redeemDecimals = _redeemDecimals;

        _validateFeeConfig(_feeConfig);
        feeConfig = _feeConfig;

        rwaIsCurrency0 = _rwaToken < _redeemAsset;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address token, uint256 amount) = abi.decode(data, (address, uint256));
        Currency currency = Currency.wrap(token);

        // Burn ERC6909 claims
        poolManager.burn(address(this), currency.toId(), amount);
        // Take real ERC20 tokens from PM
        poolManager.take(currency, address(this), amount);

        return "";
    }

    function deposit(
        uint256 rwaAmount,
        uint256 redeemAmount,
        uint256 minShares,
        uint256 deadline
    ) external onlyInitialized nonReentrant returns (uint256 newShares) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (rwaAmount == 0 && redeemAmount == 0) revert ZeroAmount();

        if (address(kycPolicy) != address(0) && !kycPolicy.validateDeposit(msg.sender)) {
            revert KYCRequired();
        }

        // CEI: Transfer tokens BEFORE computing shares
        if (rwaAmount > 0) {
            _safeTransferFrom(rwaToken, msg.sender, address(this), rwaAmount);
            rwaReserve += rwaAmount;
        }
        if (redeemAmount > 0) {
            _safeTransferFrom(redeemAsset, msg.sender, address(this), redeemAmount);
            redeemReserve += redeemAmount;
        }

        uint256 rate = _getValidRate();
        uint256 depositValue = redeemAmount + _convertWithRate(rwaAmount, rate, true);

        if (totalShares == 0) {
            newShares = depositValue - MINIMUM_SHARES;
            totalShares = depositValue;
            shares[address(1)] = MINIMUM_SHARES;
            shares[msg.sender] = newShares;
        } else {
            uint256 preDepositValue = _totalValueWithRate(rate) - depositValue;
            newShares = (depositValue * totalShares) / preDepositValue;
            totalShares += newShares;
            shares[msg.sender] += newShares;
        }

        if (newShares < minShares) revert SlippageExceeded();

        emit Deposit(msg.sender, rwaAmount, redeemAmount, newShares);
    }

    function withdraw(
        uint256 sharesToBurn,
        uint256 minRwaOut,
        uint256 minRedeemOut,
        uint256 deadline
    ) external onlyInitialized nonReentrant returns (uint256 rwaOut, uint256 redeemOut) {
        if (activeSettlementIds.length > 0) revert ActiveSettlementsPending();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (sharesToBurn == 0) revert ZeroAmount();
        if (shares[msg.sender] < sharesToBurn) revert InsufficientLiquidity();

        // Total reserves include both ERC20 balances and ERC6909 claims
        uint256 totalRwa = rwaReserve + claimsRwa;
        uint256 yieldBalance = _yieldVaultBalance();
        uint256 totalRedeem = redeemReserve + claimsRedeem + yieldBalance;

        rwaOut = (totalRwa * sharesToBurn) / totalShares;
        redeemOut = (totalRedeem * sharesToBurn) / totalShares;

        if (rwaOut < minRwaOut || redeemOut < minRedeemOut) revert SlippageExceeded();

        shares[msg.sender] -= sharesToBurn;
        totalShares -= sharesToBurn;

        // Send RWA — use ERC20 balance first, then withdraw claims if needed
        if (rwaOut > 0) {
            _ensureRwaLiquidity(rwaOut);
            rwaReserve -= rwaOut;
            _safeTransfer(rwaToken, msg.sender, rwaOut);
        }

        // Send redeem — use ERC20 balance, then claims, then yield
        if (redeemOut > 0) {
            _ensureRedeemLiquidity(redeemOut);
            redeemReserve -= redeemOut;
            _safeTransfer(redeemAsset, msg.sender, redeemOut);
        }

        emit Withdraw(msg.sender, sharesToBurn, rwaOut, redeemOut);
    }

    /// @notice Queues shares for a full-value async exit. The shares remain part of the
    ///         pool NAV until the exit epoch is processed, but the user cannot withdraw them twice.
    function requestWithdraw(uint256 sharesToQueue) external onlyInitialized nonReentrant {
        if (sharesToQueue == 0) revert ZeroAmount();
        if (shares[msg.sender] < sharesToQueue) revert InsufficientLiquidity();

        shares[msg.sender] -= sharesToQueue;
        exitEpochShares[currentExitEpoch][msg.sender] += sharesToQueue;
        exitEpochs[currentExitEpoch].totalShares += sharesToQueue;

        emit WithdrawRequested(msg.sender, currentExitEpoch, sharesToQueue);
    }

    /// @notice Converts the current exit queue into segregated reserves once all active issuer
    ///         settlements have completed. This keeps exiting LPs from depending on fake liquidity.
    function processExitEpoch(uint256 epochId) external onlyInitialized nonReentrant {
        if (address(issuerAdapter) != address(0)) {
            _finalizeCompletedSettlements(type(uint256).max);
        }

        ExitEpoch storage epoch = exitEpochs[epochId];
        if (epoch.processed) revert ExitEpochAlreadyProcessed();
        if (epoch.totalShares == 0) revert ExitEpochNotReady();

        if (claimsRwa > 0) _syncClaimsToReserves(rwaToken, claimsRwa);
        if (claimsRedeem > 0) _syncClaimsToReserves(redeemAsset, claimsRedeem);
        if (deployedToYield > 0) _recallFromYield(deployedToYield);

        uint256 sharesOutstanding = totalShares;
        uint256 rwaReserved = (rwaReserve * epoch.totalShares) / sharesOutstanding;
        uint256 redeemReserved = (redeemReserve * epoch.totalShares) / sharesOutstanding;

        rwaReserve -= rwaReserved;
        redeemReserve -= redeemReserved;
        totalShares -= epoch.totalShares;

        for (uint256 i = 0; i < activeSettlementIds.length; i++) {
            bytes32 requestId = activeSettlementIds[i];
            if (exitEpochSettlementShares[epochId][requestId] != 0) continue;
            exitEpochSettlementShares[epochId][requestId] = epoch.totalShares;
            allocatedSettlementShares[requestId] += epoch.totalShares;
            _settlementEpochIds[requestId].push(epochId);
            epoch.pendingSettlementCount += 1;
        }

        epoch.rwaReserved = rwaReserved;
        epoch.redeemReserved = redeemReserved;
        epoch.processed = true;

        if (epochId == currentExitEpoch) {
            currentExitEpoch = epochId + 1;
        }

        emit ExitEpochProcessed(epochId, epoch.totalShares, rwaReserved, redeemReserved);
    }

    /// @notice Claims a processed exit epoch position.
    function claimExit(uint256 epochId) external onlyInitialized nonReentrant returns (uint256 rwaOut, uint256 redeemOut) {
        ExitEpoch storage epoch = exitEpochs[epochId];
        if (!epoch.processed) revert ExitEpochNotReady();
        if (epoch.pendingSettlementCount > 0) revert ActiveSettlementsPending();

        uint256 userShares = exitEpochShares[epochId][msg.sender];
        if (userShares == 0) revert ZeroAmount();

        rwaOut = (epoch.rwaReserved * userShares) / epoch.totalShares;
        redeemOut = (epoch.redeemReserved * userShares) / epoch.totalShares;

        exitEpochShares[epochId][msg.sender] = 0;
        epoch.rwaReserved -= rwaOut;
        epoch.redeemReserved -= redeemOut;
        epoch.totalShares -= userShares;

        if (rwaOut > 0) _safeTransfer(rwaToken, msg.sender, rwaOut);
        if (redeemOut > 0) _safeTransfer(redeemAsset, msg.sender, redeemOut);

        emit ExitClaimed(msg.sender, epochId, rwaOut, redeemOut);
    }

    function requestRedemption(uint256 rwaAmount) external onlyInitialized nonReentrant returns (uint256 iouAmount) {
        if (rwaAmount == 0) revert ZeroAmount();
        if (address(iouToken) == address(0)) revert HookNotImplemented();

        if (address(kycPolicy) != address(0) && !kycPolicy.validateRedemption(msg.sender)) {
            revert KYCRequired();
        }

        _safeTransferFrom(rwaToken, msg.sender, address(this), rwaAmount);
        rwaRedemptionReserve += rwaAmount;

        iouAmount = _convertWithRate(rwaAmount, _getValidRate(), true);
        iouToken.mint(msg.sender, iouAmount);
        totalPendingRedemptions += iouAmount;

        emit IOUMinted(msg.sender, iouAmount);
    }

    function resolveIOUs(uint256 amount) external onlyOwner {
        _safeTransferFrom(redeemAsset, msg.sender, address(this), amount);
        iouReserve += amount;
        if (amount > totalPendingRedemptions) {
            totalPendingRedemptions = 0;
        } else {
            totalPendingRedemptions -= amount;
        }
        emit IOUResolved(amount);
    }

    function redeemIOU(uint256 iouAmount) external nonReentrant {
        if (iouAmount == 0) revert ZeroAmount();
        if (iouAmount > iouReserve) revert InsufficientLiquidity();

        iouToken.burn(msg.sender, iouAmount);
        iouReserve -= iouAmount;
        _safeTransfer(redeemAsset, msg.sender, iouAmount);

        emit IOURedeemed(msg.sender, iouAmount, iouAmount);
    }

    function airdropAndBurnIOUs(address[] calldata holders) external onlyOwner nonReentrant {
        for (uint256 i = 0; i < holders.length; i++) {
            uint256 bal = iouToken.balanceOf(holders[i]);
            if (bal == 0) continue;
            if (bal > iouReserve) bal = iouReserve;

            iouToken.burn(holders[i], bal);
            iouReserve -= bal;
            _safeTransfer(redeemAsset, holders[i], bal);

            emit IOURedeemed(holders[i], bal, bal);
        }
    }

    function deployToYield(uint256 amount) external onlyOwner onlyInitialized {
        if (address(yieldVault) == address(0)) revert ZeroAddress();
        if (amount > redeemReserve) revert InsufficientLiquidity();
        redeemReserve -= amount;
        IERC20Minimal(redeemAsset).approve(address(yieldVault), amount);
        yieldVault.deposit(amount, address(this));
        deployedToYield += amount;
        emit YieldDeployed(amount);
    }

    function recallFromYield(uint256 amount) external onlyOwner onlyInitialized {
        _recallFromYield(amount);
    }

    function setClearingHouse(IClearingHouse _clearingHouse) external onlyOwner {
        emit ClearingHouseUpdated(address(clearingHouse), address(_clearingHouse));
        clearingHouse = _clearingHouse;
    }

    function setYieldVault(IYieldVault _vault) external onlyOwner {
        if (deployedToYield > 0) revert YieldStillDeployed();
        emit YieldVaultUpdated(address(yieldVault), address(_vault));
        yieldVault = _vault;
    }

    function setIOUToken(IOUToken _iouToken) external onlyOwner {
        iouToken = _iouToken;
        emit IOUTokenUpdated(address(_iouToken));
    }

    function setKYCPolicy(IKYCPolicy _policy) external onlyOwner {
        kycPolicy = _policy;
        emit KYCPolicyUpdated(address(_policy));
    }

    function setRebalanceStrategy(IRebalanceStrategy _strategy) external onlyOwner {
        rebalanceStrategy = _strategy;
        emit RebalanceStrategyUpdated(address(_strategy));
    }

    function setIssuerAdapter(IIssuerAdapter _adapter) external onlyOwner {
        emit IssuerAdapterUpdated(address(issuerAdapter), address(_adapter));
        issuerAdapter = _adapter;
    }

    function setOracle(IRWAOracle _oracle) external onlyOwner {
        if (address(_oracle) == address(0)) revert ZeroAddress();
        emit OracleUpdated(address(oracle), address(_oracle));
        oracle = _oracle;
    }

    function setFeeConfig(FeeConfig calldata _config) external onlyOwner {
        _validateFeeConfig(_config);
        feeConfig = _config;
        emit FeeConfigUpdated(_config.minFeeBips, _config.maxFeeBips, _config.lowThreshold, _config.highThreshold);
    }

    function proposeOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(owner(), newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        _transferOwnership(msg.sender);
        pendingOwner = address(0);
    }

    /// @notice Transfers locked RWA redemption collateral to an external settlement recipient.
    ///         This is the hook-side bridge to offchain / issuer settlement rails.
    function transferRedemptionCollateral(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount > rwaRedemptionReserve) revert InsufficientLiquidity();
        rwaRedemptionReserve -= amount;
        _safeTransfer(rwaToken, recipient, amount);
        emit RedemptionCollateralTransferred(recipient, amount);
    }

    /// @notice Finalizes up to `maxCount` issuer settlements that have already completed.
    function finalizeCompletedSettlements(uint256 maxCount)
        external
        onlyInitialized
        nonReentrant
        returns (uint256 finalized)
    {
        finalized = _finalizeCompletedSettlements(maxCount);
    }

    /// @notice Finalizes one specific issuer settlement.
    function finalizeSettlement(bytes32 requestId) external onlyInitialized nonReentrant {
        _finalizeSettlement(requestId);
    }

    /// @notice Publicly callable rebalance that syncs claims and moves redeem assets
    ///         between the hook, issuer settlement rail, and yield vault according to the active strategy.
    function rebalance() external onlyInitialized nonReentrant {
        if (address(rebalanceStrategy) == address(0)) revert HookNotImplemented();

        if (address(issuerAdapter) != address(0)) {
            _finalizeCompletedSettlements(type(uint256).max);
        }

        uint256 rate = _getValidRate();
        IRebalanceStrategy.RebalanceState memory state = IRebalanceStrategy.RebalanceState({
            rwaReserve: rwaReserve,
            redeemReserve: redeemReserve,
            claimsRwa: claimsRwa,
            claimsRedeem: claimsRedeem,
            deployedToYield: deployedToYield,
            pendingRwaSentToIssuer: pendingRwaSentToIssuer,
            pendingRedeemSentToIssuer: pendingRedeemSentToIssuer,
            pendingRwaExpectedFromIssuer: pendingRwaExpectedFromIssuer,
            pendingRedeemExpectedFromIssuer: pendingRedeemExpectedFromIssuer,
            freeRwaAssets: rwaReserve + claimsRwa,
            freeRedeemAssets: redeemReserve + claimsRedeem + _yieldVaultBalance(),
            totalManagedValueInRedeem: _totalValueWithRate(rate),
            rate: rate
        });

        (uint256 targetRwaReserve, uint256 targetRedeemReserve) = rebalanceStrategy.computeTargets(state);

        if (targetRwaReserve > rwaReserve && claimsRwa > 0) {
            uint256 rwaToSync = targetRwaReserve - rwaReserve;
            if (rwaToSync > claimsRwa) rwaToSync = claimsRwa;
            _syncClaimsToReserves(rwaToken, rwaToSync);
        }

        if (targetRedeemReserve > redeemReserve) {
            uint256 needed = targetRedeemReserve - redeemReserve;

            if (claimsRedeem > 0) {
                uint256 redeemToSync = needed > claimsRedeem ? claimsRedeem : needed;
                _syncClaimsToReserves(redeemAsset, redeemToSync);
                needed = targetRedeemReserve > redeemReserve ? targetRedeemReserve - redeemReserve : 0;
            }

            if (needed > 0 && deployedToYield > 0) {
                _recallFromYield(needed);
            }
        }

        uint256 freeRwaAssets = rwaReserve + claimsRwa;
        uint256 freeRedeemAssets = redeemReserve + claimsRedeem + _yieldVaultBalance();
        uint256 effectiveRwaAssets = freeRwaAssets + pendingRwaExpectedFromIssuer;
        uint256 effectiveRedeemAssets = freeRedeemAssets + pendingRedeemExpectedFromIssuer;

        if (address(issuerAdapter) != address(0)) {
            if (effectiveRedeemAssets < targetRedeemReserve && freeRwaAssets > targetRwaReserve) {
                uint256 redeemShortfall = targetRedeemReserve - effectiveRedeemAssets;
                uint256 rwaExcess = freeRwaAssets - targetRwaReserve;
                uint256 rwaToRedeem = _convertWithRate(redeemShortfall, rate, false);
                if (rwaToRedeem > rwaExcess) rwaToRedeem = rwaExcess;
                _initiateIssuerRedemption(rwaToRedeem, rate);
            } else if (effectiveRwaAssets < targetRwaReserve && freeRedeemAssets > targetRedeemReserve) {
                uint256 rwaShortfall = targetRwaReserve - effectiveRwaAssets;
                uint256 redeemExcess = freeRedeemAssets - targetRedeemReserve;
                uint256 redeemToMint = _convertWithRate(rwaShortfall, rate, true);
                if (redeemToMint > redeemExcess) redeemToMint = redeemExcess;
                _initiateIssuerMint(redeemToMint, rate);
            }
        }

        if (redeemReserve > targetRedeemReserve && address(yieldVault) != address(0)) {
            uint256 excess = redeemReserve - targetRedeemReserve;
            IERC20Minimal(redeemAsset).approve(address(yieldVault), excess);
            redeemReserve -= excess;
            yieldVault.deposit(excess, address(this));
            deployedToYield += excess;
            emit YieldDeployed(excess);
        }

        emit Rebalanced(targetRwaReserve, targetRedeemReserve);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     EXTERNAL VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function totalValue() external view returns (uint256) { return _totalValue(); }

    function activeSettlementCount() external view returns (uint256) {
        return activeSettlementIds.length;
    }

    function getAmountOut(uint256 amountIn, bool swapRwaForRedeem) external view returns (uint256) {
        uint256 fee = _calculateFee(amountIn, swapRwaForRedeem);
        return _convertWithRate(amountIn - fee, _getValidRate(), swapRwaForRedeem);
    }

    function getCurrentFee(bool swapRwaForRedeem) external view returns (uint256) {
        uint256 rate = _getValidRate();
        return swapRwaForRedeem ? _congestionFee(_effectiveRedeemReserve(rate)) : _congestionFee(_effectiveRwaReserve());
    }

    function shareValue(address lp) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (_totalValue() * shares[lp]) / totalShares;
    }

    function maxSwappableAmount(bool swapRwaForRedeem) external view returns (uint256) {
        uint256 rate = _getValidRate();
        if (swapRwaForRedeem) {
            uint256 totalRedeem = redeemReserve + _yieldVaultBalance();
            if (address(clearingHouse) != address(0)) {
                uint256 maxCollateralizedByWallet = _convertWithRate(rwaReserve, rate, true);
                uint256 chLiquidity = clearingHouse.availableLiquidity();
                totalRedeem += chLiquidity < maxCollateralizedByWallet ? chLiquidity : maxCollateralizedByWallet;
            }
            return _convertWithRate(totalRedeem, rate, false);
        } else {
            return _convertWithRate(rwaReserve, rate, true);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     PUBLIC FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Converts accumulated ERC6909 claims into real ERC20 tokens in the hook wallet.
    ///         Anyone can call this, as it only improves the hook's liquid inventory.
    function syncClaimsToReserves(address token, uint256 amount) public onlyInitialized nonReentrant {
        _syncClaimsToReserves(token, amount);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function _beforeInitialize(address, PoolKey calldata key, uint160)
        internal
        override
        returns (bytes4)
    {
        if (poolInitialized) revert PoolAlreadyInitialized();

        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        bool validPair = rwaIsCurrency0
            ? (c0 == rwaToken && c1 == redeemAsset)
            : (c0 == redeemAsset && c1 == rwaToken);
        if (!validPair) revert InvalidPool();

        poolInitialized = true;
        return BaseHook.beforeInitialize.selector;
    }

    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override nonReentrant returns (bytes4, BeforeSwapDelta, uint24) {
        if (params.amountSpecified >= 0) revert ExactOutputNotSupported();

        uint256 rate = _getValidRate();
        uint256 amountIn = uint256(-params.amountSpecified);
        bool swapRwaForRedeem = rwaIsCurrency0 ? params.zeroForOne : !params.zeroForOne;

        (Currency inputCurrency, Currency outputCurrency) = params.zeroForOne
            ? (key.currency0, key.currency1)
            : (key.currency1, key.currency0);

        if (address(kycPolicy) != address(0)) {
            IKYCPolicy.SwapValidationContext memory context = IKYCPolicy.SwapValidationContext({
                router: sender,
                poolId: PoolId.unwrap(key.toId()),
                tokenIn: Currency.unwrap(inputCurrency),
                tokenOut: Currency.unwrap(outputCurrency),
                amountIn: amountIn,
                zeroForOne: params.zeroForOne
            });
            if (!kycPolicy.validateSwap(context, hookData)) revert KYCRequired();
        }

        poolManager.mint(address(this), inputCurrency.toId(), amountIn);

        if (swapRwaForRedeem) {
            claimsRwa += amountIn;
        } else {
            claimsRedeem += amountIn;
        }

        uint256 amountOut;

        if (swapRwaForRedeem) {
            uint256 fee = _calculateFee(amountIn, true);
            amountOut = _convertWithRate(amountIn - fee, rate, true);

            if (amountOut <= redeemReserve) {
                redeemReserve -= amountOut;
            } else {
                uint256 shortfall = amountOut - redeemReserve;

                if (deployedToYield > 0 && address(yieldVault) != address(0)) {
                    uint256 recallAmount = shortfall > deployedToYield ? deployedToYield : shortfall;
                    _recallFromYield(recallAmount);
                    shortfall = amountOut > redeemReserve ? amountOut - redeemReserve : 0;
                }

                if (shortfall == 0) {
                    redeemReserve -= amountOut;
                } else if (address(clearingHouse) != address(0)) {
                    uint256 rwaForClearing = _convertWithRate(shortfall, rate, false);
                    if (rwaForClearing > rwaReserve) revert InsufficientLiquidity();

                    uint256 balBefore = IERC20Minimal(redeemAsset).balanceOf(address(this));
                    IERC20Minimal(rwaToken).approve(address(clearingHouse), rwaForClearing);
                    bool success = clearingHouse.settle(rwaToken, rwaForClearing, shortfall, address(this));
                    if (!success) revert InsufficientLiquidity();

                    uint256 received = IERC20Minimal(redeemAsset).balanceOf(address(this)) - balBefore;
                    if (received < shortfall) revert ClearingHousePaymentFailed();

                    rwaReserve -= rwaForClearing;
                    redeemReserve = 0;
                    emit ClearingHouseSettlement(rwaForClearing, shortfall, address(this));
                } else {
                    revert InsufficientLiquidity();
                }
            }
        } else {
            uint256 fee = _calculateFee(amountIn, false);
            amountOut = _convertWithRate(amountIn - fee, rate, false);

            if (amountOut > rwaReserve) revert InsufficientLiquidity();
            rwaReserve -= amountOut;
        }

        poolManager.sync(outputCurrency);
        _safeTransfer(Currency.unwrap(outputCurrency), address(poolManager), amountOut);
        poolManager.settle();

        BeforeSwapDelta beforeSwapDelta = toBeforeSwapDelta(int128(uint128(amountIn)), -int128(int256(amountOut)));
        return (BaseHook.beforeSwap.selector, beforeSwapDelta, 0);
    }

    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function _beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function _onlyInitialized() internal view {
        if (!poolInitialized) revert PoolNotInitialized();
    }

    function _nonReentrantBefore() internal {
        if (_locked == 2) revert Reentrancy();
        _locked = 2;
    }

    function _nonReentrantAfter() internal {
        _locked = 1;
    }

    function _syncClaimsToReserves(address token, uint256 amount) internal {
        if (token == rwaToken) {
            if (amount > claimsRwa) amount = claimsRwa;
            claimsRwa -= amount;
            rwaReserve += amount;
        } else if (token == redeemAsset) {
            if (amount > claimsRedeem) amount = claimsRedeem;
            claimsRedeem -= amount;
            redeemReserve += amount;
        } else {
            revert ZeroAddress();
        }

        poolManager.unlock(abi.encode(token, amount));

        emit ClaimsSynced(token, amount);
        emit ClaimsWithdrawn(token, amount);
    }

    function _recallFromYield(uint256 amount) internal {
        if (amount > deployedToYield) amount = deployedToYield;
        if (amount == 0) return;
        uint256 withdrawn = yieldVault.withdraw(amount, address(this), address(this));
        uint256 deducted = withdrawn < amount ? withdrawn : amount;
        deployedToYield -= deducted;
        redeemReserve += withdrawn;
        emit YieldRecalled(withdrawn);
    }

    function _totalValue() internal view returns (uint256) {
        return _totalValueWithRate(_getValidRate());
    }

    function _totalValueWithRate(uint256 rate) internal view returns (uint256) {
        uint256 totalRwa = rwaReserve + claimsRwa;
        uint256 rwaValue = _convertWithRate(totalRwa, rate, true);
        uint256 yieldBalance = _yieldVaultBalance();
        uint256 pendingIssuerValue =
            pendingRedeemExpectedFromIssuer + _convertWithRate(pendingRwaExpectedFromIssuer, rate, true);
        return redeemReserve + claimsRedeem + yieldBalance + rwaValue + pendingIssuerValue;
    }

    function _convertWithRate(uint256 amount, uint256 rate, bool rwaToRedeem) internal view returns (uint256) {
        if (rate == 0) revert OracleRateOutOfBounds();
        if (amount == 0) return 0;
        if (rwaToRedeem) {
            return (amount * rate * (10 ** redeemDecimals)) / ((10 ** rwaDecimals) * 1e18);
        } else {
            return (amount * 1e18 * (10 ** rwaDecimals)) / (rate * (10 ** redeemDecimals));
        }
    }

    function _getValidRate() internal view returns (uint256 rate) {
        uint256 updatedAt;
        (rate, updatedAt) = oracle.rateWithTimestamp();
        if (rate == 0) revert OracleRateOutOfBounds();
        if (block.timestamp - updatedAt > MAX_ORACLE_STALENESS) revert OracleStale();
    }

    function _calculateFee(uint256 amountIn, bool swapRwaForRedeem) internal view returns (uint256) {
        uint256 rate = _getValidRate();
        uint256 feeBips =
            swapRwaForRedeem ? _congestionFee(_effectiveRedeemReserve(rate)) : _congestionFee(_effectiveRwaReserve());
        return (amountIn * feeBips) / 10_000;
    }

    function _congestionFee(uint256 reserve) internal view returns (uint256) {
        FeeConfig memory fc = feeConfig;
        if (reserve >= fc.highThreshold) return fc.minFeeBips;
        if (reserve <= fc.lowThreshold) return fc.maxFeeBips;
        uint256 range = fc.highThreshold - fc.lowThreshold;
        uint256 position = reserve - fc.lowThreshold;
        uint256 feeRange = fc.maxFeeBips - fc.minFeeBips;
        return fc.maxFeeBips - (position * feeRange) / range;
    }

    function _validateFeeConfig(FeeConfig memory _config) internal pure {
        if (_config.minFeeBips > _config.maxFeeBips) revert InvalidFeeConfig();
        if (_config.maxFeeBips > MAX_FEE_BIPS) revert InvalidFeeConfig();
        if (_config.lowThreshold >= _config.highThreshold) revert InvalidFeeConfig();
    }

    function _yieldVaultBalance() internal view returns (uint256) {
        if (address(yieldVault) == address(0) || deployedToYield == 0) return 0;
        return yieldVault.maxWithdraw(address(this));
    }

    function _effectiveRedeemReserve(uint256) internal view returns (uint256) {
        return redeemReserve + (pendingRedeemExpectedFromIssuer * PENDING_SETTLEMENT_CREDIT_BIPS) / 10_000;
    }

    function _effectiveRwaReserve() internal view returns (uint256) {
        return rwaReserve + (pendingRwaExpectedFromIssuer * PENDING_SETTLEMENT_CREDIT_BIPS) / 10_000;
    }

    function _initiateIssuerRedemption(uint256 rwaAmount, uint256 rate) internal {
        if (rwaAmount == 0 || address(issuerAdapter) == address(0)) return;

        _ensureRwaLiquidity(rwaAmount);
        rwaReserve -= rwaAmount;

        uint256 expectedRedeemOut = _convertWithRate(rwaAmount, rate, true);
        IERC20Minimal(rwaToken).approve(address(issuerAdapter), rwaAmount);
        bytes32 requestId =
            issuerAdapter.requestRedemption(rwaToken, rwaAmount, address(this), expectedRedeemOut);

        _registerSettlement(requestId, false, rwaAmount, expectedRedeemOut, rate);
        pendingRwaSentToIssuer += rwaAmount;
        pendingRedeemExpectedFromIssuer += expectedRedeemOut;

        emit IssuerRedemptionInitiated(requestId, rwaAmount, expectedRedeemOut);
    }

    function _initiateIssuerMint(uint256 redeemAmount, uint256 rate) internal {
        if (redeemAmount == 0 || address(issuerAdapter) == address(0)) return;

        _ensureRedeemLiquidity(redeemAmount);
        redeemReserve -= redeemAmount;

        uint256 expectedRwaOut = _convertWithRate(redeemAmount, rate, false);
        IERC20Minimal(redeemAsset).approve(address(issuerAdapter), redeemAmount);
        bytes32 requestId =
            issuerAdapter.requestMint(redeemAsset, redeemAmount, address(this), expectedRwaOut);

        _registerSettlement(requestId, true, redeemAmount, expectedRwaOut, rate);
        pendingRedeemSentToIssuer += redeemAmount;
        pendingRwaExpectedFromIssuer += expectedRwaOut;

        emit IssuerMintInitiated(requestId, redeemAmount, expectedRwaOut);
    }

    function _registerSettlement(
        bytes32 requestId,
        bool isMint,
        uint256 inputAmount,
        uint256 expectedOutputAmount,
        uint256 requestRate
    ) internal {
        if (requestId == bytes32(0)) revert UnknownSettlement();
        if (_activeSettlementIndexPlusOne[requestId] != 0) revert SettlementAlreadyExists();

        activeSettlements[requestId] = ActiveSettlement({
            requestId: requestId,
            isMint: isMint,
            inputAmount: inputAmount,
            expectedOutputAmount: expectedOutputAmount,
            requestRate: requestRate,
            initiatedAt: block.timestamp
        });
        activeSettlementIds.push(requestId);
        _activeSettlementIndexPlusOne[requestId] = activeSettlementIds.length;
    }

    function _finalizeCompletedSettlements(uint256 maxCount) internal returns (uint256 finalized) {
        uint256 index = 0;
        while (index < activeSettlementIds.length && finalized < maxCount) {
            bytes32 requestId = activeSettlementIds[index];
            (bool settled,,) = issuerAdapter.settlementResult(requestId);
            if (!settled) {
                index++;
                continue;
            }

            _finalizeSettlement(requestId);
            finalized++;
        }
    }

    function _finalizeSettlement(bytes32 requestId) internal {
        ActiveSettlement memory settlement = activeSettlements[requestId];
        if (settlement.requestId == bytes32(0)) revert UnknownSettlement();

        (bool settled, uint256 outputAmount,) = issuerAdapter.settlementResult(requestId);
        if (!settled) revert SettlementNotReady();

        uint256 epochAllocatedShares = allocatedSettlementShares[requestId];
        uint256 livePoolShares = totalShares;
        uint256 denominator = livePoolShares + epochAllocatedShares;
        uint256 poolOutput = denominator == 0 ? 0 : (outputAmount * livePoolShares) / denominator;
        uint256 distributedToEpochs;

        if (settlement.isMint) {
            uint256 accountedRwa = rwaReserve + rwaRedemptionReserve;
            if (IERC20Minimal(rwaToken).balanceOf(address(this)) < accountedRwa + outputAmount) {
                revert SettlementBalanceMismatch();
            }

            pendingRedeemSentToIssuer -= settlement.inputAmount;
            pendingRwaExpectedFromIssuer -= settlement.expectedOutputAmount;
            rwaReserve += poolOutput;
        } else {
            uint256 accountedRedeem = redeemReserve + iouReserve;
            if (IERC20Minimal(redeemAsset).balanceOf(address(this)) < accountedRedeem + outputAmount) {
                revert SettlementBalanceMismatch();
            }

            pendingRwaSentToIssuer -= settlement.inputAmount;
            pendingRedeemExpectedFromIssuer -= settlement.expectedOutputAmount;
            redeemReserve += poolOutput;
        }

        uint256[] storage epochIds = _settlementEpochIds[requestId];
        for (uint256 i = 0; i < epochIds.length; i++) {
            uint256 epochId = epochIds[i];
            uint256 epochShares = exitEpochSettlementShares[epochId][requestId];
            if (epochShares == 0) continue;

            uint256 epochOutput = denominator == 0 ? 0 : (outputAmount * epochShares) / denominator;
            distributedToEpochs += epochOutput;

            if (settlement.isMint) {
                exitEpochs[epochId].rwaReserved += epochOutput;
            } else {
                exitEpochs[epochId].redeemReserved += epochOutput;
            }

            exitEpochs[epochId].pendingSettlementCount -= 1;
            delete exitEpochSettlementShares[epochId][requestId];
        }

        uint256 remainder = outputAmount - poolOutput - distributedToEpochs;
        if (remainder > 0) {
            if (settlement.isMint) {
                rwaReserve += remainder;
            } else {
                redeemReserve += remainder;
            }
        }

        delete allocatedSettlementShares[requestId];
        delete _settlementEpochIds[requestId];
        _removeSettlement(requestId);
        emit IssuerSettlementFinalized(requestId, settlement.isMint, outputAmount);
    }

    function _removeSettlement(bytes32 requestId) internal {
        uint256 indexPlusOne = _activeSettlementIndexPlusOne[requestId];
        if (indexPlusOne == 0) revert UnknownSettlement();

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = activeSettlementIds.length - 1;
        if (index != lastIndex) {
            bytes32 lastId = activeSettlementIds[lastIndex];
            activeSettlementIds[index] = lastId;
            _activeSettlementIndexPlusOne[lastId] = index + 1;
        }

        activeSettlementIds.pop();
        delete _activeSettlementIndexPlusOne[requestId];
        delete activeSettlements[requestId];
    }

    function _ensureRwaLiquidity(uint256 amount) internal {
        if (amount <= rwaReserve) return;
        uint256 needed = amount - rwaReserve;
        if (needed > claimsRwa) revert InsufficientLiquidity();

        claimsRwa -= needed;
        rwaReserve += needed;
        poolManager.unlock(abi.encode(rwaToken, needed));
        emit ClaimsSynced(rwaToken, needed);
    }

    function _ensureRedeemLiquidity(uint256 amount) internal {
        if (amount <= redeemReserve) return;

        uint256 needed = amount - redeemReserve;
        if (needed > 0 && claimsRedeem > 0) {
            uint256 fromClaims = needed > claimsRedeem ? claimsRedeem : needed;
            claimsRedeem -= fromClaims;
            redeemReserve += fromClaims;
            poolManager.unlock(abi.encode(redeemAsset, fromClaims));
            emit ClaimsSynced(redeemAsset, fromClaims);
            needed = amount > redeemReserve ? amount - redeemReserve : 0;
        }

        if (needed > 0 && deployedToYield > 0) {
            _recallFromYield(needed);
        }

        if (amount > redeemReserve) revert InsufficientLiquidity();
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount));
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) revert InsufficientLiquidity();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount));
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) revert InsufficientLiquidity();
    }
}
