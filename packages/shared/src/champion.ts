import { z } from 'zod';
import { championStatsSchema, gearInstanceSchema } from './gear';
import { masteryStateSchema } from './mastery';

/**
 * Owned champions, and the four ladders they climb.
 *
 * Level, rank, ascension and skill tomes are separate progressions with separate costs
 * (GAME_DESIGN §7). Each has its own endpoint rather than one generic "spend" call,
 * because each has its own guard rails: rank-up eats champions, ascension eats essences,
 * and both are irreversible.
 */

export const rosterChampionSchema = z.object({
  id: z.string(),
  championKey: z.string(),
  level: z.number().int(),
  rank: z.number().int(),
  ascension: z.number().int(),
  /** Awakening level 0–6, the ladder that opens once every other one is finished. */
  awakening: z.number().int(),
  xp: z.number().int(),
  locked: z.boolean(),
  favourite: z.boolean(),
  /** Cap for the current rank; levelling stops here until a rank-up. */
  levelCap: z.number().int(),
  /** Experience still needed for the next level, or 0 at the cap. */
  xpToNextLevel: z.number().int(),
  power: z.number().int(),
  /** Relic ids by slot, for the roster grid's gear pips. */
  equippedGearIds: z.array(z.string()),
});
export type RosterChampion = z.infer<typeof rosterChampionSchema>;

export const championDetailSchema = z.object({
  champion: rosterChampionSchema,
  stats: championStatsSchema,
  gear: z.array(gearInstanceSchema),
  /** Tome levels applied per skill key. */
  skillUpgrades: z.record(z.string(), z.number().int()),
  /** Learned masteries, the picks still available, and what a reset would cost. */
  masteries: masteryStateSchema,
  /** What the next step on each ladder needs, so the client never guesses a cost. */
  costs: z.object({
    rankUp: z
      .object({
        /** Star rank the food must be, and how many of them. */
        foodRank: z.number().int(),
        foodCount: z.number().int(),
        silver: z.number().int(),
        /** Whether the champion is at its level cap, which rank-up requires. */
        atLevelCap: z.boolean(),
      })
      .nullable(),
    ascend: z
      .object({
        items: z.record(z.string(), z.number().int()),
        /** Ascension is capped by star rank — ★4 cannot pass Asc 4. */
        allowedByRank: z.boolean(),
      })
      .nullable(),
    /** Null when this rarity never awakens, or when it is already awakened 6. */
    awaken: z
      .object({
        items: z.record(z.string(), z.number().int()),
        silver: z.number().int(),
        /** Every gate awakening waits on, so the screen can say which one is shut. */
        ready: z.object({
          atMaxRank: z.boolean(),
          atLevelCap: z.boolean(),
          atMaxAscension: z.boolean(),
        }),
      })
      .nullable(),
    /** The star ceiling this champion's rarity allows, for the track the screen draws. */
    maxRank: z.number().int(),
  }),
});
export type ChampionDetail = z.infer<typeof championDetailSchema>;

// ── Requests ────────────────────────────────────────────────────────────────

export const levelUpRequestSchema = z
  .object({
    /** Roster ids to consume. Locked, favourited and equipped champions are refused. */
    foodIds: z.array(z.string().uuid()).max(20).default([]),
    /** Mistbrews to pour in. One kind, not one per breath. */
    brews: z.number().int().min(0).max(500).default(0),
    actionId: z.string().min(8).max(64),
  })
  .refine((value) => value.foodIds.length > 0 || value.brews > 0, {
    message: 'Feed something: champions, brews, or both.',
  });
export type LevelUpRequest = z.infer<typeof levelUpRequestSchema>;

export const rankUpRequestSchema = z.object({
  foodIds: z.array(z.string().uuid()).min(1).max(6),
  actionId: z.string().min(8).max(64),
});
export type RankUpRequest = z.infer<typeof rankUpRequestSchema>;

export const ascendRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type AscendRequest = z.infer<typeof ascendRequestSchema>;

export const awakenRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type AwakenRequest = z.infer<typeof awakenRequestSchema>;

/**
 * A skill upgrade, paid for one of two ways.
 *
 * Tomes are the item route; a duplicate of the same champion is the other, and is the
 * reason a second copy of a seven-champion pool is worth pulling. Either way the player
 * chooses the skill — a deliberate deviation from the source game's random books, flagged
 * in GAME_DESIGN §7.
 */
export const skillUpgradeRequestSchema = z.object({
  skillKey: z.string().min(2).max(64),
  source: z.union([
    z.object({ kind: z.literal('tome') }),
    z.object({ kind: z.literal('duplicate'), championId: z.string().uuid() }),
  ]),
  actionId: z.string().min(8).max(64),
});
export type SkillUpgradeRequest = z.infer<typeof skillUpgradeRequestSchema>;

export const championFlagsRequestSchema = z
  .object({
    locked: z.boolean().optional(),
    favourite: z.boolean().optional(),
  })
  .refine((value) => value.locked !== undefined || value.favourite !== undefined, {
    message: 'Set at least one flag.',
  });
export type ChampionFlagsRequest = z.infer<typeof championFlagsRequestSchema>;

export const releaseChampionsRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  actionId: z.string().min(8).max(64),
});
export type ReleaseChampionsRequest = z.infer<typeof releaseChampionsRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────────────

export const progressionResultSchema = z.object({
  champion: championDetailSchema,
  /** Roster ids consumed by this call, so the client can drop them from its list. */
  consumed: z.array(z.string()),
  silver: z.number().int(),
  /** Levels the champion actually gained, for the results flourish. */
  levelsGained: z.number().int().default(0),
});
export type ProgressionResult = z.infer<typeof progressionResultSchema>;

// ── Progress ────────────────────────────────────────────────────────────────

/**
 * One stage as a map renders it.
 *
 * `open` and `lockedReason` come from the same rule the battle route enforces, so a
 * player is never shown a door the server will slam — and when one is shut, they are told
 * why rather than left guessing.
 */
export const stageStandingSchema = z.object({
  stageKey: z.string(),
  stars: z.number().int(),
  clears: z.number().int(),
  bestTurns: z.number().int().nullable(),
  open: z.boolean(),
  lockedReason: z.string().nullable(),
});
export type StageStanding = z.infer<typeof stageStandingSchema>;

export const progressSchema = z.object({
  stages: z.array(stageStandingSchema),
  /** Total stars per chapter or dungeon, for the map headers. */
  parentStars: z.record(z.string(), z.number().int()),
  /** Star-chest tiers already claimed, per chapter. */
  claimedChests: z.record(z.string(), z.array(z.number().int())),
});
export type Progress = z.infer<typeof progressSchema>;
