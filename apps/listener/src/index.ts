import { createBotApi } from "./bot/api.js";
import { createChainReader } from "./bot/chain.js";
import { runBot } from "./bot/index.js";
import { getChannelConfig } from "./channels/index.js";
import { connect, runMigrations } from "./db/index.js";
import { explorerTxUrl } from "./delivery/explorer.js";
import { ntfyAdapter } from "./delivery/ntfy.js";
import { createTelegramAdapter } from "./delivery/telegram.js";
import { webhookAdapter } from "./delivery/webhook.js";
import { processDue } from "./delivery/worker.js";
import { EnvelopeLoader, RpcEventSource, ingestOnce } from "./ingest/index.js";
import { log } from "./log.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const db = connect(required("DATABASE_URL"));
const contractId = required("NOTIFY_CHANNELS_CONTRACT_ID");
const rpcUrl = required("STELLAR_RPC_URL");
const startLedger = process.env.START_LEDGER ? Number(process.env.START_LEDGER) : undefined;
const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? 5000);

await runMigrations(db);

const source = new RpcEventSource(rpcUrl, contractId);
const loader = new EnvelopeLoader(source);
const adapters = [webhookAdapter, ntfyAdapter];
if (process.env.TELEGRAM_BOT_TOKEN) {
  adapters.push(
    createTelegramAdapter(process.env.TELEGRAM_BOT_TOKEN, fetch, undefined, {
      labelFor: async (channelId) =>
        (await getChannelConfig(db, BigInt(channelId)))?.label ?? undefined,
      explorerTxUrl: explorerTxUrl(process.env.STELLAR_NETWORK_PASSPHRASE ?? ""),
    }),
  );
} else {
  log("warn", "TELEGRAM_BOT_TOKEN not set: telegram targets will be dead-lettered");
}

let running = true;
let botDone: Promise<void> = Promise.resolve();
if (process.env.TELEGRAM_BOT_TOKEN) {
  botDone = runBot(
    createBotApi(process.env.TELEGRAM_BOT_TOKEN),
    {
      db,
      chain: createChainReader({
        rpcUrl,
        contractId,
        networkPassphrase: required("STELLAR_NETWORK_PASSPHRASE"),
      }),
    },
    () => running,
  );
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

log("info", "listener started", { contractId, rpcUrl });
while (running) {
  try {
    const ingested = await ingestOnce({ db, source, contractId, loader, startLedger });
    const delivered = await processDue(db, adapters, loader);
    if (ingested.events || delivered.sent || delivered.retried || delivered.dead) {
      log("info", "tick", { ...ingested, ...delivered });
    }
  } catch (err) {
    log("error", "tick failed", { error: err instanceof Error ? err.message : String(err) });
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
await botDone;
log("info", "listener stopped");
