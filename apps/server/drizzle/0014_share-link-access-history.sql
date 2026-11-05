CREATE TYPE "public"."share_link_access" AS ENUM('view', 'remix');--> statement-breakpoint
CREATE TYPE "public"."share_link_event" AS ENUM('opened', 'created', 'changed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."share_link_expiry" AS ENUM('none', '7d', '30d');--> statement-breakpoint
ALTER TABLE "share_link_visits" ADD COLUMN "kind" "share_link_event" DEFAULT 'opened' NOT NULL;--> statement-breakpoint
ALTER TABLE "share_link_visits" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "last4" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "access" "share_link_access" DEFAULT 'view' NOT NULL;--> statement-breakpoint
ALTER TABLE "share_links" ADD COLUMN "expiry" "share_link_expiry" DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE INDEX "share_link_visits_opened_at_idx" ON "share_link_visits" USING btree ("visited_at") WHERE "share_link_visits"."kind" = 'opened';--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_one_live_idx" ON "share_links" USING btree ("document_id") WHERE "share_links"."revoked_at" is null;