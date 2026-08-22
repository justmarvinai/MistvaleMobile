import { z } from 'zod';

/**
 * The goal DSL.
 *
 * Every quest, mission and event milestone in Mistvale is a *goal* — "win 7 campaign
 * battles", "reach Silver in the Arena", "upgrade a relic to +12" — and every one of them
 * is satisfied by the same thing: something the player did, reported once, to one place.
 *
 * That one place is `ProgressService.track`. Nothing in the game knows what a quest is;
 * the battle module reports that a battle was won and the summon module reports that a
 * pull happened, and whatever happens to be listening advances. Adding a fourth listener
 * later — the tutorial, a battle pass, a guild — is a subscriber, not a change to any of
 * the modules that report (docs/DATA_MODEL.md §player_quests).
 *
 * A goal is deliberately *data*: type, target, and a handful of filters, all publish-
 * validated against the registry below. That is what lets an operator write a new daily in
 * the Admin Suite without a deploy, which is the hard rule this whole file exists to serve.
 */

// ── What the game reports ───────────────────────────────────────────────────

/**
 * Every kind of thing a player can do that something might be counting.
 *
 * Adding one is a line here plus a `track` call at the place it happens — and then it is
 * immediately available to quests, missions and events alike, because none of them know
 * about each other.
 */
