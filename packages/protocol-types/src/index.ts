/** DRAFT — wire formats are still open questions in the README. */

export type ChannelId = bigint;

export type ChannelKind = "open" | "restricted";

/** Decoded `("msg", channel_id)` contract event. Payload stays opaque. */
export interface MessageEvent {
  channelId: ChannelId;
  publisher: string;
  payload: Uint8Array;
  ledger: number;
  txHash: string;
  /** ISO-8601 ledger close time. */
  publishedAt: string;
}

/** What the listener hands to delivery adapters (webhook / Web Push / ntfy). */
export interface DeliveryMessage {
  channelId: string;
  publisher: string;
  /** base64 of the opaque payload; listener never decrypts. */
  payload: string;
  ledger: number;
  txHash: string;
  publishedAt: string;
}
