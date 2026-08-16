CREATE TABLE "champion_sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"champion_key" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summon_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"pool_key" text NOT NULL,
	"sigil_item_key" text NOT NULL,
	"champion_key" text NOT NULL,
	"rarity" text NOT NULL,
	"from_mercy" boolean DEFAULT false NOT NULL,
	"pity_after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_rev" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "summon_pity" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "champion_sightings" ADD CONSTRAINT "champion_sightings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summon_history" ADD CONSTRAINT "summon_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "champion_sightings_player_champion_key" ON "champion_sightings" USING btree ("player_id","champion_key");--> statement-breakpoint
CREATE INDEX "summon_history_player_idx" ON "summon_history" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "summon_history_champion_idx" ON "summon_history" USING btree ("champion_key");--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'stage', 'summonPool', 'shop', 'gameConfig'));