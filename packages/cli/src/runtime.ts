import { NotifyClient } from "@notify/sdk";
import { loadConfig } from "./config.js";
import { loadKeypair } from "./identity.js";
import type { Deps } from "./program.js";

/** Real wiring shared by the `notify` binary and the demo script. */
export const runtime: Deps = {
  async connect(alias) {
    const keypair = await loadKeypair(alias);
    const client = new NotifyClient({ ...loadConfig(), keypair });
    return { client, address: keypair.publicKey() };
  },
  async readStdin() {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
  out: (line) => console.log(line),
};
