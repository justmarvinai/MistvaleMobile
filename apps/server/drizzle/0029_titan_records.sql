-- The Solo Titan: what an account has managed against each keep.
--
-- One bounded row per player per Titan rather than a log of runs. A run pays at the rung
-- it reached, so there is no claim state to keep — only the record and the last attempt,
-- which are what the screen is about.
CREATE TABLE IF NOT EXISTS "titan_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "dungeon_key" text NOT NULL,
  "best_damage" bigint DEFAULT 0 NOT NULL,
  "best_tier_key" text,
  "last_damage" bigint DEFAULT 0 NOT NULL,
  "runs" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "titan_records_player_dungeon_key"
  ON "titan_records" ("player_id", "dungeon_key");
