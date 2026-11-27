import { randomBytes } from "node:crypto";
import { saltFromHex, subscriberCommitment, verifyMessage } from "@notify/sdk";
import { and, eq } from "drizzle-orm";
import { getChannelConfig } from "../channels/index.js";
import type { Db } from "../db/index.js";
import { proofChallenges } from "../db/schema.js";
import { listTargetsByEndpoint, registerTarget, removeTarget } from "../registry/index.js";
import type { ChainReader } from "./chain.js";

export const MAX_CHANNELS_PER_CHAT = 20;
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_U64 = 2n ** 64n - 1n;

export interface HandlerDeps {
  db: Db;
  chain: ChainReader;
  now?: () => Date;
  /** Hex nonce for wallet-ownership challenges; random unless a test pins it. */
  nonce?: () => string;
}

export interface ChatRef {
  id: bigint;
  type: string;
}

const HELP = `Stellar Notify bot
/subscribe <channel_id> - follow a channel here
/unsubscribe <channel_id> - stop following it
/list - channels this chat follows
/verify <channel_id> <wallet> <signature> - finish subscribing to a restricted channel`;

function parseId(raw: string | undefined): bigint | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const id = BigInt(raw);
  return id >= 1n && id <= MAX_U64 ? id : undefined;
}

/** The exact string the user signs. Bound to the chat, the channel and an expiry. */
export function challengeMessage(
  channelId: bigint,
  chatId: bigint,
  nonce: string,
  expiresAt: Date,
): string {
  return `notify-sub-v1 channel=${channelId} chat=${chatId} nonce=${nonce} exp=${Math.floor(expiresAt.getTime() / 1000)}`;
}

async function name(db: Db, channelId: bigint): Promise<string> {
  const label = (await getChannelConfig(db, channelId))?.label;
  return label ? `${label} (channel ${channelId})` : `Channel ${channelId}`;
}

/** Runs one chat message through the bot and returns the reply text. */
export async function handleMessage(
  deps: HandlerDeps,
  chat: ChatRef,
  text: string,
): Promise<string> {
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const command = (rawCommand ?? "").split("@")[0]?.toLowerCase();
  if (command === "/start" || command === "/help") return HELP;
  if (!["/subscribe", "/unsubscribe", "/list", "/verify"].includes(command ?? "")) return HELP;
  // A group would let any member subscribe the whole chat; v1 only serves private chats.
  if (chat.type !== "private")
    return "Subscriptions are only available in a private chat with the bot.";

  const endpoint = chat.id.toString();
  switch (command) {
    case "/subscribe":
      return subscribe(deps, chat, parseId(args[0]));
    case "/unsubscribe": {
      const id = parseId(args[0]);
      if (!id) return "Usage: /unsubscribe <channel_id>";
      const removed = await removeTarget(deps.db, id, endpoint);
      return removed
        ? `Unsubscribed from ${await name(deps.db, id)}.`
        : `You were not following channel ${id}.`;
    }
    case "/list": {
      const targets = await listTargetsByEndpoint(deps.db, "telegram", endpoint);
      if (targets.length === 0)
        return "You are not following any channel. Try /subscribe <channel_id>.";
      const lines = await Promise.all(targets.map((t) => name(deps.db, t.channelId)));
      return `Following:\n${lines.map((l) => `- ${l}`).join("\n")}`;
    }
    default:
      return verify(deps, chat, parseId(args[0]), args[1], args[2]);
  }
}

async function subscribe(
  deps: HandlerDeps,
  chat: ChatRef,
  id: bigint | undefined,
): Promise<string> {
  if (!id) return "Usage: /subscribe <channel_id>";
  const endpoint = chat.id.toString();
  const channel = await deps.chain.getChannel(id);
  if (!channel) return `Channel ${id} does not exist.`;
  if (channel.closed) return `Channel ${id} is closed.`;

  const followed = await listTargetsByEndpoint(deps.db, "telegram", endpoint);
  if (followed.some((t) => t.channelId === id))
    return `You already follow ${await name(deps.db, id)}.`;
  if (followed.length >= MAX_CHANNELS_PER_CHAT) {
    return `You can follow at most ${MAX_CHANNELS_PER_CHAT} channels. Use /unsubscribe first.`;
  }

  if (channel.kind === "open") return follow(deps, endpoint, id);

  const config = await getChannelConfig(deps.db, id);
  if (!config?.salt) {
    return `Channel ${id} is restricted and this bot cannot verify its subscribers. Ask the channel admins.`;
  }
  const now = (deps.now ?? (() => new Date()))();
  const nonce = (deps.nonce ?? (() => randomBytes(16).toString("hex")))();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await deps.db
    .insert(proofChallenges)
    .values({ chatId: chat.id, channelId: id, nonce, expiresAt })
    .onConflictDoUpdate({
      target: [proofChallenges.chatId, proofChallenges.channelId],
      set: { nonce, expiresAt },
    });
  const message = challengeMessage(id, chat.id, nonce, expiresAt);
  return [
    `Channel ${id} is restricted. Prove you own a wallet its admins approved.`,
    "",
    "1. Sign this message with your Stellar wallet (SEP-53):",
    message,
    `   Stellar CLI: stellar message sign "${message}" --sign-with-key <your-key>`,
    "",
    `2. Send: /verify ${id} <your G... address> <signature>`,
    "",
    "The challenge is valid for 10 minutes.",
  ].join("\n");
}

async function follow(deps: HandlerDeps, endpoint: string, id: bigint): Promise<string> {
  await registerTarget(deps.db, { channelId: id, kind: "telegram", endpoint });
  return `Subscribed to ${await name(deps.db, id)}. Its messages will arrive here.`;
}

async function verify(
  deps: HandlerDeps,
  chat: ChatRef,
  id: bigint | undefined,
  wallet: string | undefined,
  signature: string | undefined,
): Promise<string> {
  if (!id || !wallet || !signature) return "Usage: /verify <channel_id> <wallet> <signature>";
  const now = (deps.now ?? (() => new Date()))();
  const [challenge] = await deps.db
    .select()
    .from(proofChallenges)
    .where(and(eq(proofChallenges.chatId, chat.id), eq(proofChallenges.channelId, id)));
  if (!challenge || challenge.expiresAt <= now) {
    return `No valid challenge for channel ${id}. Send /subscribe ${id} again.`;
  }
  const message = challengeMessage(id, chat.id, challenge.nonce, challenge.expiresAt);
  if (!verifyMessage(wallet, message, signature)) {
    return "That signature does not match the challenge and wallet. Sign the exact message from /subscribe.";
  }
  const salt = (await getChannelConfig(deps.db, id))?.salt;
  if (!salt) return `Channel ${id} is no longer set up for verification. Ask the channel admins.`;

  const approved = await deps.chain.isApproved(
    id,
    subscriberCommitment(id, saltFromHex(salt), wallet),
  );
  if (!approved) {
    return `That wallet is not approved for channel ${id}. Ask an admin to approve it, then send /verify again.`;
  }
  await deps.db
    .delete(proofChallenges)
    .where(and(eq(proofChallenges.chatId, chat.id), eq(proofChallenges.channelId, id)));
  return follow(deps, chat.id.toString(), id);
}
