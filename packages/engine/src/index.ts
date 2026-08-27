/**
 * @mistvale/engine — the pure battle engine.
 *
 * Rules: no IO, no `Date.now()`, no `Math.random()`, no database access. Everything the
 * simulation needs is injected, which is what makes battles reproducible and testable
 * (docs/COMBAT_SYSTEM.md §13).
 *
 * The server owns content and persistence; this package owns the fight. Give it content
 * definitions and a seed, and it returns state plus an event log — the only thing the
 * client ever renders from.
 */

export { createRng, createRngFromState, deriveSeed, type Rng, type RngState } from './rng';

export {
  DEFAULT_CHAMPION_SCALING,
  DEFAULT_COMBAT_CONFIG,
  championScalingFrom,
  combatConfigFrom,
  type ChampionScalingConfig,
  type CombatConfig,
} from './config';

export {
  clamp,
  damageTakenMultiplier,
  deriveStats,
  effectiveStat,
  healReceivedMultiplier,
} from './stats';

export { computeDamage, landChance, matchupOf, rollHitQuality, type Matchup } from './damage';

export {
  applyStatus,
  clearAllStatuses,
  isHardCc,
  removeStatus,
  skipReason,
  tickDurations,
} from './status';

export {
  advanceToNextActor,
  compareForTurnOrder,
  projectTurnOrder,
  resetMeters,
} from './turnmeter';

export { candidatesFor, living, resolveTargets, unitAt } from './targeting';

export {
  MAX_SIDE_SLOTS,
  bandsCrossed,
  enrageMultiplier,
  freeSlots,
  shieldStanding,
  summonAllowance,
} from './boss';

export {
  a1RampMultiplier,
  conditionalStatBonus,
  damageDealtMultiplier,
  hasMastery,
  healingMultiplier,
  masteryRuntime,
} from './mastery';

export { chooseSkill, hintsAllow, type SkillChoice } from './ai';

export {
  buildRules,
  buildStageWaves,
  buildTeam,
  buildWave,
  type ChampionEntry,
  type EnemyEntry,
} from './setup';

export { advance, createBattle, retreat, type BattleSetup } from './battle';

export { contributions } from './contribution';

export type {
  BattleAction,
  BattleEvent,
  BattleEventInput,
  BattleOutcome,
  BattleRules,
  BattleState,
  BattleUnit,
  BossFlags,
  BossRuntime,
  HitQuality,
  MasteryRuntime,
  Side,
  StatusInstance,
  StepResult,
  UnitContribution,
  UnitRef,
  UnitSnapshot,
} from './types';
