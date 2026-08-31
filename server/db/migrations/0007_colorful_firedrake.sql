ALTER TABLE "github_connections" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "github_connections" ADD COLUMN "installation_id" text;