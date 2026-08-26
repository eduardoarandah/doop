CREATE TABLE "sync_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"canvas_id" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint
);
--> statement-breakpoint
CREATE INDEX "sync_keys_canvas_idx" ON "sync_keys" USING btree ("canvas_id");--> statement-breakpoint
CREATE INDEX "sync_keys_secret_idx" ON "sync_keys" USING btree ("secret");