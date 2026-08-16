import { z } from 'zod';
import { ELEMENTS, STATS } from '../enums';

/**
 * The skill effect DSL — the contract between content and the battle engine.
 *
 * A skill is not code: it is an ordered list of typed components that the engine
 * interprets (docs/COMBAT_SYSTEM.md §11). Adding a *skill* therefore needs no code at
 * all; only a genuinely new kind of effect is an engine change. This file is the single
 * definition of that vocabulary — the Admin composer builds these, the seeds are
 * validated against them, and publish refuses anything that does not fit.
 */

/** Which stat a damage/heal/shield component scales from. */
export const SCALING_STATS = ['atk', 'def', 'maxHp', 'spd'] as const;
export type ScalingStat = (typeof SCALING_STATS)[number];

/**
 * Who a component applies to, relative to the skill's own targets.
 *
 * `hitTargets` means "whatever this skill just struck", which is what on-hit debuffs
 * want; the rest address the caster's side explicitly.
 */
export const EFFECT_TARGETS = [
  'hitTargets',
  'self',
  'allAllies',
  'lowestHpAlly',
  'randomAlly',
  'allEnemies',
] as const;
export type EffectTarget = (typeof EFFECT_TARGETS)[number];

/** Conditions a component can be gated behind. */
export const effectConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('targetHasStatus'), status: z.string().min(1) }),
  z.object({ type: z.literal('targetMissingStatus'), status: z.string().min(1) }),
  z.object({ type: z.literal('selfHpBelow'), pct: z.number().min(0).max(100) }),
  z.object({ type: z.literal('targetHpBelow'), pct: z.number().min(0).max(100) }),
  z.object({ type: z.literal('alliesDead'), atLeast: z.number().int().min(1).max(3) }),
]);
export type EffectCondition = z.infer<typeof effectConditionSchema>;

/**
 * A single effect component.
 *
 * Kept flat and discriminated so the Admin editor can render one form per type and the
 * engine can switch on `type` without casting.
 */
const baseComponent = {
  /** Optional gate; when present the component only runs if the condition holds. */
  condition: effectConditionSchema.optional(),
  /** Chance 0–1 that this component applies at all (before ACC/RES for debuffs). */
  chance: z.number().min(0).max(1).optional(),
};

export const effectComponentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('damage'),
    scale: z.enum(SCALING_STATS),
    /** Multiplier against the scaling stat, e.g. 3.6 × ATK. */
    mult: z.number().min(0).max(20),
    /** Number of separate hits; each rolls crit and on-hit effects independently. */
    hits: z.number().int().min(1).max(6).default(1),
    /** Fraction of the target's DEF ignored, 0–1. */
    ignoreDefPct: z.number().min(0).max(1).optional(),
    /** Overrides the caster's element for this component (rare; boss kits). */
    element: z.enum(ELEMENTS).optional(),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('applyStatus'),
    status: z.string().min(1),
    turns: z.number().int().min(1).max(10),
    target: z.enum(EFFECT_TARGETS).default('hitTargets'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('heal'),
    scale: z.enum(SCALING_STATS),
    mult: z.number().min(0).max(5),
    target: z.enum(EFFECT_TARGETS).default('self'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('shield'),
    scale: z.enum(SCALING_STATS),
    mult: z.number().min(0).max(5),
    turns: z.number().int().min(1).max(10),
    target: z.enum(EFFECT_TARGETS).default('self'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('turnMeter'),
    /** Signed percentage of a full bar: +30 fills, −30 depletes. */
    deltaPct: z.number().min(-100).max(100),
    target: z.enum(EFFECT_TARGETS).default('hitTargets'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('cleanse'),
    /** How many debuffs to remove; `all` clears the bar. */
    count: z.union([z.number().int().min(1).max(10), z.literal('all')]),
    target: z.enum(EFFECT_TARGETS).default('allAllies'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('dispel'),
    count: z.union([z.number().int().min(1).max(10), z.literal('all')]),
    target: z.enum(EFFECT_TARGETS).default('hitTargets'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('extraTurn'),
    ...baseComponent,
  }),
  z.object({
    type: z.literal('cooldown'),
    /** Negative reduces the caster's own cooldowns; positive extends enemies'. */
    delta: z.number().int().min(-3).max(3),
    target: z.enum(EFFECT_TARGETS).default('self'),
    ...baseComponent,
  }),
]);

export type EffectComponent = z.infer<typeof effectComponentSchema>;
export type EffectComponentType = EffectComponent['type'];

/** Every component type the engine implements. Publish validates against this list. */
export const EFFECT_COMPONENT_TYPES = [
  'damage',
  'applyStatus',
  'heal',
  'shield',
  'turnMeter',
  'cleanse',
  'dispel',
  'extraTurn',
  'cooldown',
] as const;

/** How a skill picks its targets before components run. */
export const targetingSchema = z.object({
  side: z.enum(['enemy', 'ally', 'self']),
  mode: z.enum(['single', 'all', 'random', 'lowestHp', 'self']),
  /** For `random`: how many separate targets to pick. */
  count: z.number().int().min(1).max(4).optional(),
});
export type Targeting = z.infer<typeof targetingSchema>;

/** One rung of a skill's tome upgrade ladder. */
export const skillUpgradeSchema = z.discriminatedUnion('effect', [
  z.object({ effect: z.literal('damage'), pct: z.number().min(1).max(25) }),
  z.object({ effect: z.literal('chance'), pct: z.number().min(1).max(25) }),
  z.object({ effect: z.literal('cooldown'), turns: z.literal(1) }),
  z.object({ effect: z.literal('heal'), pct: z.number().min(1).max(25) }),
  z.object({ effect: z.literal('shield'), pct: z.number().min(1).max(25) }),
]);
export type SkillUpgrade = z.infer<typeof skillUpgradeSchema>;

/** Hints that shape the AI without any per-champion code. */
export const aiHintsSchema = z.object({
  /** Preferred target when the skill leaves a choice. */
  prefer: z.enum(['lowestHp', 'highestAtk', 'highestTm', 'random', 'lowestHpAlly']).optional(),
  /** Use on the first turn of a wave if available. */
  openWith: z.boolean().optional(),
  /** Skip while this status is already on the intended target. */
  dontRepeatWhileActive: z.string().optional(),
  /** Only use when the caster is below this share of max HP. */
  onlyBelowHpPct: z.number().min(0).max(100).optional(),
});
export type AiHints = z.infer<typeof aiHintsSchema>;

/** Presentation binding: which animation track and visual effect a skill plays. */
export const skillAnimationSchema = z.object({
  track: z.enum(['attack', 'cast', 'idle']).default('attack'),
  vfx: z.string().optional(),
  /** Ranged skills send a projectile instead of stepping forward. */
  projectile: z.string().optional(),
  shake: z.boolean().optional(),
});

/** A champion's aura: one team-wide bonus, active only from the leader slot. */
export const auraSchema = z.object({
  stat: z.enum(STATS),
  /** Percentage for ratio stats, flat points for ACC/RES. */
  value: z.number().min(1).max(100),
  scope: z.enum(['all', 'element', 'faction']).default('all'),
  /** Which modes it applies in; `any` means everywhere. */
  area: z.enum(['any', 'campaign', 'arena', 'depths']).default('any'),
});
export type Aura = z.infer<typeof auraSchema>;
