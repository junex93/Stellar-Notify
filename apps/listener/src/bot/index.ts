import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { botState } from "../db/schema.js";
import { log } from "../log.js";
import type { BotApi } from "./api.js";
import { type HandlerDeps, handleMessage } from "./handler.js";

const OFFSET_KEY = "telegram_update_offset";
const POLL_TIMEOUT_SEC = 25;
const RETRY_DELAY_MS = 5_000;

async function loadOffset(db: Db): Promise<number> {
  const [row] = await db.select().from(botState).where(eq(botState.key, OFFSET_KEY));
  return row ? Number(row.value) : 0;
}

async function saveOffset(db: Db, offset: number): Promise<void> {
  await db
    .insert(botState)
    .values({ key: OFFSET_KEY, value: String(offset) })
    .onConflictDoUpdate({ target: botState.key, set: { value: String(offset) } });
}

/** Answers every pending update once; the offset is stored so a restart never replays them. */
export async function pollOnce(api: BotApi, deps: HandlerDeps, timeoutSec = 0): Promise<number> {
  let offset = await loadOffset(deps.db);
  const updates = await api.getUpdates(offset, timeoutSec);
  for (const update of updates) {
    offset = update.update_id + 1;
    const message = update.message;
    if (message?.text) {
      let reply: string;
      try {
        reply = await handleMessage(
          deps,
          { id: BigInt(message.chat.id), type: message.chat.type },
          message.text,
        );
      } catch (err) {
        log("error", "bot command failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        reply = "Something went wrong. Please try again in a moment.";
      }
      await api.sendMessage(message.chat.id, reply).catch((err) => {
        log("warn", "bot reply failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
    await saveOffset(deps.db, offset);
  }
  return updates.length;
}

export async function runBot(
  api: BotApi,
  deps: HandlerDeps,
  isRunning: () => boolean,
): Promise<void> {
  log("info", "telegram bot started");
  while (isRunning()) {
    try {
      await pollOnce(api, deps, POLL_TIMEOUT_SEC);
    } catch (err) {
      log("error", "bot poll failed", { error: err instanceof Error ? err.message : String(err) });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  log("info", "telegram bot stopped");
}
