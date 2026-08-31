CREATE TABLE "github_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"canvas_id" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"token" text NOT NULL,
	"deploy_url" text,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_synced_at" bigint
);
--> statement-breakpoint
CREATE INDEX "github_connections_canvas_idx" ON "github_connections" USING btree ("canvas_id");