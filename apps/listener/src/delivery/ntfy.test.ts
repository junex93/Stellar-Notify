import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DeliveryEnvelope } from "@notify/protocol-types";
import { afterEach, describe, expect, it } from "vitest";
import { ntfyAdapter } from "./ntfy.js";
import { PermanentDeliveryError } from "./types.js";

const message = (payload: Uint8Array): DeliveryEnvelope => ({
  v: 1,
  type: "message",
  eventId: "e1",
  channelId: "7",
  publisher: "GABC",
  payload: Buffer.from(payload).toString("base64"),
  ledger: 1,
  txHash: "ff",
  publishedAt: "2026-01-01T00:00:00Z",
});

let server: Server | undefined;
afterEach(() => server?.close());

function serve(status: number) {
  const seen: { body: string; headers: Record<string, unknown> }[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      seen.push({ body, headers: req.headers });
      res.statusCode = status;
      res.end();
    });
  }).listen(0);
  return { seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/topic` };
}

describe("ntfyAdapter", () => {
  it("publishes text payloads as the message body", async () => {
    const { seen, url } = serve(200);
    await ntfyAdapter.deliver({ endpoint: url }, message(new TextEncoder().encode("hello ✓")));
    expect(seen[0]?.body).toBe("hello ✓");
    expect(seen[0]?.headers.title).toBe("Channel 7");
    expect(seen[0]?.headers.authorization).toBeUndefined();
  });

  it("sends the bearer token for protected topics", async () => {
    const { seen, url } = serve(200);
    await ntfyAdapter.deliver({ endpoint: url, keys: "tk_abc" }, message(Uint8Array.from([104])));
    expect(seen[0]?.headers.authorization).toBe("Bearer tk_abc");
  });

  it("describes binary and oversized payloads instead of dumping them", async () => {
    const { seen, url } = serve(200);
    await ntfyAdapter.deliver({ endpoint: url }, message(Uint8Array.from([0xff, 0xfe])));
    await ntfyAdapter.deliver({ endpoint: url }, message(new Uint8Array(4096).fill(97)));
    expect(seen[0]?.body).toBe("Binary message (2 bytes)");
    expect(seen[1]?.body).toBe("Message too large to display (4096 bytes)");
  });

  it("summarizes notices", async () => {
    const { seen, url } = serve(200);
    await ntfyAdapter.deliver(
      { endpoint: url },
      {
        v: 1,
        type: "notice",
        eventId: "e2",
        channelId: "7",
        ledger: 1,
        txHash: "ff",
        publishedAt: "2026-01-01T00:00:00Z",
        event: "closed",
        data: {},
      },
    );
    expect(seen[0]?.body).toBe("Channel notice: closed");
  });

  it("treats 4xx as permanent except rate limits, and 5xx as retryable", async () => {
    const forbidden = serve(403);
    await expect(
      ntfyAdapter.deliver({ endpoint: forbidden.url }, message(Uint8Array.from([1]))),
    ).rejects.toBeInstanceOf(PermanentDeliveryError);
    server?.close();
    const limited = serve(429);
    await expect(
      ntfyAdapter.deliver({ endpoint: limited.url }, message(Uint8Array.from([1]))),
    ).rejects.not.toBeInstanceOf(PermanentDeliveryError);
  });
});
