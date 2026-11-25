import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NotifyClient, NotifyContractError, keypairFromSecret } from "./index.js";

/** Opt-in: submits real transactions on testnet with the `notify-dev` keystore identity. */
const enabled = process.env.NOTIFY_E2E === "1";
const alias = process.env.CAATINGA_SOURCE ?? "notify-dev";

describe.skipIf(!enabled)("NotifyClient on testnet", () => {
  const artifacts = JSON.parse(
    readFileSync(new URL("../../../caatinga.artifacts.json", import.meta.url), "utf8"),
  );
  const keypair = keypairFromSecret(
    execFileSync("stellar", ["keys", "secret", alias], { encoding: "utf8" }),
  );
  const me = keypair.publicKey();
  const client = new NotifyClient({
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: artifacts.networks.testnet.contracts.channels.contractId,
    keypair,
  });

  it("creates a channel, publishes and reads it back", { timeout: 120_000 }, async () => {
    const id = await client.createChannel(me, "open");
    await client.publish(id, me, "sdk e2e");
    const info = await client.getChannel(id);
    expect(info).toEqual({ admins: [me], kind: "open", threshold: 1, closed: false });
  });

  it("surfaces contract errors by name", { timeout: 120_000 }, async () => {
    await expect(client.publish(999_999_999n, me, "x")).rejects.toMatchObject({
      constructor: NotifyContractError,
      contractError: "ChannelNotFound",
    });
  });
});
