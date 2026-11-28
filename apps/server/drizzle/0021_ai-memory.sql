CREATE TABLE "memory_undos" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_version" integer,
	"written_version" integer NOT NULL,
	"line" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "memory_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "memory_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_undos" ADD CONSTRAINT "memory_undos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_undos" ADD CONSTRAINT "memory_undos_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_undos_expires_at_idx" ON "memory_undos" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_space_purpose_unique" ON "collections" USING btree ("space_id","purpose") WHERE "collections"."purpose" is not null;