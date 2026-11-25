import { Keypair } from "@stellar/stellar-sdk";

/** Secrets stay in memory: callers read them from the Stellar CLI keystore, never from the repo. */
export function keypairFromSecret(secret: string): Keypair {
  return Keypair.fromSecret(secret.trim());
}
