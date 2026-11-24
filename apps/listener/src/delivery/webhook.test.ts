import { createHmac } from "node:crypto";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DeliveryEnvelope } from "@notify/protocol-types";
import { afterEach, describe, expect, it } from "vitest";
import { PermanentDeliveryError } from "./types.js";
import { webhookAdapter } from "./webhook.js";

const envelope: DeliveryEnvelope = {
  v: 1,
  type: "message",
  eventId: "e1",
  channelId: "1",
  publisher: "GABC",
  payload: "aGk=",
  ledger: 1,
  txHash: "ff",
  publishedAt: "2026-01-01T00:00:00Z",
};

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
  return { seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe("webhookAdapter", () => {
  it("POSTs the envelope as JSON", async () => {
    const { seen, url } = serve(200);
    await webhookAdapter.deliver({ endpoint: url }, envelope);
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual(envelope);
    expect(seen[0]?.headers["content-type"]).toBe("application/json");
    expect(seen[0]?.headers["x-notify-signature"]).toBeUndefined();
  });

  it("signs the exact body with the target secret when configured", async () => {
    const { seen, url } = serve(200);
    await webhookAdapter.deliver({ endpoint: url, keys: "s3cret" }, envelope);
    const expected = createHmac("sha256", "s3cret")
      .update(seen[0]?.body ?? "")
      .digest("hex");
    expect(seen[0]?.headers["x-notify-signature"]).toBe(`sha256=${expected}`);
  });

  it("retries on 5xx and 429 but gives up permanently on other 4xx", async () => {
    let { url } = serve(503);
    await expect(webhookAdapter.deliver({ endpoint: url }, envelope)).rejects.toThrow("503");
    await expect(webhookAdapter.deliver({ endpoint: url }, envelope)).rejects.not.toBeInstanceOf(
      PermanentDeliveryError,
    );
    server?.close();
    ({ url } = serve(429));
    await expect(webhookAdapter.deliver({ endpoint: url }, envelope)).rejects.not.toBeInstanceOf(
      PermanentDeliveryError,
    );
    server?.close();
    ({ url } = serve(404));
    await expect(webhookAdapter.deliver({ endpoint: url }, envelope)).rejects.toBeInstanceOf(
      PermanentDeliveryError,
    );
  });
});
