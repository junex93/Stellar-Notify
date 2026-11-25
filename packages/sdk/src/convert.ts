import type { ChannelKind } from "@notify/protocol-types";
import type { ChannelKind as ContractChannelKind } from "./generated/channels/index.js";

/** Mirrors `MAX_PAYLOAD_BYTES` in the contract; raising it there is a contract upgrade. */
export const MAX_PAYLOAD_BYTES = 4096;

export function toContractKind(kind: ChannelKind): ContractChannelKind {
  return kind === "restricted"
    ? { tag: "Restricted", values: undefined }
    : { tag: "Open", values: undefined };
}

export function fromContractKind(kind: ContractChannelKind): ChannelKind {
  return kind.tag === "Restricted" ? "restricted" : "open";
}

/** Checked locally so an oversized or empty message fails before a simulation round trip. */
export function toPayload(payload: Uint8Array | string): Uint8Array {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  if (bytes.length === 0) throw new RangeError("payload is empty");
  if (bytes.length > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`payload is ${bytes.length} bytes, max is ${MAX_PAYLOAD_BYTES}`);
  }
  return bytes;
}
