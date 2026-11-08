CREATE TABLE "present_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"furthest" integer NOT NULL,
	"total" integer NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "present_views_range" CHECK ("present_views"."furthest" between 1 and "present_views"."total")
);
--> statement-breakpoint
ALTER TABLE "present_views" ADD CONSTRAINT "present_views_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "present_views_document_viewed_idx" ON "present_views" USING btree ("document_id","viewed_at");--> statement-breakpoint
CREATE INDEX "present_views_viewed_at_idx" ON "present_views" USING btree ("viewed_at");