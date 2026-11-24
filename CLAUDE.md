# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stellar Notify Protocol, a "ntfy.sh for Stellar": wallets create notification channels in a Soroban contract, admins/publishers publish messages as contract events, and open-source listeners deliver those events as push. `docs/architecture.md` is the spec for wire formats and authorization; read it before changing the contract, `@notify/protocol-types`, or the listener.

**Status: architecture skeleton.** Contract methods (except `upgrade`/`upgrader`/`version`) return `Error::NotImplemented`; listener adapters, SDK methods and CLI commands throw `not implemented`. The `every_stub_reports_not_implemented` contract test asserts this, so it must be updated as methods are implemented.

## Commands

pnpm 10 workspace (`packages/*`, `apps/*`), Node >= 22. The contract is a standalone Cargo crate (no root `Cargo.toml`), so cargo commands need `--manifest-path`.

```sh
pnpm install
pnpm lint                 # biome check . (lint + format + import order)
pnpm format               # biome format --write .
pnpm typecheck            # tsc --noEmit in every workspace
pnpm test                 # vitest in every workspace (no TS tests exist yet; --passWithNoTests)
pnpm --filter @notify/listener exec vitest run path/to/file.test.ts -t "name"   # single TS test

pnpm contracts:test       # cargo test for contracts/channels
cargo test --manifest-path contracts/channels/Cargo.toml upgrade_requires_upgrader_auth   # single contract test
cargo fmt --check --manifest-path contracts/channels/Cargo.toml
cargo clippy --all-targets --manifest-path contracts/channels/Cargo.toml -- -D warnings

pnpm contracts:doctor     # ctg doctor (toolchain check)
pnpm contracts:build      # ctg build channels -> target/wasm32v1-none/release/channels.wasm
pnpm contracts:deploy     # ctg deploy channels --source ${CAATINGA_SOURCE:-notify-dev}
pnpm contracts:generate   # ctg generate -> packages/sdk/src/generated

pnpm db:up                                  # local Postgres on port 5433 (notify/notify/notify)
pnpm --filter @notify/listener db:generate  # drizzle-kit migrations from src/db/schema.ts
pnpm --filter @notify/listener dev          # needs DATABASE_URL (see .env.example)
pnpm --filter @notify/web dev               # Vite PWA
```

CI (`.github/workflows/ci.yml`) runs two jobs: contracts (`cargo fmt --check`, `clippy -D warnings`, tests, `ctg doctor`, `ctg build`) and TS (`pnpm lint && pnpm typecheck && pnpm test`).

## Architecture

Three parts connected only by contract events:

1. **`contracts/channels`** (Rust, soroban-sdk 27): one contract holding channels, admins, publishers and thresholds. A message is the event `("msg", channel_id)` with an opaque `Bytes` payload. No protocol fee, no per-channel trustline, and subscriptions are never stored on-chain.
2. **`apps/listener`**: polls Soroban RPC `getEvents` from a per-contract ledger cursor stored in Postgres (Drizzle), routes by channel id only, and hands a versioned JSON envelope to delivery adapters (`webhook`, `webpush`, `ntfy`). It must never store, read, decrypt or forge payload content. The `subscriptions` table (device/endpoint per channel) lives here, off-chain.
3. **`apps/web`**: receiver PWA (React + Vite, Web Push via `public/sw.js`).

Shared packages, in dependency order: `@notify/protocol-types` (decoded event types and the v1 delivery envelope) → `@notify/sdk` (client over the Caatinga-generated bindings) → `@notify/cli` (`notify` publisher CLI) and `apps/web`. Workspace packages export `./src/index.ts` directly, so no build step is needed between them.

### Contracts that span files

- **Event schema**: `contracts/channels/src/events.rs`, the "Contract events" table in `docs/architecture.md`, and `packages/protocol-types/src/index.ts` must change together. All events are topics `[Symbol, channel_id: u64]` with remaining fields as a data map; listeners route on topic 1 only.
- **Delivery envelope**: `DeliveryEnvelope` in protocol-types mirrors "Delivery JSON (v1)" in the architecture doc. `channelId` is a decimal string (u64), `eventId` is the idempotency key, `payload` is base64.
- **Authorization matrix (D4)**: publish = 1 admin or 1 publisher; manage publishers = 1 admin; add/remove admin, set threshold, transfer, close = channel threshold. Method signatures in `lib.rs` already encode this (`signer`/`admin` vs `signers: Vec<Address>`).
- **Decision IDs** (`D4`, `D5`, `D6`, `D9`) in comments refer to `docs/decisoes.md`, which lives in the upstream repo, not here.

### Contract implementation rules

From the doc comment on `ChannelsContract` and `types.rs`:

- `signers` must be deduplicated, checked against admins loaded from storage (never trusted from the argument), and each must `require_auth()`. Threshold actions need `signers.len() >= channel.threshold`.
- Invariant: `1 <= threshold <= admins.len() <= MAX_ADMINS` (10); never zero admins.
- Extend the TTL of `Channel(id)` on every write and on `publish`.
- `MAX_PAYLOAD_BYTES` is 4096, chosen from the fee measurements in `docs/costs.md`; changing it is a contract upgrade.
- Error codes in `errors.rs` are public ABI: never renumber, only append.
- Upgrades (D9, v1): a single `upgrader` address set by `__constructor` at deploy (from `deployArgs.upgrader` in `caatinga.config.ts`) can call `upgrade` alone. Tests must register the contract with the constructor arg: `env.register(ChannelsContract, (upgrader,))`.
- Soroban tests write `contracts/channels/test_snapshots/test/<test_name>.1.json`. These are committed; when a test is renamed or removed, delete its stale snapshot.

### Caatinga workflow

Contract lifecycle goes through Caatinga (`ctg`, config in `caatinga.config.ts`), not the raw `stellar` CLI: `ctg doctor` → `ctg build channels` → `ctg deploy channels` → `ctg generate`.

- Never hand-edit `caatinga.artifacts.json` or anything under `packages/sdk/src/generated`; regenerate bindings after each deploy.
- Never copy contract IDs into `.env` by hand; `ctg sync-env` writes `NOTIFY_CHANNELS_CONTRACT_ID` from the artifacts file.
- `CAATINGA_SOURCE` is a Stellar CLI keystore identity alias (default `notify-dev`), never a secret key.

## Conventions

- Biome 1.9: 2-space indent, line width 100, organized imports. It ignores `**/generated/**`, `dist`, contract `target` and `test_snapshots`.
- TS is ESM with `.js` extensions on relative imports (`./db/index.js`).
- Dependency versions are pinned exactly (no `^`/`~`).
- License is Apache-2.0 across the repo, including the reference listener.

## Commits

- Never add Claude to commit trailers: no `Co-Authored-By: Claude ...` line, no "Generated with Claude Code" line, and no other AI attribution in commit messages.
