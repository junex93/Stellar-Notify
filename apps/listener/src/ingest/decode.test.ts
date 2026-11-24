import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { type RawEvent, decodeEvent } from "./decode.js";

const PUBLISHER = Keypair.random().publicKey();

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const entry = (key: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(key), val });
const map = (...entries: xdr.ScMapEntry[]) => xdr.ScVal.scvMap(entries);

function raw(topic: string, channel: bigint, value: xdr.ScVal): RawEvent {
  return {
    id: "0000000001-0000000001",
    ledger: 1234,
    ledgerClosedAt: "2026-01-01T00:00:00Z",
    txHash: "ab".repeat(32),
    topic: [sym(topic), nativeToScVal(channel, { type: "u64" })],
    value,
  };
}

describe("decodeEvent", () => {
  it("decodes a message and keeps the payload as opaque bytes", () => {
    const payload = Uint8Array.from([1, 2, 3, 255]);
    const event = decodeEvent(
      raw(
        "msg",
        42n,
        map(
          entry("payload", xdr.ScVal.scvBytes(Buffer.from(payload))),
          entry("publisher", new Address(PUBLISHER).toScVal()),
        ),
      ),
    );
    expect(event).toMatchObject({
      kind: "message",
      channelId: 42n,
      publisher: PUBLISHER,
      ledger: 1234,
      eventId: "0000000001-0000000001",
      publishedAt: "2026-01-01T00:00:00Z",
    });
    expect(event?.kind === "message" && Array.from(event.payload)).toEqual([1, 2, 3, 255]);
  });

  it("decodes admin-change notices", () => {
    const admin = new Address(PUBLISHER).toScVal();
    expect(decodeEvent(raw("admin_add", 1n, map(entry("admin", admin))))).toMatchObject({
      kind: "notice",
      event: "admin_add",
      data: { admin: PUBLISHER },
    });
    expect(
      decodeEvent(raw("threshold", 1n, map(entry("threshold", nativeToScVal(2, { type: "u32" }))))),
    ).toMatchObject({ kind: "notice", event: "threshold", data: { threshold: 2 } });
    expect(decodeEvent(raw("closed", 7n, xdr.ScVal.scvVoid()))).toMatchObject({
      kind: "notice",
      event: "closed",
      data: {},
    });
  });

  it("ignores events the listener does not forward", () => {
    expect(
      decodeEvent(raw("created", 1n, map(entry("admin", new Address(PUBLISHER).toScVal())))),
    ).toBeNull();
    expect(decodeEvent(raw("sub_ok", 1n, xdr.ScVal.scvVoid()))).toBeNull();
  });

  it("rejects malformed messages instead of guessing", () => {
    expect(decodeEvent(raw("msg", 1n, xdr.ScVal.scvVoid()))).toBeNull();
    expect(decodeEvent({ ...raw("msg", 1n, xdr.ScVal.scvVoid()), topic: [sym("msg")] })).toBeNull();
  });
});
