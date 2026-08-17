ALTER TABLE "players" ADD COLUMN "chest_claims" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_quests" ADD COLUMN "claim_action_id" text;