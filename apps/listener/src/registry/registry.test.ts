import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db, connect, runMigrations } from "../db/index.js";
import { listTargets, registerTarget, removeTarget, validateTarget } from "./index.js";

describe("validateTarget", () => {
  const ok = { channelId: 1n, kind: "webhook" as const, endpoint: "https://x.test/hook" };

  it("accepts well-formed targets", () => {
    expect(() => validateTarget(ok)).not.toThrow();
    expect(() =>
      validateTarget({ ...ok, kind: "ntfy", endpoint: "https://ntfy.sh/t" }),
    ).not.toThrow();
    expect(() => validateTarget({ ...ok, kind: "telegram", endpoint: "-1001234" })).not.toThrow();
    expect(() => validateTarget({ ...ok, kind: "telegram", endpoint: "@mychannel" })).not.toThrow();
  });

  it("rejects what no adapter could deliver to", () => {
    expect(() => validateTarget({ ...ok, channelId: 0n })).toThrow(/u64/);
    expect(() => validateTarget({ ...ok, channelId: 2n ** 64n })).toThrow(/u64/);
    expect(() => validateTarget({ ...ok, endpoint: "ftp://x.test" })).toThrow(/http/);
    expect(() => validateTarget({ ...ok, endpoint: "https://u:p@x.test" })).toThrow(/credentials/);
    expect(() => validateTarget({ ...ok, endpoint: "nope" })).toThrow(/URL/);
    expect(() => validateTarget({ ...ok, kind: "ntfy", endpoint: "https://ntfy.sh/" })).toThrow(
      /topic/,
    );
    expect(() => validateTarget({ ...ok, kind: "telegram", endpoint: "abc" })).toThrow(/chat id/);
    expect(() => validateTarget({ ...ok, kind: "webpush" as never })).toThrow(
      /unknown target kind/,
    );
  });
});

const url = process.env.DATABASE_URL;
const safe = url !== undefined && /\/(notify|[\w-]+_test)$/.test(url);

describe.skipIf(!safe)("target registry (Postgres)", () => {
  let db: Db;
  beforeAll(async () => {
    db = connect(url as string);
    await runMigrations(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });
  beforeEach(async () => {
    await db.execute(sql`truncate deliveries, subscriptions, cursor restart identity cascade`);
  });

  it("registers, lists per channel and removes", async () => {
    await registerTarget(db, { channelId: 1n, kind: "webhook", endpoint: "https://x.test/a" });
    await registerTarget(db, { channelId: 2n, kind: "ntfy", endpoint: "https://ntfy.sh/t" });
    expect(await listTargets(db)).toHaveLength(2);
    expect((await listTargets(db, 1n)).map((t) => t.kind)).toEqual(["webhook"]);
    expect(await removeTarget(db, 1n, "https://x.test/a")).toBe(true);
    expect(await removeTarget(db, 1n, "https://x.test/a")).toBe(false);
    expect(await listTargets(db, 1n)).toEqual([]);
  });

  it("re-registering updates keys and reactivates a dead target", async () => {
    const first = await registerTarget(db, {
      channelId: 1n,
      kind: "webhook",
      endpoint: "https://x.test/a",
      keys: "old",
    });
    await db.execute(sql`update subscriptions set active = false`);
    const again = await registerTarget(db, {
      channelId: 1n,
      kind: "webhook",
      endpoint: "https://x.test/a",
      keys: "new",
    });
    expect(again.id).toBe(first.id);
    expect(again.keys).toBe("new");
    expect(again.active).toBe(true);
    expect(await listTargets(db)).toHaveLength(1);
  });

  it("does not persist invalid targets", async () => {
    await expect(
      registerTarget(db, { channelId: 1n, kind: "ntfy", endpoint: "https://ntfy.sh/" }),
    ).rejects.toThrow();
    expect(await listTargets(db)).toEqual([]);
  });
});
