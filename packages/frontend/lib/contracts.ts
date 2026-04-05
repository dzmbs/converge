import type { Address } from "viem";
import type { SupportedChainId } from "./chains";

import ConvergeHookAbi from "./abis/ConvergeHook.json";
import ConvergeQuoterAbi from "./abis/ConvergeQuoter.json";
import DemoFaucetAbi from "./abis/DemoFaucet.json";
import SwapRouterAbi from "./abis/SwapRouter.json";
import ERC20Abi from "./abis/ERC20.json";
import MintableTokenAbi from "./abis/MintableToken.json";
import CCTPDepositorAbi from "./abis/CCTPDepositor.json";

export { ConvergeHookAbi, ConvergeQuoterAbi, DemoFaucetAbi, SwapRouterAbi, ERC20Abi, MintableTokenAbi, CCTPDepositorAbi };

export interface PoolConfig {
  id: string;
  label: string;
  hook: Address;
  quoter: Address;
  rwaToken: Address;
  redeemAsset: Address;
  rwaDecimals: number;
  redeemDecimals: number;
  rwaSymbol: string;
  redeemSymbol: string;
  oracle: Address;
  poolId: `0x${string}`;
  faucet?: Address;
  /** True if this pool uses real (native) USDC */
  isRealUsdc: boolean;
}

export interface ChainDeployment {
  poolManager: Address;
  swapRouter: Address;
  permit2: Address;
  pools: PoolConfig[];
}

// Arc Testnet deployments
const arcDeployment: ChainDeployment = {
  poolManager: "0x0D9BAf34817Fccd3b3068768E5d20542B66424A5",
  swapRouter: "0xB61598fa7E856D43384A8fcBBAbF2Aa6aa044FfC",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  pools: [
    {
      id: "mock-usdc",
      label: "ACRED / USDC (Demo)",
      hook: "0x4209871623a7f0fcd08D8Ca21F69249034026A88",
      quoter: "0x8285Ebcc7247C42C75747152f7ea5aa2C2C348db",
      rwaToken: "0x576396e4eB59818ec5BB3d06EE0eD888401d636d",
      redeemAsset: "0x83eafF3C19083B03A8E0708F7637D0c4638E9FC9",
      rwaDecimals: 18,
      redeemDecimals: 6,
      rwaSymbol: "ACRED",
      redeemSymbol: "USDC",
      oracle: "0xBf70F85011047C4cF31696780BdB6db752527d7c",
      poolId: "0x8bc3d33a8e3e672344c361ac5b682d998fbeaaa26668bcd5c70095a890e9ee82",
      faucet: "0xBD836822C3829d2e6F4C4008fb0E2C8635DE80B1",
      isRealUsdc: false,
    },
    {
      id: "real-usdc",
      label: "ACRED / USDC (Native)",
      hook: "0x394918E252270075eD999fFaaD51D5834E5A2a88",
      quoter: "0xa6f99A282D34fBC7B43F2Add08693B0Fb298846C",
      rwaToken: "0x576396e4eB59818ec5BB3d06EE0eD888401d636d",
      redeemAsset: "0x3600000000000000000000000000000000000000",
      rwaDecimals: 18,
      redeemDecimals: 6,
      rwaSymbol: "ACRED",
      redeemSymbol: "USDC",
      oracle: "0x77be7E6E949595c36740897e070038525AD067C5",
      poolId: "0x7212c4967a83a86738aed4f5094ecdb87eea8837f069d0fb8c00e70b2e12f645",
      isRealUsdc: true,
    },
  ],
};

const baseSepoliaDeployment: ChainDeployment = {
  poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  swapRouter: "0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  pools: [
    {
      id: "base-sepolia-demo",
      label: "ACRED / USDC (Base Sepolia)",
      hook: "0x771f960e399bEB2Aa7094728abf866D31143aa88",
      quoter: "0x5eD426F63610Cfb5d98DDc5E3e49c9764a916728",
      rwaToken: "0x5A1686b558110F0BA67fCcd685f20214aDd255e3",
      redeemAsset: "0x571989c5A0bbd7615B7b1F33D9159951C0CB13Bd",
      rwaDecimals: 18,
      redeemDecimals: 6,
      rwaSymbol: "ACRED",
      redeemSymbol: "USDC",
      oracle: "0x08A3985280560cc8b5f476a36178c2a3d3D866C6",
      poolId: "0xb931f79153000833c389d6e6bc72075ea07fe126f257b141ac0639a5c18e52bb",
      faucet: "0x2b91ECf82e95E84d8ca4274D228E6f38e1995234",
      isRealUsdc: false,
    },
  ],
};

const chainDeployments: Partial<Record<SupportedChainId, ChainDeployment>> = {
  5_042_002: arcDeployment,
  84532: baseSepoliaDeployment,
};

export function getChainDeployment(chainId: SupportedChainId): ChainDeployment | undefined {
  return chainDeployments[chainId];
}

export function getExplorerUrl(chainId: SupportedChainId, txHash: string): string {
  if (chainId === 5_042_002) return `https://testnet.arcscan.app/tx/${txHash}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return "";
}

export function getExplorerAddressUrl(chainId: SupportedChainId, address: string): string {
  if (chainId === 5_042_002) return `https://testnet.arcscan.app/address/${address}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/address/${address}`;
  return "";
}
