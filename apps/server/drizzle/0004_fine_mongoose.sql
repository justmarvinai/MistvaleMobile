CREATE TABLE "gear_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"set_key" text NOT NULL,
	"slot" text NOT NULL,
	"rank" smallint NOT NULL,
	"rarity" text NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"main_stat" jsonb NOT NULL,
	"substats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipped_champion_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gear_instances_rank_check" CHECK ("gear_instances"."rank" >= 1 and "gear_instances"."rank" <= 6),
	CONSTRAINT "gear_instances_level_check" CHECK ("gear_instances"."level" >= 0 and "gear_instances"."level" <= 16)
);
--> statement-breakpoint
CREATE TABLE "player_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_items_quantity_check" CHECK ("player_items"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shop_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"shop_key" text NOT NULL,
	"restocks_at" timestamp with time zone NOT NULL,
	"unlocked_slots" smallint DEFAULT 0 NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_counts_on" text DEFAULT '' NOT NULL,
	"seed" bigint DEFAULT 0 NOT NULL,
	"content_rev" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_entries" DROP CONSTRAINT "content_entries_type_check";--> statement-breakpoint
ALTER TABLE "gear_instances" ADD CONSTRAINT "gear_instances_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gear_instances" ADD CONSTRAINT "gear_instances_equipped_champion_id_player_champions_id_fk" FOREIGN KEY ("equipped_champion_id") REFERENCES "public"."player_champions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_items" ADD CONSTRAINT "player_items_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_states" ADD CONSTRAINT "shop_states_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gear_instances_player_idx" ON "gear_instances" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "gear_instances_equipped_idx" ON "gear_instances" USING btree ("equipped_champion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gear_instances_slot_key" ON "gear_instances" USING btree ("equipped_champion_id","slot") WHERE "gear_instances"."equipped_champion_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "player_items_player_item_key" ON "player_items" USING btree ("player_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_states_player_shop_key" ON "shop_states" USING btree ("player_id","shop_key");--> statement-breakpoint
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK ("content_entries"."content_type" in ('faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot', 'gearStat', 'item', 'campaignChapter', 'stage', 'shop', 'gameConfig'));