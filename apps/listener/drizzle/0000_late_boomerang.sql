CREATE TABLE "cursor" (
	"contract_id" text PRIMARY KEY NOT NULL,
	"ledger" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"ledger" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_event_subscription" ON "deliveries" USING btree ("event_id","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_channel_endpoint" ON "subscriptions" USING btree ("channel_id","endpoint");