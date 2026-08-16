CREATE TABLE "chapter_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"chapter_key" text NOT NULL,
	"claimed_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"parent_key" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'campaign' NOT NULL,
	"stars" smallint DEFAULT 0 NOT NULL,
	"clears" integer DEFAULT 0 NOT NULL,
	"best_turns" smallint,
	"first_cleared_at" timestamp with time zone,
	"last_cleared_at" timestamp with time zone,
	CONSTRAINT "stage_progress_stars_check" CHECK ("stage_progress"."stars" >= 0 and "stage_progress"."stars" <= 3)
);
--> statement-breakpoint
ALTER TABLE "chapter_rewards" ADD CONSTRAINT "chapter_rewards_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_progress" ADD CONSTRAINT "stage_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_rewards_player_chapter_key" ON "chapter_rewards" USING btree ("player_id","chapter_key");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_progress_player_stage_key" ON "stage_progress" USING btree ("player_id","stage_key");--> statement-breakpoint
CREATE INDEX "stage_progress_parent_idx" ON "stage_progress" USING btree ("player_id","parent_key");