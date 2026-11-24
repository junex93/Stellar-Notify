import {
  bigint,
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
    kind: text("kind").notNull(), // webpush | webhook | ntfy
    endpoint: text("endpoint").notNull(),
    keys: text("keys"), // JSON for Web Push p256dh/auth
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("subscriptions_channel_endpoint").on(t.channelId, t.endpoint)],
);
