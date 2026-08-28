-- The champion-XP boost, and an energy bar that may sit above its cap (C24).
--
-- Both are one column on `players`, and both are deliberately *not* a table: the account
-- has exactly one boost, so granting more of it moves a timestamp forward rather than
-- inserting a row nothing would ever read twice.

-- `smallint` tops out at 32,767, which was ample while energy could only be a bar of a
-- hundred-odd points and is not now that it is a payable reward: the first week alone
-- hands a new warden a few thousand, and a single mail from an operator can hand out more
-- than that. Widening is a metadata-only rewrite in PostgreSQL for this direction, so it
-- costs nothing on the live table.
ALTER TABLE "players" ALTER COLUMN "energy" TYPE integer;

-- Null means the boost has never been granted; a past value means it has run out. Nothing
-- sweeps expired rows because nothing needs to — `xpBoostActive` reads the clock.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "xp_boost_until" timestamp with time zone;

-- The floor stays. Energy may go as far above the cap as content pays, and never below
-- zero — the spend paths refuse before they subtract, and this is the backstop.
-- (`players_energy_check` already says `energy >= 0`; the type change keeps it.)
