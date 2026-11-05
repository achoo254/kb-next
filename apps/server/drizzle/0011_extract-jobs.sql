CREATE TYPE "public"."extract_status" AS ENUM('queued', 'running', 'waiting', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "extract_jobs" (
	"file_id" uuid PRIMARY KEY NOT NULL,
	"status" "extract_status" DEFAULT 'queued' NOT NULL,
	"steps" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_hint" text,
	"suggestions" jsonb,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "extract_jobs" ADD CONSTRAINT "extract_jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extract_jobs_status_idx" ON "extract_jobs" USING btree ("status","created_at");