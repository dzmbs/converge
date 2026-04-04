# Converge

Professional RWA settlement protocol with institutional-grade compliance and clearing house liquidity.

## Packages

| Package | Stack | Description |
|---------|-------|-------------|
| `packages/contracts` | Foundry / Solidity | Uniswap v4 hook, KYC policies, oracle integrations, yield vaults |
| `packages/frontend` | Next.js 16 / Tailwind v4 | Institutional web app — swap, dashboard, settlement queue |
| `packages/sim` | Node.js | Stress simulation scenarios for liquidity modelling |

## Getting started

```sh
pnpm install
```

### Contracts

```sh
pnpm contracts:build
pnpm contracts:test
```

### Frontend

```sh
cp packages/frontend/.env.example packages/frontend/.env.local
# add your Privy app ID to .env.local

pnpm --filter frontend dev     # dev server on :3000
pnpm --filter frontend build   # production build
pnpm --filter frontend lint    # eslint
```

## Tech

- **Contracts**: Solidity, Foundry, Uniswap v4 hooks
- **Frontend**: Next.js 16 (App Router), Tailwind CSS v4, Framer Motion, Privy wallet auth
- **Monorepo**: pnpm workspaces, Turborepo
