ALTER TYPE "public"."caption_source" ADD VALUE 'seed';--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"progress" integer NOT NULL,
	"anchor" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_document_id_pk" PRIMARY KEY("user_id","document_id"),
	CONSTRAINT "reading_progress_range" CHECK ("reading_progress"."progress" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_progress_document_id_idx" ON "reading_progress" USING btree ("document_id");