CREATE TABLE "jev_usage_daily" (
	"day" date NOT NULL,
	"purpose" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"failed_calls" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "jev_usage_daily_day_purpose_pk" PRIMARY KEY("day","purpose")
);
