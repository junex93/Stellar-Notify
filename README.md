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
