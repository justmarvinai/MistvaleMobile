-- C10b — Imprint.
--
-- Copies **obtained**, not copies held: feeding the duplicate away is the correct play,
-- and a count derived from the roster would undo the imprint for making it. Nothing else
-- in the schema records this — `champion_sightings` is one row per key ever seen, and
-- `summon_history` misses every champion that arrived from a mission, an event or the mail.
CREATE TABLE IF NOT EXISTS "champion_imprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "champion_key" text NOT NULL,
  "copies" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "champion_imprints_player_champion"
  ON "champion_imprints" ("player_id", "champion_key");

-- Every champion an account already holds counts as its first copy, so nobody arrives at
-- this feature reading zero for a roster they spent weeks on. Duplicates already fed away
-- are gone and cannot be recovered — the honest answer, and the reason this backfill
-- counts rows rather than inventing history.
INSERT INTO "champion_imprints" ("player_id", "champion_key", "copies")
SELECT "player_id", "champion_key", COUNT(*)
FROM "player_champions"
GROUP BY "player_id", "champion_key"
ON CONFLICT ("player_id", "champion_key") DO NOTHING;
