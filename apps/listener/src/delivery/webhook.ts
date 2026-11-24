import type { DeliveryMessage } from "@notify/protocol-types";
import type { DeliveryAdapter, Target } from "./types.js";

export const webhookAdapter: DeliveryAdapter = {
  kind: "webhook",
  async deliver(_target: Target, _message: DeliveryMessage) {
    throw new Error("not implemented");
  },
};
