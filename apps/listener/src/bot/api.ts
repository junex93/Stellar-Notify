const TIMEOUT_MS = 10_000;

export interface BotUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: { id: number; type: string };
  };
}

export interface BotApi {
  /** Long poll: resolves with no updates after `timeoutSec` seconds of silence. */
  getUpdates(offset: number, timeoutSec: number): Promise<BotUpdate[]>;
  sendMessage(chatId: number | string, text: string): Promise<void>;
}

interface Reply<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

/**
 * Minimal Telegram Bot API client. The token is part of every request URL, so errors only
 * carry the method name and Telegram's own description, never the URL.
 */
export function createBotApi(
  token: string,
  fetchImpl: typeof fetch = fetch,
  apiBase = "https://api.telegram.org",
): BotApi {
  async function call<T>(method: string, body: unknown, timeoutMs: number): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${apiBase}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(`telegram ${method} request failed`);
    }
    const reply = (await res.json().catch(() => ({}))) as Reply<T>;
    if (!res.ok || !reply.ok) {
      throw new Error(`telegram ${method} responded ${res.status}: ${reply.description ?? ""}`);
    }
    return reply.result as T;
  }

  return {
    getUpdates: (offset, timeoutSec) =>
      call<BotUpdate[]>(
        "getUpdates",
        { offset, timeout: timeoutSec, allowed_updates: ["message"] },
        timeoutSec * 1000 + TIMEOUT_MS,
      ),
    async sendMessage(chatId, text) {
      await call(
        "sendMessage",
        { chat_id: chatId, text, disable_web_page_preview: true },
        TIMEOUT_MS,
      );
    },
  };
}
