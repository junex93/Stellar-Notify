import type { DeliveryEnvelope } from "@notify/protocol-types";
import type { DecodedEvent } from "../ingest/decode.js";

/** Builds the v1 delivery JSON (docs/architecture.md "Delivery JSON"). */
export function toEnvelope(event: DecodedEvent): DeliveryEnvelope {
  const base = {
    v: 1 as const,
    eventId: event.eventId,
    channelId: event.channelId.toString(),
    ledger: event.ledger,
    txHash: event.txHash,
    publishedAt: event.publishedAt,
  };
  if (event.kind === "message") {
    return {
      ...base,
      type: "message",
      publisher: event.publisher,
      payload: Buffer.from(event.payload).toString("base64"),
    };
  }
  return { ...base, type: "notice", event: event.event, data: event.data };
}
