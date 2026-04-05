import type { Address } from "viem";

export const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface CCTPRoute {
  fromLabel: string;
  fromIcon: string;
  fromChainId: number;
  toLabel: string;
  toIcon: string;
  toChainId: number;
  tokenMessenger: Address;
  usdc: Address;
  usdcDecimals: number;
  destinationDomain: number;
}

// Arc Testnet → Base Sepolia
export const ARC_TO_BASE: CCTPRoute = {
  fromLabel: "Arc Testnet",
  fromIcon: "/chains/arc.svg",
  fromChainId: 5_042_002,
  toLabel: "Base Sepolia",
  toIcon: "/chains/base.svg",
  toChainId: 84532,
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  usdc: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  destinationDomain: 6, // Base Sepolia CCTP domain
};

// Base Sepolia → Arc Testnet
export const BASE_TO_ARC: CCTPRoute = {
  fromLabel: "Base Sepolia",
  fromIcon: "/chains/base.svg",
  fromChainId: 84532,
  toLabel: "Arc Testnet",
  toIcon: "/chains/arc.svg",
  toChainId: 5_042_002,
  tokenMessenger: "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  usdcDecimals: 6,
  destinationDomain: 26, // Arc testnet CCTP domain
};

export const CCTP_ROUTES = [BASE_TO_ARC, ARC_TO_BASE] as const;

export function addressToBytes32(addr: Address): `0x${string}` {
  return `0x000000000000000000000000${addr.slice(2)}` as `0x${string}`;
}
