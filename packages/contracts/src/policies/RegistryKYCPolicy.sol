// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {IKYCPolicy} from "../interfaces/IKYCPolicy.sol";
import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

/// @title RegistryKYCPolicy
/// @notice Registry-backed policy for LP actions and compliance-signed swap authorization.
/// @dev Strict swap mode trusts an approved offchain compliance signer to authorize
///      exact swap intents for a specific router initiator and swap context.
contract RegistryKYCPolicy is IKYCPolicy, Ownable, EIP712 {
    enum Mode {
        NONE,
        LP_ONLY,
        FULL_COMPLIANCE_SIGNER
    }

    error ZeroAddress();
    error InvalidRouter();
    error InvalidSwapper();
    error AuthorizationExpired();
    error InvalidNonce();
    error InvalidSignature();
    error InvalidSwapContext();
    error InvalidComplianceSigner();

    event RegistryUpdated(address indexed registry);
    event ModeUpdated(Mode mode);
    event TrustedRouterUpdated(address indexed router, bool allowed);
    event ComplianceSignerUpdated(address indexed signer, bool allowed);

    bytes32 public constant SWAP_AUTHORIZATION_TYPEHASH = keccak256(
        "SwapAuthorization(address swapper,address hook,bytes32 poolId,address router,address tokenIn,address tokenOut,uint256 amountIn,bool zeroForOne,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant DIRECT_SWAP_AUTHORIZATION_TYPEHASH = keccak256(
        "DirectSwapAuthorization(address requester,address recipient,address hook,address tokenIn,address tokenOut,uint256 amountIn,bool swapRwaForRedeem,uint256 nonce,uint256 deadline)"
    );

    struct SwapAuthorization {
        address swapper;
        address hook;
        bytes32 poolId;
        address router;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bool zeroForOne;
        uint256 nonce;
        uint256 deadline;
        bytes signature;
    }

    struct DirectSwapAuthorization {
        address requester;
        address recipient;
        address hook;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bool swapRwaForRedeem;
        uint256 nonce;
        uint256 deadline;
        bytes signature;
    }

    IKYCRegistry public registry;
    Mode public mode;
    mapping(address => bool) public trustedRouters;
    mapping(address => bool) public complianceSigners;
    mapping(address => uint256) public swapNonces;
    mapping(address => uint256) public directSwapNonces;

    constructor(IKYCRegistry _registry, Mode _mode, address _owner) Ownable(_owner) EIP712("ConvergeKYCPolicy", "1") {
        if (address(_registry) == address(0)) revert ZeroAddress();
        registry = _registry;
        mode = _mode;
    }

    function setRegistry(IKYCRegistry _registry) external onlyOwner {
        if (address(_registry) == address(0)) revert ZeroAddress();
        registry = _registry;
        emit RegistryUpdated(address(_registry));
    }

    function setMode(Mode _mode) external onlyOwner {
        mode = _mode;
        emit ModeUpdated(_mode);
    }

    function setTrustedRouter(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        trustedRouters[router] = allowed;
        emit TrustedRouterUpdated(router, allowed);
    }

    function setComplianceSigner(address signer, bool allowed) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        complianceSigners[signer] = allowed;
        emit ComplianceSignerUpdated(signer, allowed);
    }

    function validateSwap(SwapValidationContext calldata context, bytes calldata hookData) external returns (bool) {
        if (mode != Mode.FULL_COMPLIANCE_SIGNER) return true;
        if (!trustedRouters[context.router]) revert InvalidRouter();

        (SwapAuthorization memory auth, address complianceSigner) = abi.decode(hookData, (SwapAuthorization, address));
        if (!complianceSigners[complianceSigner]) revert InvalidComplianceSigner();

        if (auth.deadline < block.timestamp) revert AuthorizationExpired();
        if (auth.swapper != IUniswapV4Router04(payable(context.router)).msgSender()) revert InvalidSwapper();
        if (auth.nonce != swapNonces[auth.swapper]) revert InvalidNonce();

        if (
            auth.hook != msg.sender ||
            auth.poolId != context.poolId ||
            auth.router != context.router ||
            auth.tokenIn != context.tokenIn ||
            auth.tokenOut != context.tokenOut ||
            auth.amountIn != context.amountIn ||
            auth.zeroForOne != context.zeroForOne
        ) {
            revert InvalidSwapContext();
        }

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SWAP_AUTHORIZATION_TYPEHASH,
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
            )
        );

        if (!SignatureChecker.isValidSignatureNow(complianceSigner, digest, auth.signature)) {
            revert InvalidSignature();
        }

        swapNonces[auth.swapper] += 1;
        return true;
    }

    function validateDirectSwap(DirectSwapValidationContext calldata context, bytes calldata authorization)
        external
        returns (bool)
    {
        if (mode != Mode.FULL_COMPLIANCE_SIGNER) return true;

        (DirectSwapAuthorization memory auth, address complianceSigner) =
            abi.decode(authorization, (DirectSwapAuthorization, address));
        if (!complianceSigners[complianceSigner]) revert InvalidComplianceSigner();

        if (auth.deadline < block.timestamp) revert AuthorizationExpired();
        if (auth.requester != context.requester) revert InvalidSwapper();
        if (auth.recipient != context.recipient) revert InvalidSwapContext();
        if (auth.nonce != directSwapNonces[auth.requester]) revert InvalidNonce();

        if (
            auth.hook != context.hook ||
            auth.tokenIn != context.tokenIn ||
            auth.tokenOut != context.tokenOut ||
            auth.amountIn != context.amountIn ||
            auth.swapRwaForRedeem != context.swapRwaForRedeem
        ) {
            revert InvalidSwapContext();
        }

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    DIRECT_SWAP_AUTHORIZATION_TYPEHASH,
                    auth.requester,
                    auth.recipient,
                    auth.hook,
                    auth.tokenIn,
                    auth.tokenOut,
                    auth.amountIn,
                    auth.swapRwaForRedeem,
                    auth.nonce,
                    auth.deadline
                )
            )
        );

        if (!SignatureChecker.isValidSignatureNow(complianceSigner, digest, auth.signature)) {
            revert InvalidSignature();
        }

        directSwapNonces[auth.requester] += 1;
        return true;
    }

    function validateDeposit(address account) external view returns (bool) {
        if (mode == Mode.NONE) return true;
        return registry.isVerified(account);
    }

    function validateRedemption(address account) external view returns (bool) {
        if (mode == Mode.NONE) return true;
        return registry.isVerified(account);
    }
}
