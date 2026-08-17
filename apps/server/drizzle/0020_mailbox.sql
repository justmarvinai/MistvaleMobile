CREATE TABLE "mailbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sent_by" text DEFAULT 'system' NOT NULL,
	"batch_id" uuid,
	"read_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"claim_action_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
ALTER TABLE "mailbox" ADD CONSTRAINT "mailbox_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailbox_player_idx" ON "mailbox" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "mailbox_batch_idx" ON "mailbox" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop', 'mastery', 'quest', 'mission', 'event', 'loginTrack', 'newsPost', 'gameConfig'));