CREATE TABLE "ec_group_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"time" text DEFAULT '21:00' NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ec_group_settings_single_row" CHECK ("ec_group_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "ec_reminder_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"status" text DEFAULT 'sending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ec_reminder_log_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "ec_reminder_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"whatsapp_number" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"times" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ec_reminder_log" ADD CONSTRAINT "ec_reminder_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ec_reminder_settings" ADD CONSTRAINT "ec_reminder_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ec_reminder_log_user_idx" ON "ec_reminder_log" USING btree ("user_id","created_at");