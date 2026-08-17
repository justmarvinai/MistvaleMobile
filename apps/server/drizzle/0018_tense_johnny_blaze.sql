ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
DROP INDEX "player_events_key";--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN "occurrence" text NOT NULL;--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN "claim_action_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "player_events_key" ON "player_events" USING btree ("player_id","event_key","occurrence");--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop', 'mastery', 'quest', 'mission', 'event', 'gameConfig'));