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

/** Telegram caps a message at 4096 characters; the body gets what the header and link leave. */
const MAX_BODY_BYTES = 3800;

export interface TelegramOptions {
  /** Off-chain channel name (docs: channel_config); absent channels show `Channel <id>`. */
  labelFor?(channelId: string): Promise<string | undefined>;
  /** Explorer link that lets anyone verify the sender on-chain; omitted when unknown. */
  explorerTxUrl?(txHash: string): string | undefined;
}

/** Message text: channel name, payload (or notice), and the on-chain verification link. */
export async function renderTelegram(
  message: DeliveryEnvelope,
  options: TelegramOptions = {},
): Promise<string> {
  const label = await options.labelFor?.(message.channelId);
  const header = label ? `${label} (channel ${message.channelId})` : `Channel ${message.channelId}`;
  const parts = [header, displayText(message, MAX_BODY_BYTES)];
  const link = options.explorerTxUrl?.(message.txHash);
  if (link) parts.push(`Verify on-chain: ${link}`);
  return parts.join("\n\n");
}

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
  options: TelegramOptions = {},
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
            text: await renderTelegram(message, options),
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
