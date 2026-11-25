import { Address, hash } from "@stellar/stellar-sdk";

const DOMAIN = "notify-sub-v1";
export const SALT_BYTES = 32;

/**
 * Opaque id of an approved subscriber (docs/restricted-channels.md):
 * `SHA-256("notify-sub-v1" || channel_id (8 bytes BE) || salt (32 bytes) || wallet address XDR)`,
 * where the address XDR is the `ScVal` of the wallet's address. The salt never goes on-chain.
 */
export function subscriberCommitment(
  channelId: bigint,
  salt: Uint8Array,
  wallet: string,
): Uint8Array {
  if (salt.length !== SALT_BYTES) throw new RangeError(`salt must be ${SALT_BYTES} bytes`);
  const channel = new Uint8Array(8);
  new DataView(channel.buffer).setBigUint64(0, channelId);
  return new Uint8Array(
    hash(
      Buffer.concat([Buffer.from(DOMAIN), channel, salt, new Address(wallet).toScVal().toXDR()]),
    ),
  );
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export function saltFromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error("salt must be 64 hex characters");
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

export const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
