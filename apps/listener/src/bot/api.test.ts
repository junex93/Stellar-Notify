import { describe, expect, it } from "vitest";
import { createBotApi } from "./api.js";

function stub(status: number, body: unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, api: createBotApi("123:SECRET", fetchImpl, "https://tg.test") };
}

describe("createBotApi", () => {
  it("long-polls getUpdates with the offset", async () => {
    const { calls, api } = stub(200, { ok: true, result: [{ update_id: 5 }] });
    expect(await api.getUpdates(5, 25)).toEqual([{ update_id: 5 }]);
    expect(calls[0]?.url).toBe("https://tg.test/bot123:SECRET/getUpdates");
    expect(calls[0]?.body).toMatchObject({ offset: 5, timeout: 25 });
  });

  it("sends messages without link previews", async () => {
    const { calls, api } = stub(200, { ok: true, result: {} });
    await api.sendMessage(7, "hi");
    expect(calls[0]?.body).toEqual({ chat_id: 7, text: "hi", disable_web_page_preview: true });
  });

  it("never puts the token in an error", async () => {
    const { api } = stub(401, { ok: false, description: "Unauthorized" });
    const err = (await api.sendMessage(7, "hi").catch((e) => e)) as Error;
    expect(err.message).toBe("telegram sendMessage responded 401: Unauthorized");
    expect(err.message).not.toContain("SECRET");
  });

  it("hides the token when the request itself fails", async () => {
    const api = createBotApi("123:SECRET", (async () => {
      throw new Error("connect ECONNREFUSED https://tg.test/bot123:SECRET/x");
    }) as unknown as typeof fetch);
    const err = (await api.getUpdates(0, 1).catch((e) => e)) as Error;
    expect(err.message).toBe("telegram getUpdates request failed");
  });
});
