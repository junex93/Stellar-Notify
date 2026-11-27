import { Keypair, StrKey, hash } from "@stellar/stellar-sdk";

const PREFIX = "Stellar Signed Message:\n";

const digest = (message: string): Uint8Array => hash(Buffer.from(PREFIX + message));

/** SEP-53: ed25519 over SHA-256("Stellar Signed Message:\n" || message). Returns base64. */
export function signMessage(keypair: Keypair, message: string): string {
  return Buffer.from(keypair.sign(digest(message))).toString("base64");
}

/** False for a malformed address or signature rather than throwing: input comes from a chat. */
export function verifyMessage(address: string, message: string, signatureBase64: string): boolean {
  try {
    if (!StrKey.isValidEd25519PublicKey(address)) return false;
    const signature = Buffer.from(signatureBase64, "base64");
    if (signature.length !== 64) return false;
    return Keypair.fromPublicKey(address).verify(digest(message), signature);
  } catch {
    return false;
  }
}
