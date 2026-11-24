import type { DeliveryMessage } from "@notify/protocol-types";

export interface Target {
  endpoint: string;
  keys?: string | null;
}

/** Forwards content without opening it. */
export interface DeliveryAdapter {
  readonly kind: "webpush" | "webhook" | "ntfy";
  deliver(target: Target, message: DeliveryMessage): Promise<void>;
}
