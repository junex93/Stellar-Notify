import type { DeliveryEnvelope } from "@notify/protocol-types";
import { displayText } from "./text.js";
import { type DeliveryAdapter, type Target, failForStatus } from "./types.js";

const TIMEOUT_MS = 10_000;
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
      body: displayText(message),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) failForStatus("ntfy", res.status);
  },
};
