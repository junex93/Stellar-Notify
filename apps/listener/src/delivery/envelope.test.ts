import { describe, expect, it } from "vitest";
import type { DecodedEvent } from "../ingest/decode.js";
import { toEnvelope } from "./envelope.js";

const base = { channelId: 42n, ledger: 9, txHash: "ff", eventId: "e1", publishedAt: "t" };

describe("toEnvelope", () => {
  it("builds the v1 message envelope with a string channel id and base64 payload", () => {
    const event: DecodedEvent = {
      kind: "message",
      ...base,
      publisher: "GABC",
      payload: Uint8Array.from([104, 105]),
    };
    expect(toEnvelope(event)).toEqual({
      v: 1,
      type: "message",
      eventId: "e1",
      channelId: "42",
      publisher: "GABC",
      payload: "aGk=",
      ledger: 9,
      txHash: "ff",
      publishedAt: "t",
    });
  });

  it("builds a notice envelope without publisher or payload", () => {
    const event: DecodedEvent = { kind: "notice", ...base, event: "closed", data: {} };
    const envelope = toEnvelope(event);
    expect(envelope).toMatchObject({
      v: 1,
      type: "notice",
      event: "closed",
      data: {},
      channelId: "42",
    });
    expect(envelope).not.toHaveProperty("payload");
  });
});
