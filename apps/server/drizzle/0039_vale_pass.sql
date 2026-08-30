-- The Vale Pass (C38): a season, and one account's climb up its two-column ladder.
--
-- The same shape as `player_events` and for the same reasons — a season is a point ladder
-- anchored to the game-day its window opened on, so next season finds no row and there is
-- nothing to reset and no job to run. Three things make it a table rather than two columns
-- on `player_events`: the ladder has two columns to collect from, the track can be taken up
-- for crystals, and the day's earning is capped. All three would be null on every event row
-- ever written.
CREATE TABLE IF NOT EXISTS "player_passes" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "player_id"   uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "pass_key"    text NOT NULL,
  "season"      text NOT NULL,

  "points"       integer NOT NULL DEFAULT 0,
  -- Earned today, against the season's `dailyPointCap`. A stale stamp reads as zero, which
  -- is what rolls the day over with no reset job — `daily-counters.ts`'s rule, applied to a
  -- counter that belongs to this row rather than to the account.
  "points_today" integer NOT NULL DEFAULT 0,
  "points_day"   text,

  "claimed_free"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "claimed_premium" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "unlocked"        boolean NOT NULL DEFAULT false,

  "claim_action_id"  text,
  "unlock_action_id" text,

  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "player_passes_points_check" CHECK ("points" >= 0),
  CONSTRAINT "player_passes_today_check" CHECK ("points_today" >= 0)
);

-- One row per account per season, which is what makes the fan-out's upsert safe.
CREATE UNIQUE INDEX IF NOT EXISTS "player_passes_key"
  ON "player_passes" ("player_id", "pass_key", "season");

-- `valePass` is a twenty-seventh content type, and `content_entries` carries a CHECK that
-- enumerates them. Rebuilt rather than altered, because PostgreSQL has no "add a value to a
-- CHECK" — the third time in this project, and the price of enumerating types in DDL. It is
-- worth paying: the alternative is an unknown type that publishes cleanly and is read by
-- nothing.
ALTER TABLE "content_entries" DROP CONSTRAINT IF EXISTS "content_entries_type_check";
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK (
  "content_type" IN (
    'faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot',
    'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop',
    'mastery', 'quest', 'mission', 'event', 'valePass', 'loginTrack', 'newsPost',
    'tutorialStep', 'soundCue', 'expedition', 'deepRun', 'gameConfig'
  )
);
