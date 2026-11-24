import { createHmac } from "node:crypto";
import type { DeliveryEnvelope } from "@notify/protocol-types";
import { type DeliveryAdapter, type Target, failForStatus } from "./types.js";

const TIMEOUT_MS = 10_000;

/** POSTs the envelope as JSON. With a secret, adds `X-Notify-Signature: sha256=<hmac>`. */
export const webhookAdapter: DeliveryAdapter = {
  kind: "webhook",
  async deliver(target: Target, message: DeliveryEnvelope) {
    const body = JSON.stringify(message);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (target.keys) {
      const sig = createHmac("sha256", target.keys).update(body).digest("hex");
      headers["x-notify-signature"] = `sha256=${sig}`;
    }
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) failForStatus("webhook", res.status);
  },
};
