import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { channelConfig } from "../db/schema.js";
import { assertChannelId } from "../registry/index.js";

export const MAX_LABEL_CHARS = 64;

export type ChannelConfig = typeof channelConfig.$inferSelect;

export interface ChannelConfigInput {
  channelId: bigint;
  /** Omit to keep the stored label. */
  label?: string;
  /** 64 hex characters (32 bytes). Omit to keep the stored salt. */
  salt?: string;
}

function cleanLabel(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("label must not be empty");
  if ([...clean].length > MAX_LABEL_CHARS) {
    throw new Error(`label must be at most ${MAX_LABEL_CHARS} characters`);
  }
  return clean;
}

export async function setChannelConfig(db: Db, input: ChannelConfigInput): Promise<ChannelConfig> {
  assertChannelId(input.channelId);
  const set: Partial<typeof channelConfig.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) set.label = cleanLabel(input.label);
  if (input.salt !== undefined) {
    if (!/^[0-9a-fA-F]{64}$/.test(input.salt)) throw new Error("salt must be 64 hex characters");
    set.salt = input.salt.toLowerCase();
  }
  const [row] = await db
    .insert(channelConfig)
    .values({ channelId: input.channelId, label: set.label ?? null, salt: set.salt ?? null })
    .onConflictDoUpdate({ target: channelConfig.channelId, set })
    .returning();
  return row as ChannelConfig;
}

export async function getChannelConfig(
  db: Db,
  channelId: bigint,
): Promise<ChannelConfig | undefined> {
  const [row] = await db.select().from(channelConfig).where(eq(channelConfig.channelId, channelId));
  return row;
}

export async function listChannelConfigs(db: Db): Promise<ChannelConfig[]> {
  return db.select().from(channelConfig).orderBy(asc(channelConfig.channelId));
}

export async function removeChannelConfig(db: Db, channelId: bigint): Promise<boolean> {
  const removed = await db
    .delete(channelConfig)
    .where(eq(channelConfig.channelId, channelId))
    .returning({ id: channelConfig.channelId });
  return removed.length > 0;
}
