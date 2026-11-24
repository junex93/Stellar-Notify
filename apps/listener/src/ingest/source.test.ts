import type { rpc } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { RpcEventSource, cursorLedger } from "./index.js";

const cursorAt = (ledger: number) =>
  `${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-4294967295`;
const event = (id: string, ledger: number) => ({ id, ledger }) as unknown as rpc.Api.EventResponse;

describe("RpcEventSource.fetch", () => {
  it("decodes the ledger out of a cursor", () => {
    expect(cursorLedger(cursorAt(5_792_783))).toBe(5_792_783);
  });

  it("keeps paging through empty scan windows until the cursor reaches the tip", async () => {
    const latest = 30_000;
    // Windows of 10k ledgers: only the third one holds an event.
    const pages = [
      { events: [], cursor: cursorAt(10_000) },
      { events: [], cursor: cursorAt(20_000) },
      { events: [event("e1", 25_000)], cursor: cursorAt(29_999) },
    ];
    let call = 0;
    const server = {
      getHealth: async () => ({ oldestLedger: 1, latestLedger: latest }),
      getLatestLedger: async () => ({ sequence: latest }),
      getEvents: async () => ({ ...pages[call++], latestLedger: latest }),
    } as unknown as ConstructorParameters<typeof RpcEventSource>[2];
    const source = new RpcEventSource("http://x", "C", server);

    const result = await source.fetch(1);
    expect(result.events.map((e) => e.id)).toEqual(["e1"]);
    expect(result.nextLedger).toBe(latest);
    expect(call).toBe(3);
  });
});

describe("RpcEventSource retention race", () => {
  it("retries once from the oldest ledger the RPC names when start fell out of range", async () => {
    const calls: number[] = [];
    const server = {
      getHealth: async () => ({ oldestLedger: 100, latestLedger: 500 }),
      getLatestLedger: async () => ({ sequence: 500 }),
      getEvents: async (req: { startLedger?: number }) => {
        calls.push(req.startLedger ?? -1);
        if (req.startLedger === 100) {
          throw { code: -32600, message: "startLedger must be within the ledger range: 101 - 500" };
        }
        return { events: [], cursor: cursorAt(500), latestLedger: 500 };
      },
    } as unknown as ConstructorParameters<typeof RpcEventSource>[2];
    const result = await new RpcEventSource("http://x", "C", server).fetch(1);
    expect(calls).toEqual([100, 101]);
    expect(result.nextLedger).toBe(500);
  });
});
