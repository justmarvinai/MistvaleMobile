ALTER TABLE "player_champions" ADD COLUMN "awakening" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Lift every champion already owned to the star its rarity now starts at.
--
-- The star ceiling is derived from the rarity now, and the ranks below it were handed out
-- under the old rule that everything began at ★1. Left alone, an existing Legendary would
-- sit at ★1 with a level cap of 20 and a rank-up cost of one ★1 body — cheaper than a
-- Common, and visibly wrong on a card. It cannot be done in the seeder either: the ranks
-- have to move before anything reads them, and content and player data share a database, so
-- the rarity is right here to be read. `state = 'live'` because a draft is somebody's
-- unpublished opinion and must not move a player's roster.
--
-- `greatest` rather than a plain set: a champion someone already ranked up keeps what they
-- paid for. Only the floor moves.
UPDATE "player_champions" pc
SET "rank" = GREATEST(
  pc."rank",
  CASE ce."data" ->> 'rarity'
    WHEN 'legendary' THEN 5
    WHEN 'epic' THEN 4
    WHEN 'rare' THEN 3
    WHEN 'uncommon' THEN 2
    ELSE 1
  END
)
FROM "content_entries" ce
WHERE ce."content_type" = 'champion'
  AND ce."state" = 'live'
  AND ce."key" = pc."champion_key";
--> statement-breakpoint
-- And a champion whose level now sits above the cap of a star it was never at is left
-- alone: `rank` only ever went up, so every cap only ever went up with it.
