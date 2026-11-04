ALTER TABLE "documents" ALTER COLUMN "origin" SET DATA TYPE text;--> statement-breakpoint
-- Only one official origin remains: AI-made official documents become plain official ones.
UPDATE "documents" SET "origin" = 'official' WHERE "origin" = 'official_ai';--> statement-breakpoint
DROP TYPE "public"."document_origin";--> statement-breakpoint
CREATE TYPE "public"."document_origin" AS ENUM('official', 'community', 'own');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "origin" SET DATA TYPE "public"."document_origin" USING "origin"::"public"."document_origin";