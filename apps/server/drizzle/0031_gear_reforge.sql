-- C10a — Reforge.
--
-- One column, because the price of the next reforge is built on how many this relic has
-- already had. Counting them from `economy_log` would work and would be wrong: the log is
-- prunable (P8i) and a pruned month would quietly make every old relic cheap again.
ALTER TABLE "gear_instances"
  ADD COLUMN IF NOT EXISTS "reforges" smallint NOT NULL DEFAULT 0;
