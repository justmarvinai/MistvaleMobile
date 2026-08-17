ALTER TABLE "players" ADD COLUMN "last_multi_battle" jsonb;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "daily_counters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "daily_counters_day" text;