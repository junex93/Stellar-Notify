CREATE TABLE "bot_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_config" (
	"channel_id" bigint PRIMARY KEY NOT NULL,
	"label" text,
	"salt" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_challenges" (
	"chat_id" bigint NOT NULL,
	"channel_id" bigint NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "proof_challenges_chat_id_channel_id_pk" PRIMARY KEY("chat_id","channel_id")
);
