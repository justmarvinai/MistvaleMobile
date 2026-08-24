-- The Mistspire: one row per account per tower per month.
--
-- The monthly reset is the anchor and nothing else. There is no job to run and no column
-- to clear: next month's climb simply finds no row and starts at floor zero, which is the
-- same trick the world boss's weekly anchor plays.
CREATE TABLE IF NOT EXISTS "player_spire_climbs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE cascade,
  "dungeon_key" text NOT NULL,
  "anchor" text NOT NULL,
  "highest_floor" integer DEFAULT 0 NOT NULL,
  "claimed_landings" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "clears" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "player_spire_climbs_key"
  ON "player_spire_climbs" ("player_id", "dungeon_key", "anchor");

-- `content_entries` enumerates its types in a CHECK, and the Mistspire adds no new content
-- type — it is a `dungeon` kind and a `stage` mode, both of which are values inside the
-- JSON rather than the enumerated column. Nothing to rebuild this time.
