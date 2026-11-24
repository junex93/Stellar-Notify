import { connect, runMigrations } from "./db/index.js";
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
const adapters = [webhookAdapter];

let running = true;
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
log("info", "listener stopped");
