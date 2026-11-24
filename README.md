# Stellar Notify Protocol

A "ntfy.sh for Stellar": wallets create notification channels; admins publish on-chain events; open-source listeners deliver them as push. See `docs/architecture.md`.

```
contracts/channels   Soroban contract (managed with Caatinga)
packages/            protocol-types, sdk, cli
apps/listener        event follower + delivery adapters (Postgres)
apps/web             receiver PWA
compose.yaml          local Postgres (port 5433); schema via Drizzle migrations
```

Quick start: `pnpm install`, `pnpm contracts:doctor`, `pnpm contracts:build`, `pnpm db:up`.

## License

Apache-2.0 (see `LICENSE`), including the reference listener. Chosen for its explicit patent grant, which matters for infrastructure others will run and fork.

## Upgrades (v1)

The contract is upgradable by a single address, the `upgrader` fixed in the constructor at deploy time (D9). There is no multisig or notice period in v1; that is stated openly and is planned to change.
