-- C10c — Expeditions.
--
-- One row per dispatch in flight or waiting to be collected. The party is a jsonb array of
-- champion ids rather than a join table: a party is read and written whole, never queried
-- one member at a time, and "which champions are away" is one indexed read of this table
-- rather than a join nobody else needs.
--
-- `rewards` is fixed at dispatch rather than computed at claim. That is deliberate: the
-- favours a party met were true when it was sent, and a content edit six hours later must
-- not quietly change what somebody was promised.
CREATE TABLE IF NOT EXISTS "player_expeditions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "expedition_key" text NOT NULL,
  "champion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rewards" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "favours" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "ready_at" timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "player_expeditions_player" ON "player_expeditions" ("player_id");

-- `expedition` is a twenty-fifth content type, and `content_entries` carries a CHECK that
-- enumerates them — generated from `CONTENT_TYPES` in the schema, so the code was already
-- right and only the live table needed telling. Rebuilt rather than altered because
-- PostgreSQL has no "add a value to a CHECK".
ALTER TABLE "content_entries" DROP CONSTRAINT IF EXISTS "content_entries_type_check";
ALTER TABLE "content_entries" ADD CONSTRAINT "content_entries_type_check" CHECK (
  "content_type" IN (
    'faction', 'status', 'skill', 'asset', 'champion', 'enemy', 'gearSet', 'gearSlot',
    'gearStat', 'item', 'campaignChapter', 'dungeon', 'stage', 'summonPool', 'shop',
    'mastery', 'quest', 'mission', 'event', 'loginTrack', 'newsPost', 'tutorialStep',
    'soundCue', 'expedition', 'gameConfig'
  )
);
