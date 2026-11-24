# Architecture

Source of truth for decisions: `docs/decisoes.md` in the upstream repo (D1–D9).

## Parts
1. **On-chain** (`contracts/channels`): one Soroban contract holding channels, admins, publishers and thresholds. A published message is a contract event `("msg", channel_id)` with an opaque payload. No protocol fee (D5); no trustline per channel (D6). Managed with Caatinga (`ctg`).
2. **Listener** (`apps/listener`): polls Soroban RPC `getEvents` from a Postgres-stored ledger cursor, routes by channel id only, delivers through adapters (webhook, Web Push, ntfy; APNs/FCM later). Never stores, reads or forges content.
3. **Receiver** (`apps/web`): PWA with Web Push; wallet connect, channel list, on-chain verification and decryption are future work.

## Shared packages
- `@notify/protocol-types`: event and delivery formats (draft).
- `@notify/sdk`: client over the Caatinga-generated bindings (`packages/sdk/src/generated`).
- `@notify/cli`: `notify` publisher CLI.

## Authorization matrix (D4)
| Action | Signer |
|---|---|
| Publish | 1 admin or 1 publisher |
| Manage publishers / subscribers | 1 admin |
| Add/remove admin, change threshold, transfer/close | channel threshold |

## Contract workflow
`ctg doctor` → `ctg build channels` → `ctg deploy channels` → `ctg generate`. Never hand-edit `caatinga.artifacts.json` or generated bindings; no manual contract IDs in `.env` (`ctg sync-env`).

## Status
Skeleton only: contract methods return `NotImplemented`, listener adapters and CLI commands throw.
