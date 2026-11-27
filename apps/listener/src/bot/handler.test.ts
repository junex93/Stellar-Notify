import { randomSalt, signMessage, subscriberCommitment, toHex } from "@notify/sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setChannelConfig } from "../channels/index.js";
import { type Db, connect, runMigrations } from "../db/index.js";
import { listTargets } from "../registry/index.js";
import type { BotApi, BotUpdate } from "./api.js";
import type { ChainChannel, ChainReader } from "./chain.js";
import {
  CHALLENGE_TTL_MS,
  MAX_CHANNELS_PER_CHAT,
  challengeMessage,
  handleMessage,
} from "./handler.js";
import { pollOnce } from "./index.js";

const url = process.env.DATABASE_URL;
// These tests truncate tables: only ever run them against a throwaway database.
const safe = url !== undefined && /\/(notify|[\w-]+_test)$/.test(url);

const CHAT = { id: 4242n, type: "private" };
const NOW = new Date("2026-01-01T12:00:00Z");

class FakeChain implements ChainReader {
  channels = new Map<bigint, ChainChannel>();
  approved = new Set<string>();
  async getChannel(id: bigint) {
    return this.channels.get(id);
  }
  async isApproved(id: bigint, commitment: Uint8Array) {
    return this.approved.has(`${id}:${toHex(commitment)}`);
  }
}

