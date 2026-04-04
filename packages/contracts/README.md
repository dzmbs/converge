## Converge Contracts

This package contains the Uniswap v4 hook, policies, mocks, tests, and deployment scripts for the Converge liquidity engine.

## Commands

Build:

```sh
forge build
```

Test:

```sh
forge test
```

## Deployment Pipeline

The main entrypoint is:

```sh
forge script script/00_DeployStack.s.sol:DeployStackScript \
  --rpc-url <RPC_URL> \
  --private-key <PRIVATE_KEY> \
  --broadcast
```

What it does:

- deploys or attaches to Uniswap v4 core/periphery artifacts
- deploys mock tokens if `RWA_TOKEN` / `REDEEM_ASSET` are not provided
- deploys oracle, KYC registry, KYC policy, yield vault, rebalance strategy
- mines the CREATE2 salt for the hook permission bits and deploys the hook correctly
- initializes the v4 pool
- seeds hook reserves through `deposit()` rather than standard CL liquidity
- writes addresses to `deployments/<chainId>.json`

## Local Dev

Start Anvil:

```sh
anvil
```

Then deploy a full local stack:

```sh
forge script script/00_DeployStack.s.sol:DeployStackScript \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY> \
  --broadcast
```

Defaults are local-friendly:

- mock RWA and redeem tokens are deployed automatically
- oracle defaults to `1e18`
- pool initializes at `1:1`
- the script seeds `500_000e18` of redeem asset by default

## Public Testnets

On public testnets, the script uses canonical Uniswap v4 deployments via `hookmate` address constants. You only deploy your own stack.

Typical usage:

```sh
RWA_TOKEN=<token> \
REDEEM_ASSET=<token> \
ORACLE=<oracle> \
KYC_MODE=0 \
INITIAL_RWA_SEED=0 \
INITIAL_REDEEM_SEED=1000000000 \
forge script script/00_DeployStack.s.sol:DeployStackScript \
  --rpc-url <RPC_URL> \
  --private-key <PRIVATE_KEY> \
  --broadcast
```

## Useful Env Vars

- `RWA_TOKEN`
- `REDEEM_ASSET`
- `RWA_NAME`
- `RWA_SYMBOL`
- `REDEEM_NAME`
- `REDEEM_SYMBOL`
- `RWA_DECIMALS`
- `REDEEM_DECIMALS`
- `ORACLE`
- `ORACLE_RATE`
- `KYC_REGISTRY`
- `KYC_MODE`
- `COMPLIANCE_SIGNER`
- `YIELD_VAULT`
- `REBALANCE_STRATEGY`
- `POOL_FEE`
- `TICK_SPACING`
- `STARTING_PRICE_X96`
- `INITIAL_RWA_SEED`
- `INITIAL_REDEEM_SEED`
- `MIN_FEE_BIPS`
- `MAX_FEE_BIPS`
- `LOW_THRESHOLD`
- `HIGH_THRESHOLD`
- `TARGET_RWA_RESERVE_BIPS`
- `TARGET_REDEEM_RESERVE_BIPS`
- `MIN_RWA_RESERVE`
- `MIN_REDEEM_RESERVE`

## Notes

- This protocol does not use normal v4 LP positions for capital. Direct `modifyLiquidity` is blocked in the hook.
- Pool creation is still Uniswap v4 initialization, but usable liquidity is seeded through `RWAHook.deposit(...)`.
- For strict swap-KYC mode, configure `KYC_MODE=2` and set `COMPLIANCE_SIGNER`.
