import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { randomSalt, saltFromHex, subscriberCommitment, toHex } from "./commitment.js";
import { signMessage, verifyMessage } from "./sep53.js";

const wallet = Keypair.random().publicKey();
const salt = Uint8Array.from({ length: 32 }, (_, i) => i);

describe("subscriberCommitment", () => {
  it("is a stable 32-byte id", () => {
    const a = subscriberCommitment(7n, salt, wallet);
    expect(a).toHaveLength(32);
    expect(toHex(a)).toBe(toHex(subscriberCommitment(7n, salt, wallet)));
  });
  it("changes with the channel, the salt and the wallet", () => {
    const base = toHex(subscriberCommitment(7n, salt, wallet));
    expect(toHex(subscriberCommitment(8n, salt, wallet))).not.toBe(base);
    expect(toHex(subscriberCommitment(7n, randomSalt(), wallet))).not.toBe(base);
    expect(toHex(subscriberCommitment(7n, salt, Keypair.random().publicKey()))).not.toBe(base);
  });
  it("rejects a salt of the wrong size and a bad address", () => {
    expect(() => subscriberCommitment(7n, new Uint8Array(8), wallet)).toThrow(RangeError);
    expect(() => subscriberCommitment(7n, salt, "nope")).toThrow();
  });
  it("parses salts from hex only when they are 32 bytes", () => {
    expect(saltFromHex(toHex(salt))).toEqual(salt);
    expect(() => saltFromHex("abcd")).toThrow(/64 hex/);
  });
});

describe("SEP-53 messages", () => {
  const keypair = Keypair.random();
  const message = "notify-sub-v1 channel=3 chat=1 nonce=ab";
  it("verifies a signature from the signer's address", () => {
    expect(verifyMessage(keypair.publicKey(), message, signMessage(keypair, message))).toBe(true);
  });
  it("rejects another message, another signer and garbage", () => {
    const sig = signMessage(keypair, message);
    expect(verifyMessage(keypair.publicKey(), `${message}x`, sig)).toBe(false);
    expect(verifyMessage(Keypair.random().publicKey(), message, sig)).toBe(false);
    expect(verifyMessage(keypair.publicKey(), message, "not base64!")).toBe(false);
    expect(verifyMessage("nope", message, sig)).toBe(false);
  });
});
