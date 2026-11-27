import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { subscriptions } from "../db/schema.js";

export const TARGET_KINDS = ["webhook", "ntfy", "telegram"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export interface TargetInput {
  channelId: bigint;
  kind: TargetKind;
  /** webhook/ntfy: URL; telegram: numeric chat id or @channelname. */
  endpoint: string;
  /** webhook: HMAC secret; ntfy: bearer token. */
  keys?: string | null;
}

const MAX_U64 = 2n ** 64n - 1n;

function httpUrl(endpoint: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(`${what} must be a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${what} must be http(s)`);
  }
  if (url.username || url.password) throw new Error(`${what} must not embed credentials`);
  return url;
}

export function assertChannelId(channelId: bigint): void {
  if (channelId < 1n || channelId > MAX_U64)
    throw new Error("channelId must be a u64 starting at 1");
}

/** Throws a descriptive error for anything the adapters could not deliver to. */
export function validateTarget(input: TargetInput): void {
  assertChannelId(input.channelId);
  switch (input.kind) {
    case "webhook":
      httpUrl(input.endpoint, "webhook endpoint");
      return;
    case "ntfy": {
      const url = httpUrl(input.endpoint, "ntfy endpoint");
      if (url.pathname.replace(/\//g, "") === "") {
        throw new Error("ntfy endpoint must include the topic (https://ntfy.sh/<topic>)");
      }
      return;
    }
    case "telegram":
      if (!/^(-?\d+|@\w{5,})$/.test(input.endpoint)) {
        throw new Error("telegram endpoint must be a numeric chat id or @channelname");
      }
      return;
    default:
      throw new Error(`unknown target kind: ${String(input.kind)}`);
  }
}

export type Target = typeof subscriptions.$inferSelect;

/** Registers a target for a channel. Re-registering updates the keys and reactivates it. */
export async function registerTarget(db: Db, input: TargetInput): Promise<Target> {
  validateTarget(input);
  const keys = input.keys ?? null;
  const [row] = await db
    .insert(subscriptions)
    .values({ channelId: input.channelId, kind: input.kind, endpoint: input.endpoint, keys })
    .onConflictDoUpdate({
      target: [subscriptions.channelId, subscriptions.endpoint],
      set: { kind: input.kind, keys, active: true },
    })
    .returning();
  return row as Target;
}

/** Removes a target and its pending deliveries. Returns whether it existed. */
export async function removeTarget(db: Db, channelId: bigint, endpoint: string): Promise<boolean> {
  const removed = await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.channelId, channelId), eq(subscriptions.endpoint, endpoint)))
    .returning({ id: subscriptions.id });
  return removed.length > 0;
}

export async function listTargets(db: Db, channelId?: bigint): Promise<Target[]> {
  const query = db.select().from(subscriptions);
  return (
    channelId === undefined ? query : query.where(eq(subscriptions.channelId, channelId))
  ).orderBy(asc(subscriptions.id));
}

/** Every channel a given chat or endpoint follows through one delivery kind. */
export async function listTargetsByEndpoint(
  db: Db,
  kind: TargetKind,
  endpoint: string,
): Promise<Target[]> {
  return db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.kind, kind), eq(subscriptions.endpoint, endpoint)))
    .orderBy(asc(subscriptions.channelId));
}
