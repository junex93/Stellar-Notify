import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deliveries, subscriptions } from "../db/schema.js";
import type { DecodedEvent } from "../ingest/decode.js";

/**
 * Routes by channel id only; never inspects the payload. Enqueues one delivery
 * per active target. Idempotent: re-routing the same event (cursor replay)
 * inserts nothing new.
 */
export async function route(db: Db, event: DecodedEvent): Promise<number> {
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
      })),
    )
    .onConflictDoNothing()
    .returning({ id: deliveries.id });
  return inserted.length;
}
