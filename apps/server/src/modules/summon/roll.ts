import type { Rng } from '@mistvale/engine';
import {
  RARITIES,
  type ChampionDef,
  type PityState,
  type Rarity,
  type SummonPoolDef,
} from '@mistvale/shared';

/**
 * The summon roll.
 *
 * Pure and injectable, exactly like the battle engine, and for the same reason: this is
 * the system a player is most entitled to distrust, so it has to be testable in isolation
 * and provable in bulk. Nothing here reads a clock, a database or `Math.random()`.
 *
 * Two steps, deliberately kept apart:
 *
 *  1. **Which rarity** — the published rates, plus whatever mercy has accrued. Mercy is
 *     added to the rarity's chance and taken from the *lowest* rarity's, so the
 *     distribution still sums to one and the guarantee arrives by squeezing the floor
 *     rather than by silently exceeding 100%.
 *  2. **Which champion** — a weighted pick inside that rarity band only.
 *
 * Keeping them separate is what makes the advertised rate honest as the roster grows: an
 * added Epic dilutes the other Epics, never the chance of getting an Epic at all.
 */

/** Mercy counters for one pool: summons since each rarity last landed. */
export type PityCounters = Partial<Record<Rarity, number>>;

export interface RollOutcome {
  rarity: Rarity;
  championKey: string;
  /** True when the accrued bonus is what pushed this rarity over the line. */
  fromMercy: boolean;
  /** Counters after this pull, ready to store. */
  counters: PityCounters;
}

/**
 * The chance table this pull will actually roll against.
 *
 * Exported because the Odds & Mercy panel shows exactly this — the player is told the
 * number the server is about to use, not the base rate it was derived from.
 */
export function effectiveRates(
  pool: SummonPoolDef,
  counters: PityCounters,
): { rates: Record<string, number>; bonuses: Partial<Record<Rarity, number>> } {
  const rates: Record<string, number> = {};
  for (const rarity of RARITIES) {
    const base = pool.rates[rarity];
    if (typeof base === 'number') rates[rarity] = base;
  }

  const bonuses: Partial<Record<Rarity, number>> = {};
  let taken = 0;

  for (const rarity of RARITIES) {
    const rule = pool.pity[rarity];
    if (!rule || rates[rarity] === undefined) continue;

    const since = counters[rarity] ?? 0;
    const over = since - rule.after;
    if (over <= 0) continue;

    const bonus = Math.min(over * rule.step, rule.maxBonus);
    if (bonus <= 0) continue;
    bonuses[rarity] = bonus;
    rates[rarity] = (rates[rarity] ?? 0) + bonus;
    taken += bonus;
  }

  if (taken > 0) drainFromCommonest(rates, taken);
  return { rates, bonuses };
}

/**
 * Takes the mercy bonus back out of the commonest rarities, lowest first.
 *
 * A mercy bonus has to come from somewhere. Taking it off the bottom of the table is what
 * keeps the distribution summing to one — and it is also the behaviour a player expects:
 * being owed an Epic should cost you Rares, not other Epics.
 */
function drainFromCommonest(rates: Record<string, number>, amount: number): void {
  let remaining = amount;
  for (const rarity of RARITIES) {
    if (remaining <= 1e-9) break;
    const available = rates[rarity];
    if (available === undefined || available <= 0) continue;
    const taken = Math.min(available, remaining);
    rates[rarity] = available - taken;
    remaining -= taken;
  }

  // If the floor could not absorb it all, normalise rather than hand back a table that
  // sums past one — a pool tuned that badly should still roll something sane.
  if (remaining > 1e-9) {
    const total = Object.values(rates).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      for (const key of Object.keys(rates)) rates[key] = (rates[key] ?? 0) / total;
    }
  }
}

/** Picks a rarity from a chance table. */
function pickRarity(rng: Rng, rates: Record<string, number>): Rarity {
  const total = RARITIES.reduce((sum, rarity) => sum + Math.max(0, rates[rarity] ?? 0), 0);
  if (total <= 0) return 'common';

  let roll = rng.next() * total;
  for (const rarity of RARITIES) {
    roll -= Math.max(0, rates[rarity] ?? 0);
    if (roll <= 0) return rarity;
  }
  // Floating-point drift only; the last rarity with any weight is the honest answer.
  return [...RARITIES].reverse().find((rarity) => (rates[rarity] ?? 0) > 0) ?? 'common';
}

/** Weighted pick among the champions of one rarity. */
function pickChampion(
  rng: Rng,
  pool: SummonPoolDef,
  rarity: Rarity,
  rarityOf: (championKey: string) => Rarity | undefined,
): string | null {
  const candidates = pool.entries.filter(
    (entry) => rarityOf(entry.championKey) === rarity && entry.weight > 0,
  );
  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * total;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll <= 0) return entry.championKey;
  }
  return candidates[candidates.length - 1]!.championKey;
}

