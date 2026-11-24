import type {
  MessageEvent,
  NoticeData,
  NoticeEvent,
  NoticeEventName,
} from "@notify/protocol-types";
import { scValToNative, type xdr } from "@stellar/stellar-sdk";

/** Minimal shape of an RPC `getEvents` row that decoding needs. */
export interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
}

export type DecodedEvent =
  | ({ kind: "message" } & MessageEvent)
  | ({ kind: "notice" } & NoticeEvent);

const NOTICES: readonly NoticeEventName[] = [
  "admin_add",
  "admin_rm",
  "threshold",
  "transferred",
  "closed",
];

/** Topics the listener subscribes to; everything else is ignored. */
export const TOPIC_NAMES: readonly string[] = ["msg", ...NOTICES];

/**
 * Decodes a contract event into the v1 shape (docs/architecture.md). Returns
 * null for events the listener does not forward. The message payload stays
 * opaque bytes; it is never interpreted.
 */
export function decodeEvent(raw: RawEvent): DecodedEvent | null {
  const [name, channel] = raw.topic;
  if (!name || !channel) return null;
  const topic = scValToNative(name);
  if (typeof topic !== "string") return null;
  const channelId = scValToNative(channel);
  if (typeof channelId !== "bigint") return null;

  const base = {
    channelId,
    ledger: raw.ledger,
    txHash: raw.txHash,
    eventId: raw.id,
    publishedAt: raw.ledgerClosedAt,
  };
  const data = scValToNative(raw.value) as Record<string, unknown> | null;

  if (topic === "msg") {
    if (!data || typeof data.publisher !== "string" || !(data.payload instanceof Uint8Array)) {
      return null;
    }
    return {
      kind: "message",
      ...base,
      publisher: data.publisher,
      payload: data.payload,
    };
  }
  if (NOTICES.includes(topic as NoticeEventName)) {
    return {
      kind: "notice",
      ...base,
      event: topic as NoticeEventName,
      data: noticeData(topic as NoticeEventName, data),
    };
  }
  return null;
}

function noticeData(event: NoticeEventName, data: Record<string, unknown> | null): NoticeData {
  if (event === "threshold" && typeof data?.threshold === "number") {
    return { threshold: data.threshold };
  }
  if ((event === "admin_add" || event === "admin_rm") && typeof data?.admin === "string") {
    return { admin: data.admin };
  }
  return {};
}
