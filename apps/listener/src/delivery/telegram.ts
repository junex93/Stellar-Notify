import type { DeliveryEnvelope } from "@notify/protocol-types";
import { displayText } from "./text.js";
import {
  type DeliveryAdapter,
  PermanentDeliveryError,
  RetryAfterError,
  type Target,
  TargetGoneError,
} from "./types.js";

const TIMEOUT_MS = 10_000;

interface TelegramReply {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Bot API `sendMessage` to `target.endpoint` (numeric chat id or @channelname).
 * The token comes from the environment, never from the database, and is kept
 * out of every error message because it is part of the request URL.
 */
export function createTelegramAdapter(
  token: string,
  fetchImpl: typeof fetch = fetch,
  apiBase = "https://api.telegram.org",
): DeliveryAdapter {
  return {
    kind: "telegram",
    async deliver(target: Target, message: DeliveryEnvelope) {
      let res: Response;
      try {
        res = await fetchImpl(`${apiBase}/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.endpoint,
            text: `Channel ${message.channelId}\n\n${displayText(message)}`,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new Error("telegram request failed");
      }
      if (res.ok) return;
      const reply = (await res.json().catch(() => ({}))) as TelegramReply;
      const detail = `telegram responded ${res.status}${reply.description ? `: ${reply.description}` : ""}`;
      if (res.status === 429) {
        throw new RetryAfterError(detail, (reply.parameters?.retry_after ?? 1) * 1000);
      }
      // Blocked, kicked or deleted chats never recover without the user re-adding the bot.
      if (res.status === 403 || (res.status === 400 && /chat not found/i.test(detail))) {
        throw new TargetGoneError(detail);
      }
      if (res.status >= 400 && res.status < 500) throw new PermanentDeliveryError(detail);
      throw new Error(detail);
    },
  };
}
