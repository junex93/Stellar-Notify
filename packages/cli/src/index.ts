#!/usr/bin/env node
import { NotifyClient } from "@notify/sdk";
import { loadConfig } from "./config.js";
import { loadKeypair } from "./identity.js";
import { buildProgram } from "./program.js";

const program = buildProgram({
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
});

try {
  await program.parseAsync();
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
