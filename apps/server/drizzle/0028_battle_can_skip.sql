-- Whether a fight may be skipped, decided when it opens.
--
-- Stored rather than recomputed because the rule is "had this stage been beaten *before*
-- this fight" — and by the time a battle's last turn resolves, `recordClear` has already
-- run, so asking the progress table again would answer about the clear this very battle
-- produced.
ALTER TABLE "battle_sessions" ADD COLUMN "can_skip" boolean DEFAULT false NOT NULL;

-- Battles already in flight keep the answer they would have been given, rather than all
-- losing their Skip button at deploy: an arena fight is always skippable, and anything
-- else is skippable if its stage already had a clear against it.
UPDATE "battle_sessions" bs
SET "can_skip" = (
  bs."mode" = 'arena'
  OR EXISTS (
    SELECT 1 FROM "stage_progress" sp
    WHERE sp."player_id" = bs."player_id"
      AND sp."stage_key" = bs."stage_key"
      AND sp."clears" > 0
  )
);
