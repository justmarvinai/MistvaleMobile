import { z } from 'zod';
import { STATS } from '../enums';

/**
 * The mastery effect DSL — the contract between mastery content and the engine.
 *
 * The same arrangement skills use, and for the same reason: a mastery *node* is data, so
 * adding one is an Admin edit, while a genuinely new *kind* of effect is an engine change.
 * The 48 nodes CONTENT_PLAN_EA01 §6 authors all compose out of the twenty-one effects
 * below; publish validation refuses anything else, so a node can never go live promising
 * a behaviour nothing runs.
 *
 * Two of these are settled *before* a battle rather than inside one: an unconditional
 * `stat` folds into the champion's assembled bonuses exactly as gear does, and
 * `setBonusAmplify` scales the relic set bonuses during that same assembly. That is why
 * the champion screen can show what masteries are worth next to what relics are worth —
 * they arrive by the same road.
 */

/** When a conditional effect applies. Evaluated against live battle state. */
export const masteryConditionSchema = z.discriminatedUnion('type', [
  /** The target is holding a Shield. */
  z.object({ type: z.literal('targetShielded') }),
  /** The target is under Stun, Freeze, Sleep or Provoke. */
  z.object({ type: z.literal('targetCrowdControlled') }),
  z.object({ type: z.literal('targetHpBelow'), pct: z.number().min(1).max(100) }),
  /** The target's maximum HP exceeds the attacker's — "fell the great". */
  z.object({ type: z.literal('targetMaxHpAbove') }),
  z.object({ type: z.literal('selfHpBelow'), pct: z.number().min(1).max(100) }),
  /** Scales with how many debuffs the holder is carrying. */
  z.object({ type: z.literal('perOwnDebuff'), maxStacks: z.number().int().min(1).max(10) }),
  /** Scales with living enemies. */
  z.object({ type: z.literal('perLivingEnemy'), maxStacks: z.number().int().min(1).max(10) }),
  /** The holder has no buffs at all. */
  z.object({ type: z.literal('selfHasNoBuffs') }),
  /** The incoming skill hit more than one target. */
  z.object({ type: z.literal('aoeSkill') }),
  /** Only in one battle mode — the Arena node. */
  z.object({ type: z.literal('mode'), mode: z.enum(['arena']) }),
]);
export type MasteryCondition = z.infer<typeof masteryConditionSchema>;

/** What a turn-meter proc fires on. */
export const MASTERY_TM_TRIGGERS = [
  'ownBuffExpired',
  'ownDebuffExpired',
  'allyDied',
  'debuffsLandedInTurn',
] as const;

/** What a counterattack proc fires on. */
export const MASTERY_COUNTER_TRIGGERS = ['heavyHit', 'allyCrowdControlled'] as const;

export const MASTERY_EFFECT_TYPES = [
  'stat',
  'damageDealt',
  'damageTaken',
  'lifesteal',
  'onKill',
  'battleStartShield',
  'cooldownProc',
  'healing',
  'redirect',
  'counterProc',
  'counterDamage',
  'protectionBonus',
  'cleanseProc',
  'turnMeterProc',
  'debuffChance',
  'setBonusAmplify',
  'a1Ramp',
  'firstStrike',
  'statusDuration',
  'bonusDamageMaxHp',
  'lastStand',
] as const;
export type MasteryEffectType = (typeof MASTERY_EFFECT_TYPES)[number];

