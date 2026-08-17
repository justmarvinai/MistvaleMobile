ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "player_missions" ADD COLUMN "claim_action_id" text;--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop', 'mastery', 'quest', 'mission', 'gameConfig'));