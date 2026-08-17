ALTER TABLE "arena_state" ADD COLUMN "pending_chest_week" text;--> statement-breakpoint
ALTER TABLE "arena_state" ADD COLUMN "pending_chest_high" integer DEFAULT 0 NOT NULL;