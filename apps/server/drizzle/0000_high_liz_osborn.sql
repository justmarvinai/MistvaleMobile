CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_name" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"rank" text DEFAULT 'player' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ban_reason" text,
	"force_password_change" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_rank_check" CHECK ("accounts"."rank" in ('player', 'gamemaster', 'admin')),
	CONSTRAINT "accounts_status_check" CHECK ("accounts"."status" in ('active', 'banned'))
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"profile_name" "citext" NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"energy" smallint DEFAULT 20 NOT NULL,
	"energy_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"silver" bigint DEFAULT 0 NOT NULL,
	"crystals" bigint DEFAULT 0 NOT NULL,
	"valor_medals" bigint DEFAULT 0 NOT NULL,
	"roster_capacity" smallint DEFAULT 60 NOT NULL,
	"tutorial_step" smallint DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{"musicVolume":0.5,"sfxVolume":0.8,"battleSpeed":1,"reducedMotion":false,"colorblindGlyphs":false,"fastResults":false}'::jsonb NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"last_daily_reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_level_check" CHECK ("players"."level" >= 1 and "players"."level" <= 60),
	CONSTRAINT "players_energy_check" CHECK ("players"."energy" >= 0),
	CONSTRAINT "players_currency_check" CHECK ("players"."silver" >= 0 and "players"."crystals" >= 0 and "players"."valor_medals" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source" text NOT NULL,
	"deltas" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_log" ADD CONSTRAINT "economy_log_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_account_name_key" ON "accounts" USING btree ("account_name");--> statement-breakpoint
CREATE INDEX "accounts_rank_idx" ON "accounts" USING btree ("rank");--> statement-breakpoint
CREATE UNIQUE INDEX "players_account_id_key" ON "players" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_profile_name_key" ON "players" USING btree ("profile_name");--> statement-breakpoint
CREATE INDEX "players_is_bot_idx" ON "players" USING btree ("is_bot");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_account_id_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_account_id_idx" ON "audit_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "economy_log_player_id_idx" ON "economy_log" USING btree ("player_id","created_at");--> statement-breakpoint
CREATE INDEX "economy_log_created_at_idx" ON "economy_log" USING btree ("created_at");