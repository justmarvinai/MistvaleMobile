import type {
  BattleMode,
  Element,
  EffectComponent,
  SkillDef,
  StatusDef,
  Stat,
} from '@mistvale/shared';
import type { RngState } from './rng';

/**
 * The battle state and the event log.
 *
 * `BattleState` is plain data with no methods and no references to anything outside it,
 * so it serialises whole, resumes exactly, and can be diffed in the Admin inspector
 * (docs/COMBAT_SYSTEM.md §13).
 *
 * The event log is the *only* contract the client renders from. Every event carries a
 * complete payload — the numbers, who they applied to, what changed — because the client
 * computes no game math (CLAUDE.md hard rule). If a floater needs a value, that value is
 * in the event.
 */

export type Side = 'ally' | 'enemy';

/** Where a unit stands. Slots are stable for the life of a battle. */
export interface UnitRef {
  side: Side;
  slot: number;
}

/** One live status on a unit. */
export interface StatusInstance {
  /** `status_defs` key. */
  key: string;
  /** Turns left; decremented at the end of the holder's turn. */
  turns: number;
  /** Who applied it — needed by Leech and for attribution in the log. */
  source: UnitRef | null;
  /** Poison is the only stacking family; everything else sits at 1. */
  stacks: number;
  /** Absorb remaining, for shields only. */
  shield?: number;
}

/** A combatant. Both teams use the same shape so every rule applies symmetrically. */
export interface BattleUnit {
  ref: UnitRef;
  /** `champion_defs` or `enemy_defs` key. */
  defKey: string;
  name: string;
  element: Element;
  level: number;
  /** Stats after the out-of-battle pipeline: base, gear, sets, Hall, masteries, aura. */
  stats: Readonly<Record<Stat, number>>;
  maxHp: number;
  hp: number;
  /** Turn meter in [0, 100); a unit acts at 100 and keeps the overflow. */
  tm: number;
  skills: readonly string[];
  /** Remaining cooldown per skill key; absent or 0 means ready. */
  cooldowns: Record<string, number>;
  buffs: StatusInstance[];
  debuffs: StatusInstance[];
  alive: boolean;
  isBoss: boolean;
  /** Boss flags, copied from `enemy_defs.boss_mechanics`. */
  boss: BossFlags;
  /** Consecutive hard CC landed, for the Arena anti-perma-stun rule (§7). */
  ccStreak: number;
  /** Per-battle bookkeeping for the boss mechanics. Present only on bosses that need it. */
  bossState?: BossRuntime;
  /** Set when the unit has already been saved from lethal damage this battle. */
  usedLastStand?: boolean;
}

/**
 * Composable boss behaviours, copied from `enemy_defs.boss_mechanics` at setup.
 *
 * Every one of these is a *promise the content makes to the player*, so the engine either
 * runs it or the content may not name it. The two immunity flags shape what can be done to
 * a boss; the four below shape what the boss does back (docs/COMBAT_SYSTEM.md §8).
 */
export interface BossFlags {
  /** Immune to Stun/Freeze/Sleep/Provoke — the baseline for every boss. */
  almightyImmunity: boolean;
  tmReductionImmune: boolean;
  /** Hit-counter shield: break it before the boss acts, or the whole team is punished. */
  hitShield?: { hits: number; punishTmPct: number };
  /** Retaliates each time its HP falls through another band. */
  thresholdRetaliation?: { perHpPct: number; skipIfDot: boolean };
  /**
   * Calls adds at the start of its turn.
   *
   * The add is carried as a fully built unit rather than a content key: the engine reads
   * no content at runtime, so whatever a summon is, it is decided once at setup.
   */
  addSummon?: { perTurn: number; cap: number; template: BattleUnit };
  /** Damage ramp after a grace period, so a fight cannot be stalled forever. */
  enrage?: { afterTurn: number; dmgPctPerTurn: number };
}

/** What the boss mechanics remember between turns. */
export interface BossRuntime {
  /** Hits the shield still absorbs. Zero means it is down and the boss is hurtable. */
  shieldHits: number;
  /** Set on the turn the boss forfeits to a broken shield; cleared when it comes back up. */
  shieldRecovering: boolean;
  /** How many HP bands have already been retaliated for, counted from full. */
  bandsPassed: number;
  /** True once the enrage ramp has been announced, so it is announced once. */
  enraged: boolean;
}

/** Everything the simulation needs that is not part of mutable state. */
export interface BattleRules {
  mode: BattleMode;
  /** Skills and statuses by key, from the published content snapshot. */
  skills: ReadonlyMap<string, SkillDef>;
  statuses: ReadonlyMap<string, StatusDef>;
}

export type BattleOutcome = 'victory' | 'defeat' | 'retreat' | 'turnLimit';

export interface BattleState {
  seed: number;
  rngState: RngState;
  mode: BattleMode;
  /** Wave index the battle is on, 0-based. */
  wave: number;
  /** Enemy waves still to come, as unit templates. */
  pendingWaves: BattleUnit[][];
  allies: BattleUnit[];
  enemies: BattleUnit[];
  /** Total unit turns taken; the hard cap counts these. */
  turn: number;
  /** The unit whose turn it is, when the battle is waiting for a manual action. */
  awaiting: UnitRef | null;
  finished: boolean;
  outcome: BattleOutcome | null;
  /** Monotonic id for the next event; lets a client resume a log by index. */
  nextEventId: number;
}

