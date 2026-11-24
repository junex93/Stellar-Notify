import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Last ledger processed per contract, so ingestion resumes after restarts. */
export const cursor = pgTable("cursor", {
  contractId: text("contract_id").primaryKey(),
  ledger: integer("ledger").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Which device follows which channel. Device tokens never go on-chain. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    channelId: bigint("channel_id", { mode: "bigint" }).notNull(),
    kind: text("kind").notNull(), // webhook | ntfy | telegram | webpush
    endpoint: text("endpoint").notNull(),
    keys: text("keys"), // webhook: optional HMAC secret; webpush: JSON p256dh/auth
    /** False once a target is known dead (e.g. the user blocked the bot). */
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("subscriptions_channel_endpoint").on(t.channelId, t.endpoint)],
);

/**
 * One row per (event, target). Holds only references: the listener never
 * stores message content, so retries re-load the event from RPC by ledger.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    ledger: integer("ledger").notNull(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | sent | dead
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => [uniqueIndex("deliveries_event_subscription").on(t.eventId, t.subscriptionId)],
);
