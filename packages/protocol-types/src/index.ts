/** v1 wire formats. See docs/architecture.md ("Contract events", "Delivery JSON"). */

export type ChannelId = bigint;

export type ChannelKind = "open" | "restricted";

/** Decoded `("msg", channel_id)` contract event. Payload stays opaque. */
export interface MessageEvent {
  channelId: ChannelId;
  publisher: string;
  payload: Uint8Array;
  ledger: number;
  txHash: string;
  /** Soroban RPC event id; idempotency key. */
  eventId: string;
  /** ISO-8601 ledger close time. */
  publishedAt: string;
}

/** Contract topics for admin-set changes announced to subscribers. */
export type NoticeEventName = "admin_add" | "admin_rm" | "threshold" | "transferred" | "closed";

export type NoticeData = { admin: string } | { threshold: number } | Record<string, never>;

/** Decoded admin-change contract event. */
export interface NoticeEvent {
  channelId: ChannelId;
  event: NoticeEventName;
  data: NoticeData;
  ledger: number;
  txHash: string;
  eventId: string;
  publishedAt: string;
}

interface DeliveryBase {
  /** Schema version; consumers ignore unknown fields. */
  v: 1;
  eventId: string;
  /** Decimal string: u64 does not fit a JS number. */
  channelId: string;
  ledger: number;
  txHash: string;
  publishedAt: string;
}

/** What the listener hands to delivery adapters (webhook / Telegram / ntfy). */
export interface DeliveryMessage extends DeliveryBase {
  type: "message";
  publisher: string;
  /** base64 of the opaque payload; listener never decrypts. */
  payload: string;
}

export interface DeliveryNotice extends DeliveryBase {
  type: "notice";
  event: NoticeEventName;
  data: NoticeData;
}

export type DeliveryEnvelope = DeliveryMessage | DeliveryNotice;
