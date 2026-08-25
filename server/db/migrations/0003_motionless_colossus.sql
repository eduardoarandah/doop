ALTER TABLE "frames" ADD COLUMN "demo" boolean;--> statement-breakpoint
UPDATE "frames" SET "demo" = true WHERE ("name" = 'Welcome to Doop' AND "updated_by" = 'Doop') OR "updated_by" = 'seed';
