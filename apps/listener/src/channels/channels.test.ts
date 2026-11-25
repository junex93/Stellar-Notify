import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, connect, runMigrations } from "../db/index.js";
import {
  getChannelConfig,
  listChannelConfigs,
  removeChannelConfig,
  setChannelConfig,
} from "./index.js";

const url = process.env.DATABASE_URL;
const safe = url !== undefined && /\/(notify|[\w-]+_test)$/.test(url);
const SALT = "ab".repeat(32);

describe.skipIf(!safe)("channel config (Postgres)", () => {
  let db: Db;
  beforeAll(async () => {
    db = connect(url as string);
    await runMigrations(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });
  beforeEach(async () => {
    await db.execute(sql`truncate channel_config`);
  });

  it("stores a label and a salt and keeps what is not provided", async () => {
    await setChannelConfig(db, { channelId: 3n, label: "  My   news " });
    await setChannelConfig(db, { channelId: 3n, salt: SALT.toUpperCase() });
    expect(await getChannelConfig(db, 3n)).toMatchObject({ label: "My news", salt: SALT });
    await setChannelConfig(db, { channelId: 3n, label: "Renamed" });
    expect(await getChannelConfig(db, 3n)).toMatchObject({ label: "Renamed", salt: SALT });
  });

  it("lists and removes", async () => {
    await setChannelConfig(db, { channelId: 2n, label: "b" });
    await setChannelConfig(db, { channelId: 1n, label: "a" });
    expect((await listChannelConfigs(db)).map((r) => r.channelId)).toEqual([1n, 2n]);
    expect(await removeChannelConfig(db, 1n)).toBe(true);
    expect(await removeChannelConfig(db, 1n)).toBe(false);
  });

  it("validates input", async () => {
    await expect(setChannelConfig(db, { channelId: 0n, label: "x" })).rejects.toThrow(/u64/);
    await expect(setChannelConfig(db, { channelId: 1n, label: "   " })).rejects.toThrow(/empty/);
    await expect(setChannelConfig(db, { channelId: 1n, label: "x".repeat(65) })).rejects.toThrow(
      /at most 64/,
    );
    await expect(setChannelConfig(db, { channelId: 1n, salt: "short" })).rejects.toThrow(/64 hex/);
  });
});