export const masteryEffectSchema = z.discriminatedUnion('type', [
  /**
   * A stat addition. Flat points, or a percentage of the champion's assembled stat.
   *
   * Without a condition this never reaches the engine at all: the server folds it into the
   * champion's bonuses before the fight, so it shows on the champion screen and needs no
   * per-turn work. With one, the engine applies it while the condition holds.
   */
  z.object({
    type: z.literal('stat'),
    stat: z.enum(STATS),
    flat: z.number().min(-500).max(5000).default(0),
    pct: z.number().min(-100).max(100).default(0),
    condition: masteryConditionSchema.optional(),
  }),
  /** Outgoing damage, as a percentage. */
  z.object({
    type: z.literal('damageDealt'),
    pct: z.number().min(-100).max(100),
    condition: masteryConditionSchema.optional(),
  }),
  /** Incoming damage, as a percentage. Negative reduces. */
  z.object({
    type: z.literal('damageTaken'),
    pct: z.number().min(-100).max(100),
    condition: masteryConditionSchema.optional(),
  }),
  /** Heals the holder for a share of the damage it deals. */
  z.object({
    type: z.literal('lifesteal'),
    pct: z.number().min(1).max(100),
    condition: masteryConditionSchema.optional(),
  }),
  /** On a kill: stack a stat up to a cap, gain a shield, or both. */
  z.object({
    type: z.literal('onKill'),
    stat: z.enum(STATS).optional(),
    flat: z.number().min(0).max(500).default(0),
    maxStacks: z.number().int().min(1).max(10).default(1),
    shieldPctMaxHp: z.number().min(0).max(100).default(0),
  }),
  z.object({
    type: z.literal('battleStartShield'),
    pctMaxHp: z.number().min(1).max(100),
    turns: z.number().int().min(1).max(6).default(2),
  }),
  /** A chance to knock a turn off a random cooldown when a hit lands hard enough. */
  z.object({
    type: z.literal('cooldownProc'),
    chance: z.number().min(0).max(1),
    /** Only hits taking at least this share of the target's maximum HP qualify. */
    minDamagePctMaxHp: z.number().min(0).max(100).default(0),
  }),
  z.object({
    type: z.literal('healing'),
    mode: z.enum(['dealt', 'received', 'shieldReceived']),
    pct: z.number().min(-100).max(100),
  }),
  /** Takes a share of damage aimed at allies. */
  z.object({ type: z.literal('redirect'), pct: z.number().min(1).max(50) }),
  z.object({
    type: z.literal('counterProc'),
    trigger: z.enum(MASTERY_COUNTER_TRIGGERS),
    chance: z.number().min(0).max(1),
    /** `heavyHit` only: the share of maximum HP a single blow must cost. */
    hpLostPct: z.number().min(1).max(100).default(25),
  }),
  /** Counterattack damage, from any source — a status or a mastery proc. */
  z.object({ type: z.literal('counterDamage'), pct: z.number().min(-100).max(200) }),
  z.object({ type: z.literal('protectionBonus'), pct: z.number().min(1).max(100) }),
  z.object({
    type: z.literal('cleanseProc'),
    chance: z.number().min(0).max(1),
    count: z.number().int().min(1).max(3).default(1),
  }),
  z.object({
    type: z.literal('turnMeterProc'),
    trigger: z.enum(MASTERY_TM_TRIGGERS),
    chance: z.number().min(0).max(1).default(1),
    pct: z.number().min(-100).max(100),
    target: z.enum(['self', 'team']).default('self'),
    /** `debuffsLandedInTurn` only: how many have to land before it fires. */
    threshold: z.number().int().min(1).max(6).default(1),
  }),
  /** Adds to the chance a debuff sticks, before the ACC/RES contest. */
  z.object({
    type: z.literal('debuffChance'),
    pct: z.number().min(-50).max(50),
    /** Restricts it to Stun/Freeze/Sleep/Provoke. */
    hardCcOnly: z.boolean().default(false),
  }),
  /** Scales the relic *set* bonuses this champion is getting. Applied during assembly. */
  z.object({ type: z.literal('setBonusAmplify'), pct: z.number().min(1).max(100) }),
  /** Repeated A1 use ramps its damage, resetting when another skill is cast. */
  z.object({
    type: z.literal('a1Ramp'),
    pctPerUse: z.number().min(1).max(20),
    maxPct: z.number().min(1).max(100),
  }),
  /** Drains a target's meter the first time this champion's A1 reaches it. */
  z.object({ type: z.literal('firstStrike'), pct: z.number().min(1).max(100) }),
  z.object({
    type: z.literal('statusDuration'),
    mode: z.enum(['ownDebuffs', 'allyBuffs']),
    chance: z.number().min(0).max(1),
    turns: z.number().int().min(1).max(2).default(1),
    /** Hard crowd control is excluded, so this can never extend a stun-lock. */
    excludeHardCc: z.boolean().default(false),
  }),
  /** The Warmaster-analog: a chance at bonus damage scaled off the target's maximum HP. */
  z.object({
    type: z.literal('bonusDamageMaxHp'),
    chance: z.number().min(0).max(1),
    pct: z.number().min(1).max(50),
    /** The same proc against a boss, deliberately far smaller. */
    bossPct: z.number().min(0).max(50),
  }),
  /** Survives one lethal blow per battle at 1 HP. */
  z.object({ type: z.literal('lastStand') }),
]);
export type MasteryEffect = z.infer<typeof masteryEffectSchema>;

export const MASTERY_TREES = ['onslaught', 'bulwark', 'insight'] as const;
export type MasteryTree = (typeof MASTERY_TREES)[number];

export const MASTERY_MIN_TIER = 1;
export const MASTERY_MAX_TIER = 6;

export const masteryDefSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Keys are lowercase snake_case, starting with a letter.'),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  name: z.string().min(1).max(48),
  description: z.string().max(400).default(''),
  tree: z.enum(MASTERY_TREES),
  tier: z.number().int().min(MASTERY_MIN_TIER).max(MASTERY_MAX_TIER),
  icon: z.string().max(64).default(''),
  /** Everything the node does. Most have one; a few pair two halves of one idea. */
  effects: z.array(masteryEffectSchema).min(1).max(4),
});
export type MasteryDef = z.infer<typeof masteryDefSchema>;
export type MasteryDefInput = z.input<typeof masteryDefSchema>;
