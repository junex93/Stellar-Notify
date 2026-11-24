import type { DeliveryEnvelope } from "@notify/protocol-types";

export interface Target {
  endpoint: string;
  /** Adapter-specific secret/keys (webhook: HMAC secret; ntfy: bearer token). */
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

/** Throws for a non-2xx HTTP response; 4xx other than timeouts/rate limits is permanent. */
export function failForStatus(name: string, status: number): never {
  const detail = `${name} responded ${status}`;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    throw new PermanentDeliveryError(detail);
  }
  throw new Error(detail);
}
