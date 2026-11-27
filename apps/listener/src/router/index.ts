import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deliveries, subscriptions } from "../db/schema.js";
import type { DecodedEvent } from "../ingest/decode.js";

/**
 * Routes by channel id only; never inspects the payload. Enqueues one delivery
 * per active target. Idempotent: re-routing the same event (cursor replay)
 * inserts nothing new.
 *
 * `next_attempt_at` is written from the application clock, the same one the worker
 * compares against: the database default has microsecond precision, so a worker running in
 * the same millisecond would find a brand-new delivery not yet due.
 */
export async function route(db: Db, event: DecodedEvent, now = new Date()): Promise<number> {
  const targets = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.channelId, event.channelId), eq(subscriptions.active, true)));
  if (targets.length === 0) return 0;
  const inserted = await db
    .insert(deliveries)
    .values(
      targets.map((t) => ({
        eventId: event.eventId,
        ledger: event.ledger,
        subscriptionId: t.id,
        nextAttemptAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: deliveries.id });
  return inserted.length;
}
