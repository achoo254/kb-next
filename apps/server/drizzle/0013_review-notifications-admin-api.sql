CREATE TABLE "admin_api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"error" text,
	"document_id" uuid,
	"document_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_tokens" ADD COLUMN "last4" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_api_calls" ADD CONSTRAINT "admin_api_calls_token_id_admin_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."admin_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_api_calls" ADD CONSTRAINT "admin_api_calls_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_api_calls_created_at_idx" ON "admin_api_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;