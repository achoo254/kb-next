CREATE TYPE "public"."caption_source" AS ENUM('jev', 'fallback');--> statement-breakpoint
CREATE TABLE "space_captions" (
	"space_id" uuid NOT NULL,
	"signature" text NOT NULL,
	"caption_vi" text NOT NULL,
	"caption_en" text NOT NULL,
	"source" "caption_source" NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"retry_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_captions_space_id_signature_pk" PRIMARY KEY("space_id","signature")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "interests" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "space_captions" ADD CONSTRAINT "space_captions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;