import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadCursor, saveCursor } from "./db/cursor.js";
import { type Db, connect, runMigrations } from "./db/index.js";
import { deliveries, subscriptions } from "./db/schema.js";
import { type DeliveryAdapter, PermanentDeliveryError } from "./delivery/types.js";
import { processDue } from "./delivery/worker.js";
import type { DecodedEvent, RawEvent } from "./ingest/decode.js";
import { EnvelopeLoader, type EventSource, ingestOnce } from "./ingest/index.js";
import { route } from "./router/index.js";

const url = process.env.DATABASE_URL;
// These tests truncate tables: only ever run them against a throwaway database.
const safe = url !== undefined && /\/(notify|[\w-]+_test)$/.test(url);

const message = (id: string, channelId = 1n): DecodedEvent => ({
  kind: "message",
  channelId,
  ledger: 100,
  txHash: "ff",
  eventId: id,
  publishedAt: "2026-01-01T00:00:00Z",
  publisher: "GABC",
  payload: Uint8Array.from([1]),
});

describe.skipIf(!safe)("listener pipeline (Postgres)", () => {
  let db: Db;
  const loaderFor = (events: DecodedEvent[]) => {
    const loader = new EnvelopeLoader({ loadEvent: async () => null });
    return { loader, events };
  };

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

  const addTarget = async (channelId: bigint, kind = "webhook", active = true) => {
    const [row] = await db
      .insert(subscriptions)
      .values({
        channelId,
        kind,
        endpoint: `https://x.test/${channelId}/${kind}/${Math.random()}`,
        active,
      })
      .returning();
    return row as typeof subscriptions.$inferSelect;
  };

  it("stores and updates the ledger cursor", async () => {
    expect(await loadCursor(db, "C1")).toBeNull();
    await saveCursor(db, "C1", 10);
    await saveCursor(db, "C1", 20);
    expect(await loadCursor(db, "C1")).toBe(20);
  });

  it("routes by channel to active targets only, and replays are idempotent", async () => {
    await addTarget(1n);
    await addTarget(1n, "ntfy");
    await addTarget(1n, "webhook", false);
    await addTarget(2n);

    expect(await route(db, message("e1"))).toBe(2);
    expect(await route(db, message("e1"))).toBe(0);
    expect(await db.select().from(deliveries)).toHaveLength(2);
  });

  const adapter = (deliver: DeliveryAdapter["deliver"]): DeliveryAdapter => ({
    kind: "webhook",
    deliver,
  });

  async function seed() {
    const target = await addTarget(1n);
    await route(db, message("e1"));
    // Postgres stamps microseconds, the worker compares against a millisecond clock:
    // backdate so the row is always due and the test never races the same millisecond.
    await db.execute(sql`update deliveries set next_attempt_at = now() - interval '1 minute'`);
    const { loader } = loaderFor([]);
    loader.remember({
      v: 1,
      type: "message",
      eventId: "e1",
      channelId: "1",
      publisher: "GABC",
      payload: "AQ==",
      ledger: 100,
      txHash: "ff",
      publishedAt: "t",
    });
    return { target, loader };
  }

  it("delivers once and never again", async () => {
    const { loader } = await seed();
    const sent: string[] = [];
    const a = adapter(async (_t, m) => {
      sent.push(m.eventId);
    });
    expect(await processDue(db, [a], loader)).toEqual({ sent: 1, retried: 0, dead: 0 });
    expect(await processDue(db, [a], loader)).toEqual({ sent: 0, retried: 0, dead: 0 });
    expect(sent).toEqual(["e1"]);
    const [row] = await db.select().from(deliveries);
    expect(row).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("retries with backoff, then dead-letters after the max attempts", async () => {
    const { loader } = await seed();
    const a = adapter(async () => {
      throw new Error("boom");
    });
    let now = new Date(Date.now() + 1000);
    const opts = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 60_000, now: () => now };

    expect(await processDue(db, [a], loader, opts)).toMatchObject({ retried: 1, dead: 0 });
    // Not due yet: nothing happens until the backoff elapses.
    expect(await processDue(db, [a], loader, opts)).toEqual({ sent: 0, retried: 0, dead: 0 });
    now = new Date(now.getTime() + 1001);
    expect(await processDue(db, [a], loader, opts)).toMatchObject({ retried: 1, dead: 0 });
    now = new Date(now.getTime() + 2001);
    expect(await processDue(db, [a], loader, opts)).toMatchObject({ retried: 0, dead: 1 });

    const [row] = await db.select().from(deliveries);
    expect(row).toMatchObject({ status: "dead", attempts: 3, lastError: "boom" });
  });

  it("dead-letters immediately on a permanent error", async () => {
    const { loader } = await seed();
    const a = adapter(async () => {
      throw new PermanentDeliveryError("gone");
    });
    expect(await processDue(db, [a], loader)).toMatchObject({ dead: 1, retried: 0 });
  });

  it("dead-letters when the target is inactive or the event is gone", async () => {
    const { target, loader } = await seed();
    await db.update(subscriptions).set({ active: false }).where(eq(subscriptions.id, target.id));
    const a = adapter(async () => {});
    expect(await processDue(db, [a], loader)).toMatchObject({ dead: 1 });

    await db.execute(sql`truncate deliveries, subscriptions restart identity cascade`);
    await addTarget(1n);
    await route(db, message("missing"));
    expect(
      await processDue(db, [a], new EnvelopeLoader({ loadEvent: async () => null })),
    ).toMatchObject({
      dead: 1,
    });
  });

  it("ingestOnce routes decoded events, advances the cursor and tolerates replays", async () => {
    await addTarget(5n);
    const { Address, Keypair, nativeToScVal, xdr } = await import("@stellar/stellar-sdk");
    const sym = (s: string) => xdr.ScVal.scvSymbol(s);
    const raw: RawEvent = {
      id: "ev-1",
      ledger: 50,
      ledgerClosedAt: "2026-01-01T00:00:00Z",
      txHash: "aa",
      topic: [sym("msg"), nativeToScVal(5n, { type: "u64" })],
      value: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: sym("payload"), val: xdr.ScVal.scvBytes(Buffer.from("hi")) }),
        new xdr.ScMapEntry({
          key: sym("publisher"),
          val: new Address(Keypair.random().publicKey()).toScVal(),
        }),
      ]),
    };
    const ignored: RawEvent = {
      ...raw,
      id: "ev-2",
      topic: [sym("created"), raw.topic[1] as never],
    };
    const fetched: number[] = [];
    const source: EventSource = {
      tip: async () => 40,
      fetch: async (from) => {
        fetched.push(from);
        return { events: [raw, ignored], nextLedger: 60 };
      },
    };
    const loader = new EnvelopeLoader({ loadEvent: async () => null });
    const deps = { db, source, contractId: "C1", loader };

    expect(await ingestOnce(deps)).toEqual({ events: 1, queued: 1 });
    expect(await loadCursor(db, "C1")).toBe(60);
    // Second poll resumes from the stored cursor; the replayed event adds nothing.
    expect(await ingestOnce(deps)).toEqual({ events: 1, queued: 0 });
    expect(fetched).toEqual([40, 60]);
    expect(await db.select().from(deliveries)).toHaveLength(1);
  });
});
