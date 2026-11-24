import type { DeliveryMessage } from "@notify/protocol-types";
import type { DeliveryAdapter, Target } from "./types.js";

export const ntfyAdapter: DeliveryAdapter = {
  kind: "ntfy",
  async deliver(_target: Target, _message: DeliveryMessage) {
    throw new Error("not implemented");
  },
};
