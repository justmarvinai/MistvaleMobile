import { z } from 'zod';
import { championStatsSchema, gearInstanceSchema } from './gear';

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
  }),
});
export type ChampionDetail = z.infer<typeof championDetailSchema>;

// ── Requests ────────────────────────────────────────────────────────────────

export const levelUpRequestSchema = z.object({
  /** Roster ids to consume. Locked, favourited and equipped champions are refused. */
  foodIds: z.array(z.string().uuid()).min(1).max(20),
  actionId: z.string().min(8).max(64),
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
