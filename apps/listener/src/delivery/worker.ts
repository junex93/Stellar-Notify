import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { deliveries, subscriptions } from "../db/schema.js";
import type { EnvelopeLoader } from "../ingest/index.js";
import { log } from "../log.js";
import {
  type DeliveryAdapter,
  PermanentDeliveryError,
  RetryAfterError,
  TargetGoneError,
} from "./types.js";

export interface WorkerOptions {
  maxAttempts: number;
  batchSize: number;
  /** A claimed delivery is retried after this long if the worker dies mid-send. */
  leaseMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  now: () => Date;
}

export const DEFAULT_WORKER_OPTIONS: WorkerOptions = {
  maxAttempts: 8,
  batchSize: 25,
  leaseMs: 60_000,
  baseDelayMs: 30_000,
  maxDelayMs: 3_600_000,
  now: () => new Date(),
};

/** Exponential backoff: base, 2x base, 4x base ... capped. `attempt` is 1-based. */
export function backoffMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

export interface WorkerResult {
  sent: number;
  retried: number;
  dead: number;
}

/** Sends every due delivery once. Dedupe is the (event, target) unique row. */
export async function processDue(
  db: Db,
  adapters: DeliveryAdapter[],
  loader: EnvelopeLoader,
  overrides: Partial<WorkerOptions> = {},
): Promise<WorkerResult> {
  const opts = { ...DEFAULT_WORKER_OPTIONS, ...overrides };
  const result: WorkerResult = { sent: 0, retried: 0, dead: 0 };
  const now = opts.now();
  const due = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.status, "pending"), lte(deliveries.nextAttemptAt, now)))
    .orderBy(asc(deliveries.id))
    .limit(opts.batchSize);

  for (const { id } of due) {
    // Claim with a lease so concurrent workers never send the same row.
    const [row] = await db
      .update(deliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + opts.leaseMs) })
      .where(
        and(
          eq(deliveries.id, id),
          eq(deliveries.status, "pending"),
          lte(deliveries.nextAttemptAt, now),
        ),
      )
      .returning();
    if (!row) continue;

    const kill = async (reason: string) => {
      await db
        .update(deliveries)
        .set({ status: "dead", lastError: reason, attempts: row.attempts + 1 })
        .where(eq(deliveries.id, id));
      result.dead++;
      log("error", "delivery dead-lettered", { deliveryId: id, eventId: row.eventId, reason });
    };

    const [target] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, row.subscriptionId));
    if (!target?.active) {
      await kill("target inactive");
      continue;
    }
    const adapter = adapters.find((a) => a.kind === target.kind);
    if (!adapter) {
      await kill(`no adapter for ${target.kind}`);
      continue;
    }

    try {
      const envelope = await loader.load(row.ledger, row.eventId);
      if (!envelope) {
        await kill("event no longer available");
        continue;
      }
      await adapter.deliver({ endpoint: target.endpoint, keys: target.keys }, envelope);
      await db
        .update(deliveries)
        .set({ status: "sent", sentAt: opts.now(), attempts: row.attempts + 1, lastError: null })
        .where(eq(deliveries.id, id));
      result.sent++;
      log("info", "delivered", { deliveryId: id, eventId: row.eventId, kind: target.kind });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      if (err instanceof TargetGoneError) {
        await db
          .update(subscriptions)
          .set({ active: false })
          .where(eq(subscriptions.id, target.id));
        log("warn", "target deactivated", { subscriptionId: target.id, kind: target.kind });
      }
      if (err instanceof PermanentDeliveryError || attempts >= opts.maxAttempts) {
        await kill(reason);
        continue;
      }
      await db
        .update(deliveries)
        .set({
          attempts,
          lastError: reason,
          nextAttemptAt: new Date(
            opts.now().getTime() +
              Math.max(
                backoffMs(attempts, opts.baseDelayMs, opts.maxDelayMs),
                err instanceof RetryAfterError ? err.retryAfterMs : 0,
              ),
          ),
        })
        .where(eq(deliveries.id, id));
      result.retried++;
      log("warn", "delivery failed, will retry", {
        deliveryId: id,
        eventId: row.eventId,
        attempts,
        reason,
      });
    }
  }
  return result;
}
