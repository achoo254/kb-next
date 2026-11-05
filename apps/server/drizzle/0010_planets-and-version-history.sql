CREATE TYPE "public"."version_via" AS ENUM('editor', 'api', 'import', 'restore', 'translation');--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "via" "version_via" DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "ai_made" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "restored_from" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "planet" text;--> statement-breakpoint
CREATE INDEX "documents_deleted_at_idx" ON "documents" USING btree ("deleted_at") WHERE "documents"."deleted_at" is not null;--> statement-breakpoint
-- Versions saved before this migration: their last save is when they were made; imported texts and AI translations
-- say how they came to be.
UPDATE "document_versions" SET "updated_at" = "created_at";--> statement-breakpoint
UPDATE "document_versions" SET "via" = 'import' WHERE "editor_id" IN (SELECT "id" FROM "users" WHERE "sub" = 'system:hoc-cloud');--> statement-breakpoint
UPDATE "document_versions" SET "via" = 'translation', "ai_made" = true WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "ai_translated");
