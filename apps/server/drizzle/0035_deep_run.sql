-- The Deep Run (C10f).
--
-- One table, and it holds the only state in the game that is resumable *across* battles: a
-- descent is a dozen floors, and a player who closes the tab on floor 7 has to find floor 7
-- when they come back. So the party's health, who has fallen, the boons taken, the doors
-- open and the boons offered all live on the row rather than being recomputed.
--
-- `seed` plus `offer_nonce` is what keeps the draws honest: doors and boon offers come from
-- the run's own seeded stream, so an offer cannot be re-rolled by refusing it and asking
-- again, and a descent replays identically.

CREATE TABLE IF NOT EXISTS "player_deep_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "run_key" text NOT NULL,
  "seed" integer NOT NULL,
  "offer_nonce" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "phase" text DEFAULT 'choosingDoor' NOT NULL,
  "floor" integer DEFAULT 1 NOT NULL,
  "deepest" integer DEFAULT 0 NOT NULL,
  "party" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "boons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "doors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "boon_offer" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "current_room" text,
  "battle_id" uuid,
  "rewards" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ended_at" timestamptz
);

-- At most one live descent per account per run. Two would mean two sets of doors and a
-- battle that could be filed against either.
CREATE UNIQUE INDEX IF NOT EXISTS "player_deep_runs_active_key"
  ON "player_deep_runs" ("player_id", "run_key") WHERE status = 'active';

CREATE INDEX IF NOT EXISTS "player_deep_runs_player_idx"
  ON "player_deep_runs" ("player_id", "started_at");

-- `deepRun` is a twenty-sixth content type, and `content_entries` carries a CHECK that
-- enumerates them. Rebuilt rather than altered, because PostgreSQL has no "add a value to a
-- CHECK".
ALTER TABLE "content_entries" DROP CONSTRAINT IF EXISTS "content_entries_type_check";
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK (
  "content_type" IN (
    'faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot',
    'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop',
    'mastery', 'quest', 'mission', 'event', 'loginTrack', 'newsPost', 'tutorialStep',
    'soundCue', 'expedition', 'deepRun', 'gameConfig'
  )
);