/**
 * One pull.
 *
 * `forceRarity` is how a ×10's floor is honoured: the caller decides the last pull must
 * be at least Epic, and this rolls within that constraint rather than the caller
 * fabricating a result the roller never produced.
 */
export function rollOne(
  rng: Rng,
  pool: SummonPoolDef,
  counters: PityCounters,
  rarityOf: (championKey: string) => Rarity | undefined,
  forceRarity?: Rarity,
): RollOutcome | null {
  const { rates, bonuses } = effectiveRates(pool, counters);

  let rarity: Rarity;
  if (forceRarity) {
    // Roll only among the forced rarity and anything above it, so a floor is a floor and
    // not a ceiling — a guaranteed Epic that blocks a Legendary would be a bug.
    const floorIndex = RARITIES.indexOf(forceRarity);
    const restricted: Record<string, number> = {};
    for (const [index, entry] of RARITIES.entries()) {
      if (index >= floorIndex && (rates[entry] ?? 0) > 0) restricted[entry] = rates[entry]!;
    }
    rarity = Object.keys(restricted).length > 0 ? pickRarity(rng, restricted) : forceRarity;
  } else {
    rarity = pickRarity(rng, rates);
  }

  let championKey = pickChampion(rng, pool, rarity, rarityOf);
  if (!championKey) {
    // The pool advertises a rarity it has no champion for. Fall back down the table
    // rather than failing the pull, and let publish validation complain about the gap.
    for (const fallback of [...RARITIES].reverse()) {
      championKey = pickChampion(rng, pool, fallback, rarityOf);
      if (championKey) {
        rarity = fallback;
        break;
      }
    }
  }
  if (!championKey) return null;

  const counted: PityCounters = {};
  const landedIndex = RARITIES.indexOf(rarity);
  for (const tracked of RARITIES) {
    if (pool.pity[tracked] === undefined) continue;
    // A Legendary satisfies the Epic counter too: mercy promises "at least this good",
    // and resetting only the exact match would owe the player an Epic they just beat.
    const reset = RARITIES.indexOf(tracked) <= landedIndex;
    counted[tracked] = reset ? 0 : (counters[tracked] ?? 0) + 1;
  }

  return {
    rarity,
    championKey,
    fromMercy: (bonuses[rarity] ?? 0) > 0,
    counters: counted,
  };
}

/**
 * A whole pull, one or ten.
 *
 * The floor is applied to the last pull only if nothing earlier already satisfied it,
 * which is what makes a ×10 feel like a ×10 rather than nine pulls and a consolation.
 */
export function rollMany(
  rng: Rng,
  pool: SummonPoolDef,
  startingCounters: PityCounters,
  count: number,
  rarityOf: (championKey: string) => Rarity | undefined,
): RollOutcome[] {
  const outcomes: RollOutcome[] = [];
  let counters: PityCounters = { ...startingCounters };

  const floor = pool.tenPullFloor;
  const floorIndex = floor ? RARITIES.indexOf(floor) : -1;

  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const alreadyMet =
      floorIndex < 0 || outcomes.some((outcome) => RARITIES.indexOf(outcome.rarity) >= floorIndex);
    const force = isLast && count > 1 && !alreadyMet && floor ? floor : undefined;

    const outcome = rollOne(rng, pool, counters, rarityOf, force);
    if (!outcome) break;
    outcomes.push(outcome);
    counters = outcome.counters;
  }

  return outcomes;
}

/** The mercy state as the Odds & Mercy panel renders it. */
export function pityStates(pool: SummonPoolDef, counters: PityCounters): PityState[] {
  const { rates, bonuses } = effectiveRates(pool, counters);
  const states: PityState[] = [];

  for (const rarity of RARITIES) {
    const rule = pool.pity[rarity];
    if (!rule) continue;
    states.push({
      rarity,
      since: counters[rarity] ?? 0,
      after: rule.after,
      step: rule.step,
      currentBonus: bonuses[rarity] ?? 0,
      effectiveChance: rates[rarity] ?? 0,
    });
  }
  return states;
}

/** Groups a pool's champions by rarity, for the full-odds disclosure. */
export function poolContents(
  pool: SummonPoolDef,
  rarityOf: (championKey: string) => Rarity | undefined,
): Record<string, string[]> {
  const contents: Record<string, string[]> = {};
  for (const entry of pool.entries) {
    const rarity = rarityOf(entry.championKey);
    if (!rarity) continue;
    (contents[rarity] ??= []).push(entry.championKey);
  }
  return contents;
}

/** Champion definitions indexed by key, the lookup every function here takes. */
export function rarityLookup(
  champions: readonly ChampionDef[],
): (championKey: string) => Rarity | undefined {
  const byKey = new Map(champions.map((champion) => [champion.key, champion.rarity]));
  return (championKey: string) => byKey.get(championKey);
}
