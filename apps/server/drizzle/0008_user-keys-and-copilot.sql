-- No release ever wrote user_keys (the old iv/auth_tag layout had no writer); rows of that layout could never be
-- decrypted by the new code, so the table is cleared before the NOT NULL nonce column is added.
DELETE FROM "user_keys";--> statement-breakpoint
CREATE TYPE "public"."copilot_task" AS ENUM('answer', 'explain', 'summarize');--> statement-breakpoint
CREATE TYPE "public"."user_key_status" AS ENUM('ok', 'invalid', 'quota', 'unreadable');--> statement-breakpoint
CREATE TABLE "copilot_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task" "copilot_task" DEFAULT 'answer' NOT NULL,
	"question" text NOT NULL,
	"selection" text,
	"scope" jsonb NOT NULL,
	"answer" text NOT NULL,
	"sources" jsonb NOT NULL,
	"citations" jsonb,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_key_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "nonce" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "status" "user_key_status" DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "copilot_questions" ADD CONSTRAINT "copilot_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key_prefs" ADD CONSTRAINT "user_key_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copilot_questions_user_id_created_at_idx" ON "copilot_questions" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "user_keys" DROP COLUMN "iv";--> statement-breakpoint
ALTER TABLE "user_keys" DROP COLUMN "auth_tag";