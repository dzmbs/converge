# Converge

**Where offchain markets achieve onchain liquidity.**

Converge is a fixed-price Uniswap v4 hook that brings atomic onchain liquidity to RWAs (ACRED, BUIDL, USDY) against their mint/redeem asset (USDC). Built on Uniswap v4 for routing and composability, Converge replaces the bonding curve with oracle-priced swap logic — zero slippage, dynamic congestion fees, and flexible compliance modes.

![Converge Demo](converge-demo.gif)

## Deployed on Arc Testnet & Base Sepolia

| Contract | Arc Testnet | Base Sepolia |
|----------|-------------|-------------|
| **ConvergeHook** (Demo Pool) | [`0x4209...A88`](https://testnet.arcscan.app/address/0x4209871623a7f0fcd08D8Ca21F69249034026A88) | [`0x771f...a88`](https://sepolia.basescan.org/address/0x771f960e399bEB2Aa7094728abf866D31143aa88) |
| **ConvergeHook** (Native USDC) | [`0x3949...A88`](https://testnet.arcscan.app/address/0x394918E252270075eD999fFaaD51D5834E5A2a88) | — |
| **CRE Oracle** | [`0x2D4b...4c`](https://testnet.arcscan.app/address/0x2D4bA365056cd1bF3Ba6e9b37f9025DAEcC1cE4c) | [`0x2D4b...4c`](https://sepolia.basescan.org/address/0x2D4bA365056cd1bF3Ba6e9b37f9025DAEcC1cE4c) |
| **DemoFaucet** | [`0xBD83...B1`](https://testnet.arcscan.app/address/0xBD836822C3829d2e6F4C4008fb0E2C8635DE80B1) | [`0x2b91...34`](https://sepolia.basescan.org/address/0x2b91ECf82e95E84d8ca4274D228E6f38e1995234) |
| **SwapRouter** | [`0xB615...FfC`](https://testnet.arcscan.app/address/0xB61598fa7E856D43384A8fcBBAbF2Aa6aa044FfC) | [`0x71cD...DD9`](https://sepolia.basescan.org/address/0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9) |
| **ACRED Token** | [`0x5763...6d`](https://testnet.arcscan.app/address/0x576396e4eB59818ec5BB3d06EE0eD888401d636d) | [`0x5A16...e3`](https://sepolia.basescan.org/address/0x5A1686b558110F0BA67fCcd685f20214aDd255e3) |

## Key Features

- **Oracle-Priced Fixed Swaps** — execute at the real ACRED NAV (~$1,094), no bonding curve, zero slippage
- **Chainlink CRE Oracle** — automated price updates from RedStone API via Chainlink DON consensus
- **CCTP V2 Bridge** — cross-chain USDC transfers between Arc and Base Sepolia via Circle CCTP
- **Dynamic Congestion Fees** — 0.01%–1% based on reserve utilization
- **Liquidity Waterfall** — pool reserves → yield recall → clearing house → async queue
- **Flexible Compliance** — open access, LP-gated, or full KYC with EIP-712 swap authorization
- **Multi-Chain** — deployed on Arc Testnet + Base Sepolia with shared oracle

## Architecture

```
User → Frontend → SwapRouter → ConvergeHook (Uniswap v4)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              CRE Oracle      Yield Vault     Clearing House
           (Chainlink DON)    (Aave/Morpho)    (SKY/Infinifi)
                    │
            RedStone API
          (ACRED NAV feed)
```

## Packages

| Package | Stack | Description |
|---------|-------|-------------|
| `packages/contracts` | Foundry / Solidity | Uniswap v4 hook, CRE oracle, KYC policies, yield vaults |
| `packages/frontend` | Next.js 16 / wagmi / viem | Swap, pool, faucet, CCTP bridge UI |
| `packages/cre` | Chainlink CRE SDK | Oracle update workflow — fetches ACRED NAV, pushes on-chain |
| `packages/sim` | Node.js | Stress simulation scenarios for liquidity modelling |

## Getting Started

```sh
pnpm install
git submodule update --init --recursive
```

### Frontend

```sh
cp packages/frontend/.env.example packages/frontend/.env.local
# add your Privy app ID

pnpm --filter frontend dev     # dev server on :3000
```

### Contracts

```sh
pnpm contracts:build
pnpm contracts:test     # 80 tests
```

### CRE Workflow (Oracle)

```sh
cd packages/cre
cp .env.example .env
# add private key

~/.cre/bin/cre workflow simulate ./workflows/oracle-update -T staging-settings
```

## Circle Developer Tools

- **Arc Testnet** — deployed as primary chain, USDC as native gas token
- **CCTP V2** — cross-chain USDC bridging via `TokenMessengerV2.depositForBurn()`
- **Native USDC Pool** — second pool using Arc's native USDC (`0x3600...`) for real settlement

## Tech Stack

- **Contracts**: Solidity 0.8.34, Foundry, Uniswap v4 Hooks
- **Oracle**: Chainlink CRE + RedStone API
- **Frontend**: Next.js 16, React 19, wagmi, viem, Privy, Tailwind CSS v4
- **Bridge**: Circle CCTP V2
- **Monorepo**: pnpm workspaces, Turborepo
