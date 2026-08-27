import type { PlayerSummary, RosterChampion } from '@mistvale/shared';

/**
 * The arithmetic behind the profile chip.
 *
 * Three small answers, kept out of the component because each of them has an edge that is
 * easy to get wrong and impossible to see: the level cap has no next level to divide by,
 * an account power of nine hundred must not render as "0.9K", and "the four strongest" has
 * to mean something when the player owns two.
 */

/** How many champions the chip's power figure adds up. An Arena team, and not by accident. */
export const POWER_TEAM = 4;

export interface LevelReading {
  /** 0–1, for the bar. */
  fraction: number;
  /**
   * The same fraction as a whole number, for the readout *inside* the bar.
   *
   * Never 100 short of the cap. A player at 99.7% of a level rounds to 100 by any ordinary
   * rule, and a bar that says it is finished when it is not is the one thing a progress
   * readout must never do — so the last percent is held at 99 until the level actually
   * turns over.
   */
  percent: number;
  /** What the bar's numbers say, already formatted. */
  have: string;
  need: string;
  /** Experience still to earn, or null at the cap. */
  remaining: number | null;
  capped: boolean;
}

/**
 * How far into the level.
 *
 * `xpToNextLevel` is the span of the *current* level rather than a running total, so the
 * fraction is a plain division and the remainder is a subtraction — no cumulative table,
 * and nothing here the server has not already worked out.
 *
 * At the cap there is no next level and no span to divide by. The bar reads full, because
 * a bar stuck at zero on a finished account is a worse answer than a bar that is done.
 */
export function levelReading(player: PlayerSummary): LevelReading {
  if (player.xpToNextLevel <= 0) {
    return { fraction: 1, percent: 100, have: '', need: '', remaining: null, capped: true };
  }
  const have = Math.max(0, Math.min(player.xp, player.xpToNextLevel));
  const fraction = have / player.xpToNextLevel;
  return {
    fraction,
    percent: fraction >= 1 ? 100 : Math.min(99, Math.round(fraction * 100)),
    have: have.toLocaleString('en-US'),
    need: player.xpToNextLevel.toLocaleString('en-US'),
    remaining: Math.max(0, player.xpToNextLevel - player.xp),
    capped: false,
  };
}

/**
 * What an account is worth, in the one number this genre puts on a portrait.
 *
 * The four strongest champions added together — which is an Arena team, and that is the
 * point: it is the strength a player could actually field rather than a total that rewards
 * hoarding. Fewer than four is simply the sum of what there is, so a new account reads its
 * one starter rather than a zero.
 *
 * Server numbers throughout. `power` on a roster entry is assembled power, gear and all,
 * and adding four of them up is arithmetic on a display value rather than game math.
 */
export function accountPower(champions: readonly RosterChampion[]): number {
  return [...champions]
    .sort((a, b) => b.power - a.power)
    .slice(0, POWER_TEAM)
    .reduce((total, champion) => total + champion.power, 0);
}

/**
 * A big number in the width a chip has for it.
 *
 * Thousands and millions only: a billion is not reachable and a hundred is not worth
 * shortening. One decimal, and it is dropped when it would read `1.0K` — a trailing zero
 * in an abbreviation is noise pretending to be precision.
 */
export function abbreviatePower(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 10_000) return Math.round(value).toLocaleString('en-US');
  const [divisor, suffix] = value >= 1_000_000 ? [1_000_000, 'M'] : [1_000, 'K'];
  const scaled = value / divisor;
  const shown = scaled >= 100 ? Math.round(scaled).toString() : trimZero(scaled.toFixed(1));
  return `${shown}${suffix}`;
}

function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}
