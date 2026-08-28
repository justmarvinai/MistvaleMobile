import type { EnergyState } from '@mistvale/shared';

/**
 * Account progression and energy maths.
 *
 * These are the P0 defaults from docs/ECONOMY_BALANCE.md. From Phase P1 the constants
 * move into `game_config` so they can be tuned in the Admin Suite without a deploy; the
 * functions stay here and read the config values.
 */

export const MAX_ACCOUNT_LEVEL = 60;

/** Energy regenerates one point every three minutes, matching the design doc. */
export const ENERGY_REGEN_SECONDS = 180;

/** Energy cap grows with account level: 20 at level 1, 129 at level 60. */
export function energyCapForLevel(level: number): number {
  const clamped = clampLevel(level);
  return 18 + Math.ceil(1.85 * clamped);
}

/**
 * Account XP required to advance from `level` to `level + 1`.
 *
 * A gentle geometric curve: quick early levels that keep the tutorial moving, and a
 * long tail that paces feature unlocks across the first months.
 */
export function xpForNextLevel(level: number): number {
  const clamped = clampLevel(level);
  if (clamped >= MAX_ACCOUNT_LEVEL) return 0;
  return Math.round(120 * Math.pow(1.14, clamped - 1));
}

/** Applies XP, rolling over as many levels as the amount covers. */
export function applyAccountXp(
  current: { level: number; xp: number },
  gained: number,
): { level: number; xp: number; levelsGained: number } {
  if (gained <= 0) {
    return { level: current.level, xp: current.xp, levelsGained: 0 };
  }

  let level = clampLevel(current.level);
  let xp = current.xp + gained;
  let levelsGained = 0;

  while (level < MAX_ACCOUNT_LEVEL) {
    const needed = xpForNextLevel(level);
    if (xp < needed) break;
    xp -= needed;
    level += 1;
    levelsGained += 1;
  }

  // At the cap, XP stops accumulating so the UI can show a full bar.
  if (level >= MAX_ACCOUNT_LEVEL) {
    return { level: MAX_ACCOUNT_LEVEL, xp: 0, levelsGained };
  }

  return { level, xp, levelsGained };
}

/**
 * Computes current energy from the stored value and the time since it was last written.
 *
 * Energy is derived rather than ticked by a job: the row is only rewritten when a player
 * spends, so an idle account costs nothing.
 */
export function computeEnergy(params: {
  storedValue: number;
  updatedAt: Date;
  level: number;
  now: Date;
  regenSeconds?: number;
}): { value: number; cap: number; state: EnergyState; settledAt: Date } {
  const cap = energyCapForLevel(params.level);
  const regenSeconds = params.regenSeconds ?? ENERGY_REGEN_SECONDS;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((params.now.getTime() - params.updatedAt.getTime()) / 1000),
  );

  // Overfilled bars (from refill items) drain no faster — they simply stop regenerating.
  const regenerated =
    params.storedValue >= cap ? params.storedValue : Math.floor(elapsedSeconds / regenSeconds);
  const value =
    params.storedValue >= cap
      ? params.storedValue
      : Math.min(cap, params.storedValue + regenerated);

  let nextTickAt: string | null = null;
  let fullAt: string | null = null;

  if (value < cap) {
    const secondsIntoTick = elapsedSeconds % regenSeconds;
    const secondsToNextTick = regenSeconds - secondsIntoTick;
    nextTickAt = new Date(params.now.getTime() + secondsToNextTick * 1000).toISOString();
    const ticksRemaining = cap - value;
    fullAt = new Date(
      params.now.getTime() + ((ticksRemaining - 1) * regenSeconds + secondsToNextTick) * 1000,
    ).toISOString();
  }

  return {
    value,
    cap,
    state: { value, cap, regenSeconds, nextTickAt, fullAt },
    settledAt: settledAt(params.now, elapsedSeconds, regenSeconds, value < cap),
  };
}

/**
 * The instant the settled value was actually reached.
 *
 * Anything that *writes* energy — a grant, a level-up refill — has to stamp
 * `energy_updated_at` alongside it, and stamping `now` throws away however far into the
 * current tick the bar had got. Below the cap that is a real theft of up to three minutes
 * every time a reward lands, which on a busy evening is several points; at or above it
 * there is no tick to carry, because regeneration has stopped.
 */
function settledAt(
  now: Date,
  elapsedSeconds: number,
  regenSeconds: number,
  regenerating: boolean,
): Date {
  if (!regenerating || regenSeconds <= 0) return now;
  return new Date(now.getTime() - (elapsedSeconds % regenSeconds) * 1000);
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_ACCOUNT_LEVEL, Math.max(1, Math.floor(level)));
}
