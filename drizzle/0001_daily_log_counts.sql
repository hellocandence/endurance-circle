ALTER TABLE "daily_logs" ADD COLUMN "done_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "required_count" integer DEFAULT 0 NOT NULL;