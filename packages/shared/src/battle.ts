import { z } from 'zod';
import { BATTLE_MODES, type BattleMode, type Difficulty } from './enums';
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

// ── Playback: speed, and skipping the recording ─────────────────────────────

/**
 * How fast a fight can be played back.
 *
 * Playback only: the speed divides the delay between events the server has already
 * decided, so it changes how long a player watches and nothing else. That is why the
 * ladder lives here rather than in the engine, and why the server does not police the
 * multiplier — there is no outcome to protect. What the server *does* own is which rungs
 * an account has reached, because that is progress and the client must never guess it.
 */
export const BATTLE_SPEEDS = [1, 2, 4, 6] as const;
export type BattleSpeed = (typeof BATTLE_SPEEDS)[number];

/**
 * Which campaign difficulty a speed is earned by finishing (owner, 2026-08-22).
 *
 * ×1 and ×2 are there from the first fight; ×4 is the reward for walking the whole vale on
 * Normal and ×6 for walking it again on Brutal. Absent means "always available", which is
 * how the two starting rungs are expressed without a special case.
 *
 * The top of the ladder is ×6 rather than ×8 at the owner's call (2026-08-22, "x8 is too
 * fast I think") — the rung moved, the condition that earns it did not.
 *
 * Seeded into `game_config` as `battle.speedUnlocks`, so the pairing is retuned in Admin
 * rather than in a release.
 */
export type SpeedUnlocks = Readonly<Record<string, Difficulty>>;

export const DEFAULT_SPEED_UNLOCKS: SpeedUnlocks = Object.freeze({
  '4': 'normal',
  '6': 'brutal',
});

/**
 * The speeds an account may play at, given which campaign difficulties it has finished.
 *
 * Always includes ×1, whatever the config says: a fight nobody can watch at any speed is
 * not a state an operator should be able to author by mistake.
 */
export function speedsFor(
  finished: Readonly<Partial<Record<Difficulty, boolean>>>,
  unlocks: SpeedUnlocks = DEFAULT_SPEED_UNLOCKS,
): BattleSpeed[] {
  const open = BATTLE_SPEEDS.filter((speed) => {
    const needs = unlocks[String(speed)];
    return needs === undefined || finished[needs] === true;
  });
  return open.length > 0 ? [...open] : [1];
}

/** Clamps a remembered speed to what is actually open, for a client reading its own store. */
export function clampSpeed(speed: number, open: readonly BattleSpeed[]): BattleSpeed {
  const allowed = open.length > 0 ? open : ([1] as const);
  const match = allowed.find((entry) => entry === speed);
  return match ?? (allowed[allowed.length - 1] as BattleSpeed);
}

/**
 * Whether a fight may be skipped — jumped to its end without watching.
 *
 * The rule is the owner's (2026-08-22): a stage has to have been beaten at least once
 * before its fight can be skipped, so the first time down a road is a fight a player
 * actually sees. It applies to everything with a stage to have cleared — the campaign, the
 * Depths, and the practice sandbox, which already refuses a stage nobody has beaten.
 *
 * **The Arena is exempt**, because its "stage key" is an opponent rather than a place: no
 * arena fight is ever a repeat, so gating it would mean never skipping one at all, which
 * is a different rule from the one asked for. The tutorial's cold open is not exempt and
 * has no clear to its name — being watched is the entire point of it.
 *
 * **Decided server-side, obeyed client-side, and deliberately not refused at the
 * mutation.** Which stages an account has beaten is progress and the client must never
 * guess it, so the answer rides on the battle. But skipping resolves a fight the engine
 * was going to resolve identically either way — no outcome, no roll, no timer moves — so
 * there is nothing for a refusal to protect, and refusing the unbounded `auto` that Skip
 * sends would also block the legitimate "resolve this fight in one answer" that farming
 * tools and the suite use. Playback speed is gated exactly the same way and for exactly
 * the same reason. Anyone who defeats the check watches less animation and gains nothing.
 */
export function canSkipBattle(mode: BattleMode, clearedBefore: boolean): boolean {
  if (mode === 'arena') return true;
  return clearedBefore;
}
