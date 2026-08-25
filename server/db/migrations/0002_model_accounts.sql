CREATE TABLE "model_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"account_id" text,
	"email" text,
	"plan" text,
	"access_token" text,
	"refresh_token" text,
	"expires_at" bigint,
	"api_key" text,
	"model" text,
	"connected_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "from_user_id" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "from_user_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "queued_by_user_id" text;