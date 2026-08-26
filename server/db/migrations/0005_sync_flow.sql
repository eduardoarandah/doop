CREATE TABLE "sync_edges" (
	"key_id" text NOT NULL,
	"from_page" text NOT NULL,
	"to_page" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_at" bigint NOT NULL,
	CONSTRAINT "sync_edges_key_id_from_page_to_page_pk" PRIMARY KEY("key_id","from_page","to_page")
);
--> statement-breakpoint
CREATE TABLE "sync_links" (
	"key_id" text NOT NULL,
	"page" text NOT NULL,
	"to_page" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE INDEX "sync_links_page_idx" ON "sync_links" USING btree ("key_id","page");