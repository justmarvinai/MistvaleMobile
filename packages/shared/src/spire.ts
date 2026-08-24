import { z } from 'zod';
import { RARITIES, type Rarity } from './enums';
import type { SpireLanding, SpireRules, TeamRestriction } from './content/entities';

/**
 * The Mistspire.
 *
 * The tower exists for one reason the rest of the game does not cover: **nothing in
 * Mistvale rewards breadth.** The campaign and the Arena are both won with one good team,
 * the Depths with one good team per element, and the Titan with one good team plus a
 * multi-hitter. A thirty-eighth champion is therefore worth less than a relic, and the
 * honest answer to "should I feed this away" has been yes for most of the roster.
 *
 * A **warded floor** is the answer. It names an element, a faction, a role or a rarity
 * floor, and the only team allowed up is four champions who meet it. One excellent ember
 * team gets to the first tide ward and stops; the champion nearly fed away last week is
 * the way past it. That is the whole design, and everything else here serves it.
 *
 * Two rules make it a tower rather than a long dungeon:
 *
 *  - **Keys are spent on a clear, not on an attempt.** The source game's Faction Wars rule
 *    rather than its tower's, and deliberately: a floor that has to be *solved* should be
 *    free to fail at. Charging for attempts teaches people to look the answer up instead
 *    of working it out, which is the opposite of what a puzzle mode is for.
 *  - **The climb resets with the month.** A tower you finish once is a weekend; a tower
 *    that comes back is a reason to keep a broad roster levelled. The anchor is simply the
 *    game-day's `YYYY-MM`, so there is nothing to schedule and nothing to reset — last
 *    month's row stops matching, exactly as last week's world-boss row does.
 *
 * Everything here is a pure read of published content plus the player's own numbers, so
 * the screen and the server compute the same answers from the same rules.
 */

/** The counter name a spire's keys are spent against, per tower. */
export function spireCounter(dungeonKey: string): string {
  return `spire:${dungeonKey}`;
}

/**
 * The climb a game-day belongs to — the calendar month, as `YYYY-MM`.
 *
 * A *rule* rather than a tunable, and the reason is the same one that keeps the level caps
 * in `progression.ts`: a reset cadence an operator could set to two days would turn the
 * tower into a daily, which is a different mode wearing this one's name. "It comes back
 * next month" is also the only reset a player never has to be told about twice.
 *
 * Derived from the game-day rather than from a `Date`, so the tower turns over at the same
 * reset hour as the dailies rather than at some midnight of its own.
 */
export function spireAnchor(today: string): string {
  return today.slice(0, 7);
}

// ── Warded floors ───────────────────────────────────────────────────────────

/** The little a restriction needs to know about a champion to judge it. */
export interface RestrictableChampion {
  key: string;
  name: string;
  factionKey: string;
  element: string;
  role: string;
  rarity: Rarity;
}

/** Whether one champion satisfies a ward. Pure, and the only place the rule is written. */
export function championMeets(
  restriction: TeamRestriction,
  champion: RestrictableChampion,
): boolean {
  switch (restriction.kind) {
    case 'element':
      return champion.element === restriction.value;
    case 'faction':
      return champion.factionKey === restriction.value;
    case 'role':
      return champion.role === restriction.value;
    case 'minRarity': {
      // A floor rather than an exact match: "Rare or better" asks for investment, where
      // "exactly Rare" would ask a player to un-invest, which is not a thing to reward.
      const wanted = RARITIES.indexOf(restriction.value as Rarity);
      // An unknown rarity is a content error, not a reason to let everybody through.
      if (wanted < 0) return false;
      return RARITIES.indexOf(champion.rarity) >= wanted;
    }
  }
}

/**
 * Why a team cannot climb a warded floor, or null when it can.
 *
 * Read by the team chooser before any key is at risk and by the server at the start of the
 * fight, so the sentence a player is shown and the sentence the refusal carries are one
 * sentence. It names the champions who fail rather than only the rule, because "Kaelen and
 * Vorr are not of the Tide" is something to act on and "team must be Tide" is a riddle
 * about which two of four are wrong.
 */
export function teamRestrictionFailure(
  restriction: TeamRestriction,
  team: readonly RestrictableChampion[],
  label: string,
): string | null {
  const failing = team.filter((champion) => !championMeets(restriction, champion));
  if (failing.length === 0) return null;
  const names = failing.map((champion) => champion.name);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'does' : 'do';
  return `This floor is warded to ${label}. ${list} ${verb} not qualify.`;
}

/**
 * How a ward reads on the door.
 *
 * Takes the display names it needs rather than looking them up, because the same sentence
 * is drawn by a client holding the content bundle and by a server holding the cache, and a
 * lookup written twice is a lookup that disagrees once.
 */
export function restrictionLabel(restriction: TeamRestriction, displayName: string): string {
  switch (restriction.kind) {
    case 'element':
      return `${displayName} champions`;
    case 'faction':
      return displayName;
    case 'role':
      return `${displayName} champions`;
    case 'minRarity':
      return `${displayName} or better`;
  }
}

// ── Publish validation ──────────────────────────────────────────────────────

/**
 * Whether a tower's rules are usable, as a list of complaints.
 *
 * Same shape and same reasoning as `titanRuleProblems`: "ascending" is a statement about
 * the array as a whole, and an operator wants to be told which landing is out of order.
 */
