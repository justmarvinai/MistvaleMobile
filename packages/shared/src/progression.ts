import { LEVEL_CAP_BY_RANK, MAX_RANK, MIN_RANK, type Rarity } from './enums';

/**
 * What a champion of each rarity may become.
 *
 * The source game lets almost anything climb to ★6 given enough food, which is why its
 * roster is mostly a pile of fodder with a handful of champions worth the climb. Mistvale
 * ties the ceiling to the rarity instead (the owner's call, 2026-08-22): a Common is food
 * and stays food, an Uncommon is the food *chain* — the only way to manufacture the ★3,
 * ★4 and ★5 bodies a real champion's rank-ups eat — and only Rare and above reach the top.
 *
 * `base` is the range a content author may start a champion in. Two of them are a genuine
 * choice: a Common may be authored at ★1 or ★2 and an Uncommon at ★2 or ★3, which is what
 * makes an early roster feel unequal without anything being unfair. The rest are fixed,
 * because a Rare that started at ★4 would be an Epic wearing the wrong colour.
 *
 * `max` is where the star track ends. `max === base.max` means the track does not move at
 * all, which is the Common's whole story.
 */
export interface RankRange {
  /** The lowest and highest star a def of this rarity may be authored at. */
  base: { min: number; max: number };
  /** The highest star it can be raised to, once it is allowed to be raised at all. */
  max: number;
  /**
   * Whether the star track moves.
   *
   * False for Commons, and it is not the same statement as `max === base.max`. A Common
   * authored at ★1 stays at ★1 — it does not creep to ★2 — so its ceiling is **its own**
   * start rather than the rarity's. Every other rarity climbs to `max` from wherever it
   * began.
   */
  upgradable: boolean;
}

export const RANK_RANGE_BY_RARITY: Readonly<Record<Rarity, RankRange>> = Object.freeze({
  common: Object.freeze({ base: { min: 1, max: 2 }, max: 2, upgradable: false }),
  uncommon: Object.freeze({ base: { min: 2, max: 3 }, max: 5, upgradable: true }),
  rare: Object.freeze({ base: { min: 3, max: 3 }, max: 5, upgradable: true }),
  epic: Object.freeze({ base: { min: 4, max: 4 }, max: 6, upgradable: true }),
  legendary: Object.freeze({ base: { min: 5, max: 5 }, max: 6, upgradable: true }),
});

/** The rarities that may ascend and awaken at all. */
export const DEEP_RARITIES: readonly Rarity[] = Object.freeze(['rare', 'epic', 'legendary']);

/**
 * How far this champion's star track goes.
 *
 * Takes the champion's own start, because for a Common that *is* the answer: a Common
 * authored at ★1 has a one-star track and a Common authored at ★2 has a one-star track one
 * star higher. For everything else the start is irrelevant to the ceiling.
 */
export function maxRankFor(rarity: Rarity, baseRank: number): number {
  const range = RANK_RANGE_BY_RARITY[rarity];
  if (range.upgradable) return range.max;
  return Math.min(Math.max(Math.trunc(baseRank), range.base.min), range.base.max);
}

/** Where a def of this rarity starts when content does not say. */
export function defaultBaseRank(rarity: Rarity): number {
  return RANK_RANGE_BY_RARITY[rarity].base.min;
}

/** Whether content may author this rarity at this star. */
export function isValidBaseRank(rarity: Rarity, rank: number): boolean {
  const { base } = RANK_RANGE_BY_RARITY[rarity];
  return Number.isInteger(rank) && rank >= base.min && rank <= base.max;
}

/**
 * Whether a champion at this star can be raised at all.
 *
 * Rarity first, then the star: a Common is refused whatever star it is on, because a
 * Common's ceiling is its own start; anything else is refused only once it has run out of
 * track.
 */
export function canRankUp(rarity: Rarity, rank: number, baseRank: number): boolean {
  return rank < maxRankFor(rarity, baseRank);
}

/**
 * Whether this rarity has an ascension and an awakening at all.
 *
 * Both are the deep end of the game and both are wasted on a body that exists to be fed to
 * something else. Tying them to the same three rarities means a player never has to learn
 * two different answers to "can this one go further".
 */
export function canDeepen(rarity: Rarity): boolean {
  return DEEP_RARITIES.includes(rarity);
}

/** Max level at a star rank. Anything outside 1–6 is clamped rather than thrown. */
export function levelCapForRank(rank: number): number {
  const clamped = Math.min(Math.max(Math.trunc(rank), MIN_RANK), MAX_RANK);
  return LEVEL_CAP_BY_RANK[clamped] ?? LEVEL_CAP_BY_RANK[MIN_RANK] ?? 20;
}

/**
 * Whether a champion is standing where every upgrade demands it stands.
 *
 * One rule for all three ladders — rank, ascension, awakening — because it is one rule in
 * the source game and because a player who learns it once should not be surprised by the
 * second ladder. A champion must be at its current star's level cap.
 */
export function atLevelCap(rank: number, level: number): boolean {
  return level >= levelCapForRank(rank);
}

/**
 * The star a champion starts at, whatever content did or did not say.
 *
 * Content may leave `baseRank` off — three of the five rarities have no choice to make —
 * and an operator may still type a number outside the range into a draft. Both resolve to
 * something sane here rather than at every call site: an absent value takes the rarity's
 * own start, and a wrong one is clamped into the range. Publish validation refuses the
 * wrong one separately, so this is the belt to that pair of braces.
 */
export function baseRankOf(def: { rarity: Rarity; baseRank?: number | undefined }): number {
  const { base } = RANK_RANGE_BY_RARITY[def.rarity];
  if (def.baseRank === undefined) return base.min;
  return Math.min(Math.max(Math.trunc(def.baseRank), base.min), base.max);
}
