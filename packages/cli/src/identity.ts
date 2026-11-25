import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { keypairFromSecret } from "@notify/sdk";

const run = promisify(execFile);

export const DEFAULT_IDENTITY = process.env.CAATINGA_SOURCE ?? "notify-dev";

/**
 * Resolves a Stellar CLI keystore alias to a keypair. The secret is held in memory only and
 * is never put in an argument, log line or error message.
 */
export async function loadKeypair(alias: string): Promise<ReturnType<typeof keypairFromSecret>> {
  try {
    const { stdout } = await run("stellar", ["keys", "secret", alias]);
    return keypairFromSecret(stdout);
  } catch {
    throw new Error(`could not read identity "${alias}" from the Stellar CLI keystore`);
  }
}
