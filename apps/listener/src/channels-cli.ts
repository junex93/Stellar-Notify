import { listChannelConfigs, removeChannelConfig, setChannelConfig } from "./channels/index.js";
import { connect } from "./db/index.js";

const USAGE = `usage:
  channels set <channelId> [label]   (restricted channels: salt via NOTIFY_CHANNEL_SALT, never argv)
  channels list
  channels remove <channelId>`;

const [command, ...args] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const db = connect(url);

try {
  if (command === "set" && args.length >= 1 && args.length <= 2) {
    const [channelId, label] = args as [string, string | undefined];
    const row = await setChannelConfig(db, {
      channelId: BigInt(channelId),
      label,
      salt: process.env.NOTIFY_CHANNEL_SALT,
    });
    console.log(
      `channel ${row.channelId}: label ${row.label ? `"${row.label}"` : "(none)"}, salt ${row.salt ? "set" : "not set"}`,
    );
  } else if (command === "list" && args.length === 0) {
    // The salt is a secret: only report whether it is set.
    for (const r of await listChannelConfigs(db)) {
      console.log(`${r.channelId}\t${r.label ?? ""}\t${r.salt ? "salt set" : "no salt"}`);
    }
  } else if (command === "remove" && args.length === 1) {
    console.log(
      (await removeChannelConfig(db, BigInt(args[0] as string))) ? "removed" : "not found",
    );
  } else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} finally {
  await db.$client.end();
}