// ── Events ──────────────────────────────────────────────────────────────────

export type HitQuality = 'normal' | 'strong' | 'weak';

/** Discriminated on `type`; the client switches on it to drive presentation. */
export type BattleEvent =
  | {
      id: number;
      type: 'battleStart';
      wave: number;
      allies: UnitSnapshot[];
      enemies: UnitSnapshot[];
    }
  | { id: number; type: 'waveStart'; wave: number; enemies: UnitSnapshot[] }
  | { id: number; type: 'waveCleared'; wave: number; healed: { unit: UnitRef; amount: number }[] }
  | { id: number; type: 'turnStart'; unit: UnitRef; turn: number }
  | { id: number; type: 'turnSkipped'; unit: UnitRef; reason: 'stun' | 'freeze' | 'sleep' }
  | { id: number; type: 'skillUsed'; unit: UnitRef; skill: string; targets: UnitRef[] }
  | {
      id: number;
      type: 'damage';
      source: UnitRef;
      target: UnitRef;
      amount: number;
      /** Absorbed by a shield rather than taken as HP loss. */
      absorbed: number;
      quality: HitQuality;
      crit: boolean;
      hitIndex: number;
      hits: number;
      /** Present when Ally Protection redirected part of the blow. */
      redirectedFrom?: UnitRef;
      /** Damage that bypasses DEF and shields: DoTs and %-HP procs. */
      trueDamage?: boolean;
      remainingHp: number;
    }
  | {
      id: number;
      type: 'heal';
      source: UnitRef | null;
      target: UnitRef;
      amount: number;
      remainingHp: number;
    }
  | { id: number; type: 'shieldGained'; target: UnitRef; amount: number; turns: number }
  | {
      id: number;
      type: 'statusApplied';
      source: UnitRef | null;
      target: UnitRef;
      status: string;
      turns: number;
      stacks: number;
    }
  | {
      id: number;
      type: 'statusResisted';
      source: UnitRef;
      target: UnitRef;
      status: string;
      reason: 'resist' | 'blocked' | 'immune' | 'full';
    }
  | { id: number; type: 'statusExpired'; target: UnitRef; status: string }
  | {
      id: number;
      type: 'statusRemoved';
      target: UnitRef;
      status: string;
      by: 'cleanse' | 'dispel' | 'broken';
    }
  | {
      id: number;
      type: 'turnMeter';
      source: UnitRef | null;
      target: UnitRef;
      deltaPct: number;
      value: number;
    }
  | { id: number; type: 'cooldownChanged'; unit: UnitRef; skill: string; value: number }
  | { id: number; type: 'extraTurn'; unit: UnitRef }
  | { id: number; type: 'counterattack'; unit: UnitRef; target: UnitRef }
  | { id: number; type: 'reflected'; unit: UnitRef; target: UnitRef; amount: number }
  | { id: number; type: 'unkillable'; unit: UnitRef }
  /** The hit-counter shield changed: `hits` left, and whether it is still standing. */
  | { id: number; type: 'bossShield'; unit: UnitRef; hits: number; up: boolean }
  /** The shield survived to the boss's turn, and the team pays for it. */
  | { id: number; type: 'bossPunish'; unit: UnitRef; tmPct: number }
  /** The shield was broken in time: the boss forfeits this turn while it recovers. */
  | { id: number; type: 'bossExposed'; unit: UnitRef }
  /** The boss struck back for crossing an HP band. */
  | { id: number; type: 'bossRetaliate'; unit: UnitRef; target: UnitRef }
  /** Adds arrived. They occupy the refs in the snapshots, replacing anything there. */
  | { id: number; type: 'bossSummon'; unit: UnitRef; summoned: UnitSnapshot[] }
  /** The damage ramp has started; `pct` is the bonus applied from here on. */
  | { id: number; type: 'bossEnraged'; unit: UnitRef; pct: number }
  | { id: number; type: 'died'; unit: UnitRef }
  | { id: number; type: 'battleEnd'; outcome: BattleOutcome; turns: number };

/**
 * An event before the log assigns its id.
 *
 * A plain `Omit<BattleEvent, 'id'>` collapses a union to the keys every member shares,
 * which here is just `type`. The conditional distributes over the union instead, so each
 * member keeps its own payload.
 */
export type BattleEventInput = BattleEvent extends infer E
  ? E extends { id: number }
    ? Omit<E, 'id'>
    : never
  : never;

/** A unit as the client first learns about it. */
export interface UnitSnapshot {
  ref: UnitRef;
  defKey: string;
  name: string;
  element: Element;
  level: number;
  maxHp: number;
  hp: number;
  stats: Readonly<Record<Stat, number>>;
  skills: readonly string[];
  isBoss: boolean;
}

/** What one `advance` produced. */
export interface StepResult {
  state: BattleState;
  events: BattleEvent[];
}

/** A manual action from the player. */
export interface BattleAction {
  skill: string;
  /** Required when the skill leaves a choice of target. */
  target?: UnitRef;
}

/** Resolved component plus the skill that owns it, for execution. */
export interface ComponentContext {
  component: EffectComponent;
  skill: SkillDef;
  caster: BattleUnit;
  /** Targets the skill selected, before per-component retargeting. */
  hitTargets: BattleUnit[];
}