export function spireRuleProblems(rules: SpireRules, floors: number): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  let previous = 0;
  for (const [index, landing] of rules.landings.entries()) {
    if (keys.has(landing.key)) problems.push(`Landing "${landing.key}" is listed twice.`);
    keys.add(landing.key);
    if (landing.floor <= previous) {
      problems.push(
        `Landing ${index + 1} ("${landing.name}") is at floor ${landing.floor}, which is not above the one below it.`,
      );
    }
    previous = Math.max(previous, landing.floor);
    if (landing.floor > floors) {
      problems.push(
        `Landing "${landing.name}" is at floor ${landing.floor}, past the top of the tower at ${floors}.`,
      );
    }
    if (Object.keys(landing.rewards).length === 0) {
      problems.push(`Landing "${landing.key}" pays nothing.`);
    }
  }
  return problems;
}

/**
 * The smallest team a warded floor could ever be climbed by — four, unless content is thin.
 *
 * Publish validation's job here is the one thing it *can* know that an operator cannot see
 * from the editor: how many champions in the whole game satisfy a ward. Mistvale's roster
 * is 37 champions over eight factions, and three of those factions hold two or three
 * champions each — so a floor warded to the Drowned Choir would be a floor **no account
 * can ever pass**, and it would publish cleanly and look fine until somebody reached it.
 *
 * Counting food out matters: food champions cannot be fielded, so a faction propped up to
 * four by two Mistbrew-fodder entries is still a dead end.
 */
export function restrictionSupply(
  restriction: TeamRestriction,
  champions: readonly (RestrictableChampion & { isFood?: boolean })[],
): number {
  return champions.filter((champion) => !champion.isFood && championMeets(restriction, champion))
    .length;
}

/** How many champions a warded floor needs to exist before it is climbable at all. */
export const WARD_MIN_SUPPLY = 4;

// ── What the screen reads ───────────────────────────────────────────────────

export const spireWardSchema = z.object({
  kind: z.string(),
  value: z.string(),
  /** The rule as a phrase — "Tide champions", "Emberclan", "Rare or better". */
  label: z.string(),
});
export type SpireWard = z.infer<typeof spireWardSchema>;

export const spireFloorSchema = z.object({
  floor: z.number().int(),
  stageKey: z.string(),
  /** Every Nth floor by the tower's own rule. Drawn differently, fought the same. */
  boss: z.boolean(),
  cleared: z.boolean(),
  /** The next floor up from the highest cleared — the one a key would be spent on. */
  current: z.boolean(),
  ward: spireWardSchema.nullable(),
  /** Turn limit for the floor's three stars, so the screen need not open the stage. */
  maxTurns: z.number().int(),
});
export type SpireFloor = z.infer<typeof spireFloorSchema>;

export const spireLandingStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  floor: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  reached: z.boolean(),
  claimed: z.boolean(),
});
export type SpireLandingState = z.infer<typeof spireLandingStateSchema>;

export const spireViewSchema = z.object({
  dungeonKey: z.string(),
  name: z.string(),
  tagline: z.string(),
  lore: z.string(),
  backgroundAsset: z.string(),
  open: z.boolean(),
  /** Why it is shut, phrased for the player. Null when it is open. */
  lockedReason: z.string().nullable(),
  /** The climb this is — `YYYY-MM`. Changes with the month, and the climb resets with it. */
  anchor: z.string(),
  /** The game-day the current climb ends on, so "how long have I got" is on the screen. */
  closesOn: z.string(),
  keysLeft: z.number().int(),
  keysPerDay: z.number().int(),
  highestFloor: z.number().int(),
  /** The best this account has ever managed, across every climb. Bragging, not gating. */
  bestEverFloor: z.number().int(),
  floors: z.array(spireFloorSchema),
  landings: z.array(spireLandingStateSchema),
});
export type SpireView = z.infer<typeof spireViewSchema>;

export const spireOverviewSchema = z.object({
  /** The server's idea of today, so the keys and the rollover cannot disagree. */
  today: z.string(),
  spires: z.array(spireViewSchema),
});
export type SpireOverview = z.infer<typeof spireOverviewSchema>;

export const NO_SPIRES: SpireOverview = { today: '', spires: [] };

/** What a cleared floor paid, carried back on the battle's reward summary. */
export const spireClimbSchema = z.object({
  dungeonKey: z.string(),
  floor: z.number().int(),
  /** True when this clear moved the account's highest floor this month. */
  advanced: z.boolean(),
  highestFloor: z.number().int(),
  keysLeft: z.number().int(),
  /** Landings this clear brought into reach, ready to collect on the tower's own screen. */
  landingsReached: z.array(z.string()),
});
export type SpireClimb = z.infer<typeof spireClimbSchema>;

export const spireClaimRequestSchema = z.object({
  landingKey: z.string().min(1).max(64),
  actionId: z.string().min(8).max(64),
});

/** The last game-day of a climb's month, for the "closes on" line. */
export function spireClosesOn(anchor: string): string {
  const [year, month] = anchor.split('-').map(Number);
  if (!year || !month) return anchor;
  // Day 0 of the *next* month is the last day of this one, and `Date` does the leap year.
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

/** The landings a climb has reached, in order. Pure, so the screen and the payout agree. */
export function landingsUpTo(
  highestFloor: number,
  landings: readonly SpireLanding[],
): SpireLanding[] {
  return landings.filter((landing) => landing.floor <= highestFloor);
}
