import type { DeliveryEnvelope } from "@notify/protocol-types";
import { type DeliveryAdapter, type Target, failForStatus } from "./types.js";

const TIMEOUT_MS = 10_000;
/** ntfy turns bodies over 4096 bytes into attachments; stay under it. */
const MAX_BODY_BYTES = 4000;

const utf8 = new TextDecoder("utf-8", { fatal: true });

function bodyFor(message: DeliveryEnvelope): string {
  if (message.type === "notice") return `Channel notice: ${message.event}`;
  const bytes = Buffer.from(message.payload, "base64");
  if (bytes.length > MAX_BODY_BYTES) return `Message too large to display (${bytes.length} bytes)`;
  try {
    return utf8.decode(bytes);
  } catch {
    return `Binary message (${bytes.length} bytes)`;
  }
}

/**
 * Publishes to an ntfy topic: `endpoint` is the topic URL (https://ntfy.sh/<topic>),
 * `keys` an optional bearer token for protected topics. The topic name is the
 * only secret on public servers, so it is never logged.
 */
export const ntfyAdapter: DeliveryAdapter = {
  kind: "ntfy",
  async deliver(target: Target, message: DeliveryEnvelope) {
    const headers: Record<string, string> = {
      title: `Channel ${message.channelId}`,
      tags: message.type === "notice" ? "bell" : "envelope",
    };
    if (target.keys) headers.authorization = `Bearer ${target.keys}`;
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers,
      body: bodyFor(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) failForStatus("ntfy", res.status);
  },
};
