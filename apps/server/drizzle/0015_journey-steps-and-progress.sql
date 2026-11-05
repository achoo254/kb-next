CREATE TYPE "public"."journey_step_kind" AS ENUM('read', 'lab', 'quiz', 'note');--> statement-breakpoint
ALTER TABLE "journey_steps" DROP CONSTRAINT "journey_steps_journey_id_journeys_id_fk";--> statement-breakpoint
DELETE FROM "journey_steps";--> statement-breakpoint
DROP TABLE "journeys";--> statement-breakpoint
ALTER TABLE "journey_steps" ADD COLUMN "kind" "journey_step_kind" DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD COLUMN "minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_journey_id_documents_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_steps_document_id_idx" ON "journey_steps" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "journey_steps" ADD CONSTRAINT "journey_steps_minutes_range" CHECK ("journey_steps"."minutes" between 1 and 240);--> statement-breakpoint
CREATE TABLE "journey_progress" (
	"user_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	CONSTRAINT "journey_progress_user_id_step_id_pk" PRIMARY KEY("user_id","step_id")
);
--> statement-breakpoint
ALTER TABLE "journey_progress" ADD CONSTRAINT "journey_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_progress" ADD CONSTRAINT "journey_progress_step_id_journey_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."journey_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journey_progress_step_id_idx" ON "journey_progress" USING btree ("step_id");
