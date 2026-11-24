import { connect } from "./db/index.js";
import {
  TARGET_KINDS,
  type TargetKind,
  listTargets,
  registerTarget,
  removeTarget,
} from "./registry/index.js";

const USAGE = `usage:
  targets add <channelId> <kind> <endpoint>   (secret/token via NOTIFY_TARGET_KEYS)
  targets remove <channelId> <endpoint>
  targets list [channelId]
kinds: ${TARGET_KINDS.join(", ")}`;

const [command, ...args] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = connect(url);

try {
  if (command === "add" && args.length === 3) {
    const [channelId, kind, endpoint] = args as [string, string, string];
    if (!TARGET_KINDS.includes(kind as TargetKind)) throw new Error(`unknown kind: ${kind}`);
    const row = await registerTarget(db, {
      channelId: BigInt(channelId),
      kind: kind as TargetKind,
      endpoint,
      keys: process.env.NOTIFY_TARGET_KEYS,
    });
    console.log(`registered target ${row.id} (${row.kind}) for channel ${row.channelId}`);
  } else if (command === "remove" && args.length === 2) {
    const [channelId, endpoint] = args as [string, string];
    console.log((await removeTarget(db, BigInt(channelId), endpoint)) ? "removed" : "not found");
  } else if (command === "list" && args.length <= 1) {
    const rows = await listTargets(db, args[0] ? BigInt(args[0]) : undefined);
    // Endpoints can carry secrets (ntfy topics), so list only kind and a prefix.
    for (const r of rows) {
      console.log(
        `${r.id}\t${r.channelId}\t${r.kind}\t${r.active ? "active" : "inactive"}\t${r.endpoint.slice(0, 24)}…`,
      );
    }
  } else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} finally {
  await db.$client.end();
}
