import type { DeliveryEnvelope } from "@notify/protocol-types";
import { describe, expect, it } from "vitest";
import { createTelegramAdapter } from "./telegram.js";
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
});
