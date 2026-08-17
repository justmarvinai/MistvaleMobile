import { z } from 'zod';
import { BATTLE_MODES } from './enums';
import { gearInstanceSchema } from './gear';

/**
 * Multi-battle: the same fight, N times, resolved server-side.
 *
 * The farming backbone (GAME_DESIGN §9.1). A run is an ordinary battle in every respect —
 * same engine, same seeded rolls, same payout — so nothing about it is a shortcut except
 * that the player does not watch it. What comes back is a summary rather than N event
 * logs: at thirty runs the logs would be megabytes, and the whole point of multi-battle is
 * that you were not going to watch them.
 */

export const multiBattleRequestSchema = z.object({
  mode: z.enum(BATTLE_MODES),
  stageKey: z.string().min(2).max(64),
  team: z.array(z.string().uuid()).min(1).max(4),
  /** How many times. Bounded by the daily allowance and by energy, both server-checked. */
  runs: z.number().int().min(1).max(50),
  actionId: z.string().min(8).max(64),
});
export type MultiBattleRequest = z.infer<typeof multiBattleRequestSchema>;

/** One run, compressed to what a summary line needs. */
export const multiBattleRunSchema = z.object({
  outcome: z.enum(['victory', 'defeat', 'turnLimit']),
  turns: z.number().int(),
  stars: z.number().int(),
  silver: z.number().int(),
});
export type MultiBattleRun = z.infer<typeof multiBattleRunSchema>;

/**
 * Why a batch ran fewer times than it was asked to. `null` means it did not.
 *
 * `defeated` is the one that stops a batch mid-flight; the other three are decided before
 * the first fight, because a player is owed the reason their twenty became eight.
 */
export const MULTI_BATTLE_STOP_REASONS = [
  'defeated',
  'outOfEnergy',
  'dailyCap',
  'perCallLimit',
] as const;
export type MultiBattleStopReason = (typeof MULTI_BATTLE_STOP_REASONS)[number];

export const multiBattleResultSchema = z.object({
  /** Runs actually fought, which can be fewer than asked for. */
  runs: z.array(multiBattleRunSchema),
  /** Why it stopped short, when it did. */
  stoppedReason: z.enum(MULTI_BATTLE_STOP_REASONS).nullable(),
  wins: z.number().int(),
  /** Everything the whole run earned, already granted. */
  silver: z.number().int(),
  playerXp: z.number().int(),
  championXp: z.number().int(),
  levelsGained: z.number().int(),
  gear: z.array(gearInstanceSchema),
  items: z.record(z.string(), z.number().int()),
  /** Energy spent across the whole batch, and what is left. */
  energySpent: z.number().int(),
  energyLeft: z.number().int(),
  /** The daily allowance after this batch. */
  runsLeftToday: z.number().int(),
});
export type MultiBattleResult = z.infer<typeof multiBattleResultSchema>;

/** What the team-select screen needs to draw the multi-battle control. */
export const multiBattleStateSchema = z.object({
  unlocked: z.boolean(),
  /** Why not, when it is not. */
  lockedReason: z.string().nullable(),
  /** Runs left in today's allowance. */
  runsLeftToday: z.number().int(),
  /** The whole daily allowance, for the "12 / 30" line. */
  dailyCap: z.number().int(),
  /** The most runs that may be asked for in one call. */
  maxPerCall: z.number().int(),
});
export type MultiBattleState = z.infer<typeof multiBattleStateSchema>;
