import type { DeliveryEnvelope } from "@notify/protocol-types";

/** ntfy turns bodies over 4096 bytes into attachments and Telegram caps text at 4096 chars. */
const MAX_BODY_BYTES = 4000;

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Human-readable body for chat-style targets. Payloads that are not text are only described. */
export function displayText(message: DeliveryEnvelope): string {
  if (message.type === "notice") return `Channel notice: ${message.event}`;
  const bytes = Buffer.from(message.payload, "base64");
  if (bytes.length > MAX_BODY_BYTES) return `Message too large to display (${bytes.length} bytes)`;
  try {
    return utf8.decode(bytes);
  } catch {
    return `Binary message (${bytes.length} bytes)`;
  }
}