export const GOAL_TYPES = [
  /** A battle won. Filter: `mode`. */
  'battleWin',
  /** A stage cleared for the first time or the hundredth. Filters: `mode`, `stageKey`. */
  'stageClear',
  /** A boss stage won — the seventh of a chapter, or a dungeon floor boss. */
  'bossKill',
  /** Energy actually spent. Advances by the amount, not by one. */
  'useEnergy',
  /** A summon pull. Filter: `poolKey`. Advances by the number of champions pulled. */
  'summon',
  /** One relic upgrade attempt, successful or not — the attempt is the activity. */
  'gearUpgrade',
  /** A relic put on a champion. Filter: `slot`. Re-equipping the same piece counts again. */
  'gearEquip',
  /** The highest relic level reached. A *threshold* goal: progress is a high-water mark. */
  'gearLevel',
  /** A champion levelled by feeding food. Advances by levels gained. */
  'championLevelUp',
  /** A champion ranked up. Filter: `rank` (the rank reached). */
  'championRankUp',
  /** A champion ascended. */
  'championAscend',
  'championAwaken',
  /** A mastery node learned. */
  'masteryLearn',
  /** A purchase in a shop. Filter: `shopKey`. */
  'shopPurchase',
  /** An arena attack fought, win or lose — the fight is the activity. */
  'arenaBattle',
  /** An arena attack won. */
  'arenaWin',
  /** The highest arena tier held. A threshold goal, matched by ladder position. */
  'arenaTier',
  /** Stars held in one chapter. Threshold. Filter: `chapterKey`. */
  'chapterStars',
  /** A dungeon floor cleared. Filter: `dungeonKey`. */
  'dungeonClear',
  /** Account level reached. Threshold. */
  'accountLevel',
  /** One quest claimed. Filter: `period`. */
  'questClaim',
  /** The player claimed a full day of dailies — what the weeklies are built on. */
  'claimAllDailies',
  /** A champion added to the roster, however it arrived. */
  'championObtained',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/**
 * How a goal accumulates.
 *
 * `count` sums what happened — "win 7 battles" is seven reports of one. `highest` keeps a
 * high-water mark instead — "reach +12 on a relic" is satisfied by the best relic so far,
 * and must not be satisfied by upgrading twelve relics to +1. Getting this wrong is the
 * classic quest bug, so it is a property of the type rather than of each goal.
 */
export const GOAL_ACCUMULATION: Readonly<Record<GoalType, 'count' | 'highest'>> = Object.freeze({
  battleWin: 'count',
  stageClear: 'count',
  bossKill: 'count',
  useEnergy: 'count',
  summon: 'count',
  gearUpgrade: 'count',
  gearEquip: 'count',
  gearLevel: 'highest',
  championLevelUp: 'count',
  championRankUp: 'count',
  championAscend: 'count',
  championAwaken: 'count',
  masteryLearn: 'count',
  shopPurchase: 'count',
  arenaBattle: 'count',
  arenaWin: 'count',
  arenaTier: 'highest',
  chapterStars: 'highest',
  dungeonClear: 'count',
  accountLevel: 'highest',
  questClaim: 'count',
  claimAllDailies: 'count',
  championObtained: 'count',
});

/**
 * The filters each goal type understands.
 *
 * Publish validation refuses a goal carrying a filter its type does not declare, which is
 * what stops `{type:'summon', mode:'campaign'}` — a goal that would look reasonable in the
 * editor and silently never complete.
 */
export const GOAL_FILTERS: Readonly<Record<GoalType, readonly string[]>> = Object.freeze({
  battleWin: ['mode'],
  stageClear: ['mode', 'stageKey'],
  bossKill: ['mode'],
  useEnergy: [],
  summon: ['poolKey'],
  gearUpgrade: [],
  gearEquip: ['slot'],
  gearLevel: [],
  championLevelUp: [],
  championRankUp: ['rank'],
  championAwaken: ['awakening'],
  championAscend: [],
  masteryLearn: [],
  shopPurchase: ['shopKey'],
  arenaBattle: [],
  arenaWin: [],
  arenaTier: [],
  chapterStars: ['chapterKey'],
  dungeonClear: ['dungeonKey'],
  accountLevel: [],
  questClaim: ['period'],
  claimAllDailies: [],
  championObtained: ['rarity'],
});

// ── The goal itself ─────────────────────────────────────────────────────────

export const goalSchema = z
  .object({
    type: z.enum(GOAL_TYPES),
    /** How many, or how high for a threshold goal. */
    target: z.number().int().min(1).max(1_000_000),
    /**
     * Narrows what counts, e.g. `{mode: 'campaign'}`. Every key must be one the type
     * declares in `GOAL_FILTERS`; an unknown key fails publish validation rather than
     * quietly never matching.
     */
    filters: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  })
  .superRefine((goal, ctx) => {
    const allowed = GOAL_FILTERS[goal.type];
    for (const key of Object.keys(goal.filters)) {
      if (!allowed.includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['filters', key],
          message: `"${key}" is not a filter for ${goal.type}. Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
        });
      }
    }
  });
export type Goal = z.infer<typeof goalSchema>;

/**
 * One thing that happened, as the game reports it.
 *
 * `amount` is what it is worth: one battle, but sixty energy, or three levels from a
 * single feed. Facts are matched against a goal's filters — equal or absent — so a report
 * carries everything that might narrow it and the goal decides what it cares about.
 */
export interface GoalEvent {
  type: GoalType;
  amount?: number;
  facts?: Readonly<Record<string, string | number>>;
}

/** Whether an event satisfies a goal's filters. Absent facts never match a filter. */
export function goalMatches(goal: Goal, event: GoalEvent): boolean {
  if (goal.type !== event.type) return false;
  for (const [key, want] of Object.entries(goal.filters)) {
    if ((event.facts?.[key] ?? null) !== want) return false;
  }
  return true;
}

/**
 * The progress a goal should hold after an event, given what it held before.
 *
 * Capped at the target so a goal cannot read as 340/3, and so the "complete" test stays a
 * simple comparison everywhere it is made.
 */
export function advanceGoal(goal: Goal, before: number, event: GoalEvent): number {
  const amount = event.amount ?? 1;
  // Nothing reports a non-positive amount today, but if something ever does it must not
  // take progress *away* — a quest that un-completes itself is worse than one that stalls.
  if (amount <= 0) return Math.min(goal.target, Math.max(0, before));

  const next =
    GOAL_ACCUMULATION[goal.type] === 'highest' ? Math.max(before, amount) : before + amount;
  return Math.min(goal.target, Math.max(0, next));
}

/** A goal as a screen shows it: what it asks, how far along, and whether it is done. */
export const goalProgressSchema = z.object({
  goal: goalSchema,
  progress: z.number().int(),
  complete: z.boolean(),
});
export type GoalProgress = z.infer<typeof goalProgressSchema>;
