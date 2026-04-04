# Converge Stress Simulation

This package models LP yield and serviceability for an RWA venue with:

- fixed-price swaps against an issuer/oracle rate
- liquid reserve buffers
- issuer mint/redeem settlement delays
- yield deployment into external venues like Aave and Morpho
- optional clearing-house support on redeem-side shortfalls

It is intentionally spreadsheet-friendly:

- scenarios are plain JSON
- outputs are `summary.json` and `daily.csv`
- venue data is normalized into simple snapshot JSON files

## Run

```bash
pnpm --dir packages/sim run run:base
pnpm --dir packages/sim run run:stress
```

Outputs are written to `packages/sim/outputs/<scenario-name>/`.

## Scenario Model

Each scenario defines:

- initial pool state
- venue snapshots
- a rebalance policy
- default daily flows
- windows and shocks

The default policy implemented here is a pragmatic buffer-band strategy:

1. settle matured issuer mint/redeem requests
2. accrue venue yield
3. process swaps and LP flows
4. recall from venues if liquid redeem reserves are below the lower band
5. if RWA is too high, queue issuer redemption
6. if RWA is too low and redeem cash is abundant, queue issuer mint
7. deploy excess redeem reserves above the upper band into the best venue

## Venue Inputs

The engine does not fetch live rates itself. Instead, it reads normalized snapshots.

That keeps the simulation deterministic and makes it easy to:

- paste current values from official UIs
- ingest API responses from a keeper later
- compare multiple point-in-time market snapshots

Two example snapshots are included:

- `snapshots/aave-usdc.example.json`
- `snapshots/morpho-usdc.example.json`

## Outputs

`daily.csv` includes:

- liquid reserves
- deployed balances by venue
- pending issuer queues
- fees
- yield
- clearing usage
- IOU issuance
- LP NAV and share price
- service failures and rejected volume

`summary.json` includes headline metrics you can compare across runs.
