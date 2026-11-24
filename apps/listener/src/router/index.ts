import type { MessageEvent } from "@notify/protocol-types";
import type { DeliveryAdapter } from "../delivery/types.js";

/** Routes by channel id only; never inspects the payload. */
export async function route(_event: MessageEvent, _adapters: DeliveryAdapter[]): Promise<void> {
  throw new Error("not implemented");
}