describe.skipIf(!safe)("telegram bot (Postgres)", () => {
  let db: Db;
  let chain: FakeChain;
  const deps = () => ({ db, chain, now: () => NOW, nonce: () => "n0nce" });
  const say = (text: string, chat = CHAT) => handleMessage(deps(), chat, text);

  beforeAll(async () => {
    db = connect(url as string);
    await runMigrations(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });
  beforeEach(async () => {
    await db.execute(
      sql`truncate deliveries, subscriptions, channel_config, bot_state, proof_challenges restart identity cascade`,
    );
    chain = new FakeChain();
    chain.channels.set(1n, { kind: "open", closed: false });
  });

  it("shows help for /start and for anything unknown", async () => {
    expect(await say("/start")).toContain("/subscribe");
    expect(await say("hello")).toContain("/subscribe");
    expect(await say("/subscribe@MyBot 1")).toContain("Subscribed");
  });

  it("only serves private chats", async () => {
    expect(await say("/subscribe 1", { id: -100n, type: "supergroup" })).toMatch(/private chat/);
    expect(await listTargets(db)).toHaveLength(0);
  });

  describe("open channels", () => {
    it("subscribes, is idempotent, lists and unsubscribes", async () => {
      expect(await say("/subscribe 1")).toContain("Subscribed to Channel 1");
      expect(await say("/subscribe 1")).toContain("already follow");
      const [target] = await listTargets(db);
      expect([target?.kind, target?.endpoint, target?.channelId]).toEqual(["telegram", "4242", 1n]);
      expect(await say("/list")).toContain("- Channel 1");
      expect(await say("/unsubscribe 1")).toContain("Unsubscribed");
      expect(await say("/unsubscribe 1")).toContain("not following");
      expect(await say("/list")).toContain("not following any channel");
    });

    it("uses the off-chain label when there is one", async () => {
      await setChannelConfig(db, { channelId: 1n, label: "News" });
      expect(await say("/subscribe 1")).toContain("News (channel 1)");
      expect(await say("/list")).toContain("- News (channel 1)");
    });

    it("rejects missing, closed and malformed channels", async () => {
      chain.channels.set(2n, { kind: "open", closed: true });
      expect(await say("/subscribe 99")).toContain("does not exist");
      expect(await say("/subscribe 2")).toContain("is closed");
      expect(await say("/subscribe abc")).toContain("Usage");
      expect(await say("/subscribe 0")).toContain("Usage");
      expect(await say("/subscribe 18446744073709551616")).toContain("Usage");
      expect(await listTargets(db)).toHaveLength(0);
    });

    it("caps how many channels one chat can follow", async () => {
      for (let i = 1; i <= MAX_CHANNELS_PER_CHAT; i++) {
        chain.channels.set(BigInt(i), { kind: "open", closed: false });
        await say(`/subscribe ${i}`);
      }
      chain.channels.set(500n, { kind: "open", closed: false });
      expect(await say("/subscribe 500")).toContain("at most");
    });

    it("keeps chats apart", async () => {
      await say("/subscribe 1");
      expect(await say("/list", { id: 7n, type: "private" })).toContain(
        "not following any channel",
      );
    });
  });

  describe("restricted channels", () => {
    const salt = randomSalt();
    const wallet = Keypair.random();
    const expiresAt = new Date(NOW.getTime() + CHALLENGE_TTL_MS);
    const message = challengeMessage(5n, CHAT.id, "n0nce", expiresAt);

    beforeEach(async () => {
      chain.channels.set(5n, { kind: "restricted", closed: false });
      await setChannelConfig(db, { channelId: 5n, salt: toHex(salt) });
    });

    const approve = (who = wallet) =>
      chain.approved.add(`5:${toHex(subscriberCommitment(5n, salt, who.publicKey()))}`);

    it("refuses without a configured salt", async () => {
      chain.channels.set(6n, { kind: "restricted", closed: false });
      expect(await say("/subscribe 6")).toContain("cannot verify");
    });

    it("issues a challenge bound to this chat, without subscribing", async () => {
      const reply = await say("/subscribe 5");
      expect(reply).toContain(message);
      expect(reply).toContain("/verify 5");
      expect(await listTargets(db)).toHaveLength(0);
    });

    it("subscribes after a valid signature from an approved wallet", async () => {
      approve();
      await say("/subscribe 5");
      const reply = await say(`/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`);
      expect(reply).toContain("Subscribed to Channel 5");
      expect(await listTargets(db)).toHaveLength(1);
      // The challenge is single-use.
      expect(
        await say(`/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`),
      ).toContain("No valid challenge");
    });

    it("does not subscribe a wallet the admins have not approved", async () => {
      await say("/subscribe 5");
      const reply = await say(`/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`);
      expect(reply).toContain("not approved");
      expect(await listTargets(db)).toHaveLength(0);
      // Once an admin approves, the same challenge still works.
      approve();
      expect(
        await say(`/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`),
      ).toContain("Subscribed");
    });

    it("rejects a signature from a different wallet than the one claimed", async () => {
      approve();
      await say("/subscribe 5");
      const other = Keypair.random();
      const reply = await say(`/verify 5 ${wallet.publicKey()} ${signMessage(other, message)}`);
      expect(reply).toContain("does not match");
      expect(await listTargets(db)).toHaveLength(0);
    });

    it("rejects a signature over another chat's challenge", async () => {
      approve();
      await say("/subscribe 5");
      const forOtherChat = challengeMessage(5n, 999n, "n0nce", expiresAt);
      const reply = await say(
        `/verify 5 ${wallet.publicKey()} ${signMessage(wallet, forOtherChat)}`,
      );
      expect(reply).toContain("does not match");
    });

    it("rejects an expired challenge", async () => {
      approve();
      await say("/subscribe 5");
      const later = { ...deps(), now: () => new Date(NOW.getTime() + CHALLENGE_TTL_MS + 1) };
      const reply = await handleMessage(
        later,
        CHAT,
        `/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`,
      );
      expect(reply).toContain("No valid challenge");
    });

    it("needs a challenge before /verify", async () => {
      expect(
        await say(`/verify 5 ${wallet.publicKey()} ${signMessage(wallet, message)}`),
      ).toContain("No valid challenge");
    });
  });

  describe("polling", () => {
    function fakeApi(updates: BotUpdate[]) {
      const sent: { chatId: number | string; text: string }[] = [];
      const offsets: number[] = [];
      const api: BotApi = {
        async getUpdates(offset) {
          offsets.push(offset);
          return updates.filter((u) => u.update_id >= offset);
        },
        async sendMessage(chatId, text) {
          sent.push({ chatId, text });
        },
      };
      return { api, sent, offsets };
    }
    const update = (id: number, text: string): BotUpdate => ({
      update_id: id,
      message: { text, chat: { id: 4242, type: "private" } },
    });

    it("answers each update once and resumes from the stored offset", async () => {
      const { api, sent, offsets } = fakeApi([update(10, "/subscribe 1"), update(11, "/list")]);
      expect(await pollOnce(api, deps())).toBe(2);
      expect(sent.map((s) => s.chatId)).toEqual([4242, 4242]);
      expect(sent[0]?.text).toContain("Subscribed");
      // A second poll (e.g. after a restart) starts after the last handled update.
      expect(await pollOnce(api, deps())).toBe(0);
      expect(offsets).toEqual([0, 12]);
    });

    it("keeps going when a command fails", async () => {
      chain.getChannel = async () => {
        throw new Error("rpc down");
      };
      const { api, sent } = fakeApi([update(1, "/subscribe 1"), update(2, "/list")]);
      await pollOnce(api, deps());
      expect(sent[0]?.text).toContain("Something went wrong");
      expect(sent[1]?.text).toContain("not following");
    });

    it("ignores updates without text", async () => {
      const { api, sent } = fakeApi([{ update_id: 1 }]);
      await pollOnce(api, deps());
      expect(sent).toHaveLength(0);
    });
  });
});
