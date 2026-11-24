# Architecture

Source of truth for decisions: `docs/decisoes.md` in the upstream repo (D1–D9).

## Parts
1. **On-chain** (`contracts/channels`): one Soroban contract holding channels, admins, publishers and thresholds. A published message is a contract event `("msg", channel_id)` with an opaque payload. No protocol fee (D5); no trustline per channel (D6). Managed with Caatinga (`ctg`).
2. **Listener** (`apps/listener`): polls Soroban RPC `getEvents` from a Postgres-stored ledger cursor, routes by channel id only, delivers through adapters (webhook, Web Push, ntfy; APNs/FCM later). Never stores, reads or forges content.
3. **Receiver** (`apps/web`): PWA with Web Push; wallet connect, channel list, on-chain verification and decryption are future work.

## Shared packages
- `@notify/protocol-types`: event and delivery formats (v1, see below).
- `@notify/sdk`: client over the Caatinga-generated bindings (`packages/sdk/src/generated`).
- `@notify/cli`: `notify` publisher CLI.

## Contract events (v1)
All events are topics `[Symbol, channel_id: u64]` and data as a map of the remaining fields (`#[contractevent]` default). Listeners route on topic 1 (`channel_id`) only.

| Topic 0 | Data fields | Emitted by |
|---|---|---|
| `msg` | `publisher: Address`, `payload: Bytes` (opaque) | `publish` |
| `created` | `admin: Address` | `create_channel` |
| `admin_add` / `admin_rm` | `admin: Address` | `add_admin` / `remove_admin` |
| `threshold` | `threshold: u32` | `set_threshold` |
| `pub_add` / `pub_rm` | `publisher: Address` | `add_publisher` / `remove_publisher` |
| `transferred` | none (new admin set via `get_channel`) | `transfer_channel` |
| `closed` | none | `close_channel` |
| `sub_ok` / `sub_rm` | `id: BytesN<32>` (salted commitment, not a wallet) | `approve_subscriber` / `remove_subscriber` (restricted channels) |

Admin-set changes (`admin_add`, `admin_rm`, `threshold`, `transferred`, `closed`) are the events announced to subscribers (README principle 3).

## Delivery JSON (v1)
The listener sends adapters one envelope per event. `v` is the schema version; consumers must ignore unknown fields.

```json
{
  "v": 1,
  "type": "message",
  "eventId": "<Soroban RPC event id>",
  "channelId": "42",
  "publisher": "G...",
  "payload": "<base64 of opaque bytes>",
  "ledger": 123456,
  "txHash": "<hex>",
  "publishedAt": "2026-01-01T00:00:00Z"
}
```

- `type` is `"message"` (from `msg`) or `"notice"` (admin-set change). A notice carries `event` (the topic, e.g. `"admin_add"`) and `data` (`{ "admin": "G..." }`, `{ "threshold": 2 }` or `{}`) instead of `publisher`/`payload`.
- `channelId` is a decimal string (u64 does not fit a JS number). `eventId` is the idempotency key for retries.
- **Webhook**: POST the envelope as `application/json`.
- **ntfy**: POST to the topic; title `Channel <channelId>`, body is the payload as UTF-8 text, or `binary message` when it is not valid UTF-8, with the explorer link as the `Click` header.
- **Telegram**: rendered from the same envelope by the same text rule, plus the transaction verification link (issue #24).

## Listener pipeline
`ingestOnce` polls `getEvents` (the RPC allows 5 topic patterns per filter, so topics are split across filters), decodes `msg` and admin-change events, routes by channel id to active targets and only then advances the Postgres ledger cursor. A crash replays from the stored ledger; the unique `(event_id, subscription_id)` delivery row makes replays harmless.

The `deliveries` table holds only references (event id, ledger), never message content. A retry re-loads the event from RPC by ledger (a small in-memory cache covers the first attempt), so events older than the RPC retention window cannot be retried and are dead-lettered. Failed sends back off exponentially (30s doubling, capped at 1h) and are dead-lettered after 8 attempts or on a permanent error (e.g. webhook 4xx other than 408/429). The webhook adapter signs the body with `X-Notify-Signature: sha256=<hmac>` when the target has a secret. Logs are one JSON object per line.

Run tests with a throwaway Postgres: `DATABASE_URL=postgresql://notify:notify@localhost:<port>/notify` (the suite truncates tables and refuses database names other than `notify` or `*_test`).

## Authorization matrix (D4)
| Action | Signer |
|---|---|
| Publish | 1 admin or 1 publisher |
| Manage publishers / subscribers | 1 admin |
| Add/remove admin, change threshold, transfer/close | channel threshold |

## Contract workflow
`ctg doctor` → `ctg build channels` → `ctg deploy channels` → `ctg generate`. Never hand-edit `caatinga.artifacts.json` or generated bindings; no manual contract IDs in `.env` (`ctg sync-env`).

## Upgrade authority (D9, v1)
Author-only: the contract stores one `upgrader` address, set by the constructor at deploy (`deployArgs.upgrader` in `caatinga.config.ts`), and `upgrade(new_wasm_hash)` requires its auth. No multisig and no notice period in v1; the README states this openly. A later version moves to multisig with a notice period.

## Status
Contract: create/publish, publisher management, threshold-gated admin actions, admin-change events and tests are implemented. Restricted-channel subscriber approval (D1) stores only salted commitments, see `docs/restricted-channels.md`. Listener ingestion, routing, webhook delivery and retries are implemented; Telegram and ntfy adapters, target registration and the CLI are still skeletons.

Contract rules worth knowing: closed channels reject every mutation (closing is final); `publish` rejects empty payloads; publisher grants survive `transfer_channel` (they cannot be enumerated).
