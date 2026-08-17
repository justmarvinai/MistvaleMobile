CREATE TABLE "login_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"track" text NOT NULL,
	"day" smallint NOT NULL,
	"claimed_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"claimed_milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_events_points_check" CHECK ("player_events"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"mission_key" text NOT NULL,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"quest_key" text NOT NULL,
	"period_anchor" text NOT NULL,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_claims" ADD CONSTRAINT "login_claims_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_missions" ADD CONSTRAINT "player_missions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "login_claims_day_key" ON "login_claims" USING btree ("player_id","track","claimed_on");--> statement-breakpoint
CREATE INDEX "login_claims_player_idx" ON "login_claims" USING btree ("player_id","track");--> statement-breakpoint
CREATE UNIQUE INDEX "player_events_key" ON "player_events" USING btree ("player_id","event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "player_missions_key" ON "player_missions" USING btree ("player_id","mission_key");--> statement-breakpoint
CREATE INDEX "player_missions_player_idx" ON "player_missions" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_quests_instance_key" ON "player_quests" USING btree ("player_id","quest_key","period_anchor");--> statement-breakpoint
CREATE INDEX "player_quests_period_idx" ON "player_quests" USING btree ("player_id","period_anchor");