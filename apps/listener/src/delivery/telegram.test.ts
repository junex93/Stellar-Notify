import type { DeliveryEnvelope } from "@notify/protocol-types";
import { describe, expect, it } from "vitest";
import { explorerTxUrl } from "./explorer.js";
import { createTelegramAdapter, renderTelegram } from "./telegram.js";
import { PermanentDeliveryError, RetryAfterError, TargetGoneError } from "./types.js";

const envelope: DeliveryEnvelope = {
  v: 1,
  type: "message",
  eventId: "e1",
  channelId: "7",
  publisher: "GABC",
  payload: Buffer.from("hello").toString("base64"),
  ledger: 1,
  txHash: "ff",
  publishedAt: "2026-01-01T00:00:00Z",
};

function stub(status: number, body: unknown = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, adapter: createTelegramAdapter("123:SECRET", fetchImpl, "https://tg.test") };
}

describe("telegramAdapter", () => {
  it("calls sendMessage with the chat id and the payload text", async () => {
    const { calls, adapter } = stub(200, { ok: true });
    await adapter.deliver({ endpoint: "-1001" }, envelope);
    expect(calls[0]?.url).toBe("https://tg.test/bot123:SECRET/sendMessage");
    expect(calls[0]?.body).toMatchObject({ chat_id: "-1001", text: "Channel 7\n\nhello" });
  });

  it("turns 429 into a retry-after in milliseconds", async () => {
    const { adapter } = stub(429, { ok: false, parameters: { retry_after: 17 } });
    const err = await adapter.deliver({ endpoint: "1" }, envelope).catch((e) => e);
    expect(err).toBeInstanceOf(RetryAfterError);
    expect((err as RetryAfterError).retryAfterMs).toBe(17_000);
  });

  it("marks blocked bots and missing chats as gone", async () => {
    const blocked = stub(403, { ok: false, description: "Forbidden: bot was blocked by the user" });
    await expect(blocked.adapter.deliver({ endpoint: "1" }, envelope)).rejects.toBeInstanceOf(
      TargetGoneError,
    );
    const missing = stub(400, { ok: false, description: "Bad Request: chat not found" });
    await expect(missing.adapter.deliver({ endpoint: "1" }, envelope)).rejects.toBeInstanceOf(
      TargetGoneError,
    );
  });

  it("treats other 4xx as permanent and 5xx as retryable", async () => {
    const bad = stub(400, { ok: false, description: "Bad Request: message is too long" });
    await expect(bad.adapter.deliver({ endpoint: "1" }, envelope)).rejects.toBeInstanceOf(
      PermanentDeliveryError,
    );
    const down = stub(502);
    await expect(down.adapter.deliver({ endpoint: "1" }, envelope)).rejects.not.toBeInstanceOf(
      PermanentDeliveryError,
    );
  });

  it("never leaks the bot token in errors", async () => {
    const adapter = createTelegramAdapter("123:SECRET", (async () => {
      throw new TypeError("fetch failed: https://tg.test/bot123:SECRET/sendMessage");
    }) as unknown as typeof fetch);
    const err = await adapter.deliver({ endpoint: "1" }, envelope).catch((e) => e);
    expect((err as Error).message).not.toContain("SECRET");
  });

  it("sends the rendered text with label and verification link when configured", async () => {
    const calls: { body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(init.body as string) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = createTelegramAdapter("1:S", fetchImpl, "https://tg.test", {
      labelFor: async () => "News",
      explorerTxUrl: explorerTxUrl("Test SDF Network ; September 2015"),
    });
    await adapter.deliver({ endpoint: "1" }, envelope);
    expect(calls[0]?.body.text).toBe(
      "News (channel 7)\n\nhello\n\nVerify on-chain: https://stellar.expert/explorer/testnet/tx/ff",
    );
  });
});

describe("renderTelegram", () => {
  it("falls back to the channel id without a label or an explorer", async () => {
    expect(await renderTelegram(envelope)).toBe("Channel 7\n\nhello");
  });
  it("renders notices with the link", async () => {
    const notice: DeliveryEnvelope = {
      v: 1,
      type: "notice",
      eventId: "e2",
      channelId: "7",
      event: "closed",
      data: {},
      ledger: 2,
      txHash: "aa",
      publishedAt: "2026-01-01T00:00:00Z",
    };
    const text = await renderTelegram(notice, { explorerTxUrl: (h) => `https://x.test/${h}` });
    expect(text).toBe("Channel 7\n\nChannel notice: closed\n\nVerify on-chain: https://x.test/aa");
  });
  it("keeps a maximum-size payload under the Telegram limit", async () => {
    const big: DeliveryEnvelope = {
      ...envelope,
      payload: Buffer.from("é".repeat(1900)).toString("base64"),
    };
    const text = await renderTelegram(big, {
      labelFor: async () => "L".repeat(64),
      explorerTxUrl: explorerTxUrl("Public Global Stellar Network ; September 2015"),
    });
    expect([...text].length).toBeLessThanOrEqual(4096);
  });
  it("has no link for an unknown network", () => {
    expect(explorerTxUrl("Standalone Network ; February 2017")).toBeUndefined();
  });
});
