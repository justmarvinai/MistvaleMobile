-- Saved relic sets: the nine pieces a build is made of, named.
--
-- `gear_ids` is deliberately not a set of foreign keys. A relic named in a loadout can be
-- sold, and a loadout naming a sold piece is an ordinary state of the world months after
-- saving it — applying skips what is gone and says so, where a cascade would silently
-- rewrite the set instead.
CREATE TABLE IF NOT EXISTS "gear_loadouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "gear_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "from_champion_id" uuid REFERENCES "player_champions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "gear_loadouts_player_idx" ON "gear_loadouts" ("player_id");
CREATE UNIQUE INDEX IF NOT EXISTS "gear_loadouts_player_name_key"
  ON "gear_loadouts" ("player_id", "name");
