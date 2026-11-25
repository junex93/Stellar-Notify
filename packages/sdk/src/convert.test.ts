import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD_BYTES, fromContractKind, toContractKind, toPayload } from "./convert.js";

describe("channel kind", () => {
  it("round-trips both kinds", () => {
    expect(toContractKind("open").tag).toBe("Open");
    expect(toContractKind("restricted").tag).toBe("Restricted");
    expect(fromContractKind(toContractKind("restricted"))).toBe("restricted");
    expect(fromContractKind(toContractKind("open"))).toBe("open");
  });
});

describe("toPayload", () => {
  it("encodes strings as UTF-8", () => {
    expect(toPayload("é")).toEqual(Uint8Array.from([0xc3, 0xa9]));
  });
  it("passes bytes through", () => {
    const bytes = Uint8Array.from([1, 2]);
    expect(toPayload(bytes)).toBe(bytes);
  });
  it("rejects empty payloads", () => {
    expect(() => toPayload("")).toThrow(RangeError);
  });
  it("accepts exactly the max and rejects one byte more", () => {
    expect(toPayload(new Uint8Array(MAX_PAYLOAD_BYTES))).toHaveLength(MAX_PAYLOAD_BYTES);
    expect(() => toPayload(new Uint8Array(MAX_PAYLOAD_BYTES + 1))).toThrow(RangeError);
  });
});
