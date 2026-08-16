CREATE TABLE "battle_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"stage_key" text NOT NULL,
	"content_rev" integer NOT NULL,
	"seed" bigint NOT NULL,
	"state" jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"outcome" text,
	"last_action_id" text,
	"energy_spent" smallint DEFAULT 0 NOT NULL,
	"rewards" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "battle_sessions_status_check" CHECK ("battle_sessions"."status" in ('active', 'finished', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "player_champions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"champion_key" text NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"rank" smallint DEFAULT 1 NOT NULL,
	"ascension" smallint DEFAULT 0 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"favourite" boolean DEFAULT false NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_champions_level_check" CHECK ("player_champions"."level" >= 1 and "player_champions"."level" <= 60),
	CONSTRAINT "player_champions_rank_check" CHECK ("player_champions"."rank" >= 1 and "player_champions"."rank" <= 6),
	CONSTRAINT "player_champions_ascension_check" CHECK ("player_champions"."ascension" >= 0 and "player_champions"."ascension" <= 6),
	CONSTRAINT "player_champions_xp_check" CHECK ("player_champions"."xp" >= 0)
);
--> statement-breakpoint
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_champions" ADD CONSTRAINT "player_champions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "battle_sessions_active_key" ON "battle_sessions" USING btree ("player_id") WHERE "battle_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "battle_sessions_player_idx" ON "battle_sessions" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "player_champions_player_id_idx" ON "player_champions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_champions_key_idx" ON "player_champions" USING btree ("champion_key");