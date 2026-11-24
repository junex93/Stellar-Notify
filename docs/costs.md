# Per-message cost and payload limit (testnet)

Measured 2026-11-24 on testnet (Stellar CLI 28.1.0, soroban-sdk 27.0.6) with a throwaway
`publish` that authorizes the signer, reads the channel, extends its TTL and emits the
`("msg", channel_id)` event (throwaway contract `CCFS6V7MPRJKW6GRUIXIOMPLA7SQDMWO6MJKILDVI3IZOQYOXOF2C6O6`).
Each row is one submitted transaction; fee is the total charged after refunds, in stroops
(1 XLM = 10,000,000 stroops). Testnet fee settings may differ from mainnet: re-measure before launch.

| Payload bytes | Fee (stroops) | Fee (XLM) |
|---:|---:|---:|
| 1 | 2,651 | 0.000265 |
| 64 | 3,059 | 0.000306 |
| 256 | 4,369 | 0.000437 |
| 512 | 6,115 | 0.000612 |
| 1,024 | 9,608 | 0.000961 |
| 2,048 | 16,593 | 0.001659 |
| 4,096 | 30,564 | 0.003056 |
| 8,192 | 58,505 | 0.005851 |
| 12,000 | 84,482 | 0.008448 |
| 16,000 | 111,772 | 0.011177 |
| 16,200 | 113,137 | 0.011314 |
| 16,300 | rejected | |

## Findings
- Fee is linear in payload size: about 2.6k stroops fixed plus about 6.8 stroops per byte (event size dominates).
- Hard ceiling: the network caps total events size per transaction at 16,384 bytes. A 16,384-byte payload produced a 16,560-byte event (about 176 bytes of overhead), so the largest payload that fits is about 16,208 bytes. 16,300 was rejected.
- The fee is paid by the publisher; the protocol adds none (D5).

## Decision
`MAX_PAYLOAD_BYTES` = 4,096 (was 1,024): about 0.003 XLM per message at the cap, well under the network ceiling, and the same order as the text limits of the Telegram and ntfy delivery targets (4,096), so a maximal message is still deliverable whole. Raising it later is a contract upgrade (D9).
