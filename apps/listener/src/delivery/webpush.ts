import type { DeliveryEnvelope } from "@notify/protocol-types";
import type { DeliveryAdapter, Target } from "./types.js";

export const webpushAdapter: DeliveryAdapter = {
  kind: "webpush",
  async deliver(_target: Target, _message: DeliveryEnvelope) {
    throw new Error("not implemented");
  },
};
