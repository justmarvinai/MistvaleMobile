CREATE TABLE "arena_battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_id" uuid NOT NULL,
	"defender_id" uuid NOT NULL,
	"battle_id" uuid,
	"won" boolean NOT NULL,
	"attacker_rating_delta" integer DEFAULT 0 NOT NULL,
	"defender_rating_delta" integer DEFAULT 0 NOT NULL,
	"medals" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_state" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze_1' NOT NULL,
	"weekly_high" integer DEFAULT 0 NOT NULL,
	"tokens" smallint DEFAULT 10 NOT NULL,
	"tokens_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"defence_team" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offers_refreshed_at" timestamp with time zone,
	"refreshes_used" smallint DEFAULT 0 NOT NULL,
	"refresh_day" text,
	"last_weekly_claim" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_state_rating_check" CHECK ("arena_state"."rating" >= 0),
	CONSTRAINT "arena_state_tokens_check" CHECK ("arena_state"."tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hall_of_valor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"element" text NOT NULL,
	"stat" text NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hall_of_valor_level_check" CHECK ("hall_of_valor"."level" >= 0 and "hall_of_valor"."level" <= 10)
);
--> statement-breakpoint
ALTER TABLE "arena_battles" ADD CONSTRAINT "arena_battles_attacker_id_players_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_battles" ADD CONSTRAINT "arena_battles_defender_id_players_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_state" ADD CONSTRAINT "arena_state_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_of_valor" ADD CONSTRAINT "hall_of_valor_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_battles_attacker_idx" ON "arena_battles" USING btree ("attacker_id","created_at");--> statement-breakpoint
CREATE INDEX "arena_battles_defender_idx" ON "arena_battles" USING btree ("defender_id","created_at");--> statement-breakpoint
CREATE INDEX "arena_state_rating_idx" ON "arena_state" USING btree ("rating");--> statement-breakpoint
CREATE UNIQUE INDEX "hall_of_valor_track_key" ON "hall_of_valor" USING btree ("player_id","element","stat");