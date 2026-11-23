ALTER TABLE "ec_group_settings" ADD COLUMN "times" text[] DEFAULT '{21:00}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "ec_group_settings" SET "times" = ARRAY["time"];--> statement-breakpoint
ALTER TABLE "ec_group_settings" DROP COLUMN "time";
