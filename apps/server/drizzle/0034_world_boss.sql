-- The Wurm Wakes (C10e).
--
-- Two tables, and the first is unlike anything else in the schema: `world_boss_wakes` is
-- **shared**. Every other row in this database belongs to one account; this one belongs to
-- the server, and every warden's damage comes off the same number.
--
-- `damage_taken` counts up rather than `hp_remaining` counting down, deliberately. A strike
-- is then a single atomic `damage_taken = damage_taken + $1` with no read-modify-write, no
-- clamp, and no lock held across a battle — which is what makes one shared row safe on a
-- one-core box with no Redis. Whether it has fallen is that number against `max_hp`, read
-- rather than stored.

CREATE TABLE IF NOT EXISTS "world_boss_wakes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dungeon_key" text NOT NULL,
  "anchor" text NOT NULL,
  "max_hp" bigint NOT NULL,
  "damage_taken" bigint DEFAULT 0 NOT NULL,
  "felled_at" timestamptz,
  "felled_by" uuid REFERENCES "players"("id") ON DELETE SET NULL,
  "strikes" integer DEFAULT 0 NOT NULL,
  "wardens" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "world_boss_wakes_key"
  ON "world_boss_wakes" ("dungeon_key", "anchor");

CREATE TABLE IF NOT EXISTS "player_world_boss" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "dungeon_key" text NOT NULL,
  "anchor" text NOT NULL,
  "damage" bigint DEFAULT 0 NOT NULL,
  "strikes" integer DEFAULT 0 NOT NULL,
  "claimed_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "spoils_claimed" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_world_boss_key"
  ON "player_world_boss" ("player_id", "dungeon_key", "anchor");

-- The board is "top damage for this wake", which is this index read backwards.
CREATE INDEX IF NOT EXISTS "player_world_boss_board_idx"
  ON "player_world_boss" ("dungeon_key", "anchor", "damage");
