import type { DeliveryEnvelope } from "@notify/protocol-types";

export interface Target {
  endpoint: string;
  /** Adapter-specific secret/keys (webhook: optional HMAC secret). */
  keys?: string | null;
}

/** Forwards content without opening it. */
export interface DeliveryAdapter {
  readonly kind: "webpush" | "webhook" | "ntfy" | "telegram";
  /** Throws on failure; `PermanentDeliveryError` marks the target dead. */
  deliver(target: Target, message: DeliveryEnvelope): Promise<void>;
}

/** The target will never accept deliveries (e.g. 410 Gone): stop retrying. */
export class PermanentDeliveryError extends Error {}
