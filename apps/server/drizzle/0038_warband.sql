-- Wardens — the friends slice of Warbands (C37).
--
-- One table and three columns, which is the whole feature. What is deliberately absent is
-- a guild: no chat, no officers, no shared bank, nothing to schedule with anybody.

-- A one-way list. Nobody is asked and nobody is told, and that is safe because what may be
-- borrowed is what its owner nominated — the nomination is the consent.
--
-- The primary key is the pair, so following twice is a no-op rather than a duplicate row,
-- and the CHECK is the one rule a list of people needs: a warden cannot keep themselves.
CREATE TABLE IF NOT EXISTS "player_follows" (
  "follower_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "warden_id"   uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "player_follows_pk" PRIMARY KEY ("follower_id", "warden_id"),
  CONSTRAINT "player_follows_not_self" CHECK ("follower_id" <> "warden_id")
);

-- Reading a list is by follower; the cap is counted the same way. There is deliberately no
-- index the other way round: nothing asks "who keeps me", because nobody is ever told.
CREATE INDEX IF NOT EXISTS "player_follows_follower_idx"
  ON "player_follows" ("follower_id", "created_at");

-- The champion put forward for lending: a roster **id** rather than a key, because what is
-- lent is a particular copy with its relics and masteries — the same distinction the arena
-- defence draws, and the opposite of `avatar_champion_key`, where a face is a face.
--
-- ON DELETE SET NULL: feeding away the copy withdraws the offer rather than leaving a
-- dangling one. That is the honest direction here, and it is why this is a real foreign key
-- where the avatar's key is not.
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "standard_bearer_id" uuid
  REFERENCES "player_champions"("id") ON DELETE SET NULL;

-- How many times it has been taken into somebody else's fight. The only thing a lender
-- gets, and deliberately not a currency: a reward for being borrowed is thirty alts and
-- thirty payouts. A number that only goes up costs nothing and is the one thing in the
-- game that says somebody else fought beside you.
ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "lends_total" integer NOT NULL DEFAULT 0;

-- Dropped first because Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, and every other
-- statement in this file is re-runnable. A migration that is idempotent except in one place
-- is one that fails halfway through on the second attempt.
ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_lends_total_check";
ALTER TABLE "players"
  ADD CONSTRAINT "players_lends_total_check" CHECK ("lends_total" >= 0);

-- Whose champion fought beside the party, recorded on the fight itself.
--
-- The *name* rather than a foreign key, and deliberately: a fight is read on every turn and
-- after a reload, so a join would be paid for on every one of them; and the record of who
-- fought beside you should not be rewritten by a rename six weeks later. Null on every
-- battle nobody borrowed for, which is nearly all of them.
--
-- The slot needs no column: the borrowed champion is pushed onto the formation after the
-- account's own, so it is exactly `jsonb_array_length(team_ids)`.
ALTER TABLE "battle_sessions"
  ADD COLUMN IF NOT EXISTS "borrowed_from" text;
