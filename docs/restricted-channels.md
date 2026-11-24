# Restricted channels: subscriber approval (D1) — design proposal

Status: approved; contract side implemented for issue #9 (`approve_subscriber`, `remove_subscriber`, `is_approved`, `sub_ok`/`sub_rm`, `NotRestricted = 13`). The listener/bot side (salt storage, re-check on `sub_rm`) is not implemented.

## What "restricted" can and cannot mean
Every published message is a public contract event, so a restricted channel cannot hide content from chain readers. Restriction controls **who receives pushes** from listeners. Confidentiality needs the publisher to encrypt the payload (already stated in `events.rs`). Admin approval gates the key/receipt side; it is not access control on the ledger.

Constraints from the project (issues #9, #18, #22, #23, `types.rs`):
- Admins approve and remove subscribers with 1 signature (D4), mirroring `AUTH_REQUIRED` trustlines.
- No member list in the clear on-chain (principle 2 / D6). Device tokens and chat ids stay off-chain.
- The Telegram bot checks a wallet-ownership proof against "the channel's approved subscribers" (#23).

## Options considered
| | On-chain data | Revocation | Weakness |
|---|---|---|---|
| A. Plain address set | addresses in clear | trivial | violates the privacy rule |
| B. Salted commitments (**proposed**) | opaque 32-byte ids | one call, one event | admins must keep the salt |
| C. Off-chain signed approvals | none | needs a revocation record anyway | revocation and admin rotation get complicated |
| D. Merkle root of members | one root | new root per change | admin must hold and share the member list; proofs needed per subscriber |

## Proposal: salted commitments (B)
**Commitment.** `id = SHA-256("notify-sub-v1" || channel_id (8 bytes BE) || salt (32 bytes) || wallet address XDR)`.
- `salt` is random per channel, created off-chain by the creator, shared among admins and with the listener serving that channel. It is never sent on-chain.
- Without the salt, nobody can test "is wallet X approved?" or enumerate wallets from commitments. Without it a plain hash of an address would be dictionary-attackable against known wallet lists, so a salt-less variant is rejected.

**Contract surface** (new, restricted channels only; open channels reject them with a new error `NotRestricted`):
- `approve_subscriber(channel_id, admin, id: BytesN<32>)` — 1 admin.
- `remove_subscriber(channel_id, admin, id: BytesN<32>)` — 1 admin.
- `is_approved(channel_id, id: BytesN<32>) -> bool` — read-only, used by the bot/listener.
- Storage: `DataKey::Subscriber(channel_id, id)` in persistent storage with TTL extension, same rules as `Publisher`.
- Events: `sub_ok` and `sub_rm` with topics `[Symbol, channel_id]` and data `{ id }`. They are admin-set-style changes; whether subscribers are notified of them is left to the listener (the id carries no wallet).
- Closed channels reject both calls (consistent with the rest of the contract).

**Flow with the Telegram bot (#23).**
1. User `/subscribe <channel_id>` for a restricted channel; bot sends a challenge.
2. User signs it with their wallet (SEP-53-style message signing); bot verifies the signature, learns the wallet address.
3. Bot computes `id` with the channel salt and calls `is_approved`. If false, it tells the user to ask an admin; the admin computes the same `id` and calls `approve_subscriber`.
4. On success the listener stores the chat registration (#18) against the channel. Revocation: `remove_subscriber` emits `sub_rm`; the listener re-checks approval on that event (or on each delivery batch) and drops the target.

## Trade-offs and open questions
- **Salt custody.** If the salt is lost, admins can no longer derive ids to remove subscribers; the `sub_ok` events still list the ids, so removal remains possible by id. Salt rotation means re-approving everyone.
- **Listener trust.** The listener serving the channel learns the salt and therefore can link wallets to ids; it already knows the chat-to-wallet link, so no new exposure. A different listener without the salt learns nothing.
- **Cost.** One persistent entry per subscriber (rent and TTL extension by an admin call or on use). Measured rates are in `docs/costs.md`; per-subscriber storage cost is not yet measured.
- **Unbounded set.** Unlike admins there is no `MAX` on subscribers; the cap is rent cost. Decide whether to enforce a per-channel limit.
- **Salt distribution to the listener** is a deployment/config question (listener channel config), not a contract one.

## Decisions
1. Salted commitments (B) over a Merkle root: accepted.
2. The channel salt lives in the listener's per-channel configuration (to be built with the listener/bot issues #18 and #23); it is never on-chain.
3. `NotRestricted` was appended to the error ABI as 13.
