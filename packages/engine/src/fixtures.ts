import type { SkillDef, Stat, StatusDef } from '@mistvale/shared';
import type { Rng } from './rng';
import type { BattleUnit, Side } from './types';

/**
 * Test fixtures.
 *
 * Deliberately hand-built rather than loaded from the seeds: a test that asserts "Poison
 * ticks for 5% of max HP" should fail when the *engine* breaks, not when someone
 * rebalances Poison in Admin. The seeded content is exercised separately, by the balance
 * simulator and the server's integration tests.
 *
 * Not exported from the package index — this module exists for tests only.
 */

export function status(
  key: string,
  kind: StatusDef['kind'],
  engineType: StatusDef['engineType'],
  params: Partial<StatusDef['params']> = {},
  extra: { family?: string; potency?: number } = {},
): StatusDef {
  return {
    key,
    sortOrder: 0,
    name: key,
    kind,
    engineType,
    family: extra.family ?? key,
    potency: extra.potency ?? 1,
    params: { tick: 'none', maxStacks: 1, ...params },
    icon: '',
    description: '',
  };
}

/** A catalogue mirroring the shipped statuses closely enough to test every behaviour. */
export const STATUSES: StatusDef[] = [
  status(
    'atk_up_25',
    'buff',
    'statModifier',
    { stat: 'atk', pct: 25 },
    { family: 'atk_up', potency: 1 },
  ),
  status(
    'atk_up_50',
    'buff',
    'statModifier',
    { stat: 'atk', pct: 50 },
    { family: 'atk_up', potency: 2 },
  ),
  status('def_up_30', 'buff', 'statModifier', { stat: 'def', pct: 30 }, { family: 'def_up' }),
  status('spd_up_30', 'buff', 'statModifier', { stat: 'spd', pct: 30 }, { family: 'spd_up' }),
  status('strengthen_25', 'buff', 'statModifier', { pct: -25 }, { family: 'strengthen' }),
  status('shield', 'buff', 'shield'),
  status('continuous_heal_15', 'buff', 'healOverTime', { tick: 'ownerTurnStart', tickPct: 15 }),
  status('counterattack', 'buff', 'counterattack', { ratio: 75 }),
  status('ally_protection_50', 'buff', 'allyProtection', { ratio: 50 }),
  status('block_debuffs', 'buff', 'blockDebuffs'),
  status('reflect_30', 'buff', 'reflectDamage', { ratio: 30 }),
  status('vampiric_25', 'buff', 'lifesteal', { ratio: 25 }),
  status('unkillable', 'buff', 'unkillable'),

  status(
    'atk_down_50',
    'debuff',
    'statModifier',
    { stat: 'atk', pct: -50 },
    { family: 'atk_down' },
  ),
  status(
    'def_down_60',
    'debuff',
    'statModifier',
    { stat: 'def', pct: -60 },
    { family: 'def_down' },
  ),
  status(
    'spd_down_30',
    'debuff',
    'statModifier',
    { stat: 'spd', pct: -30 },
    { family: 'spd_down' },
  ),
  status('weaken_25', 'debuff', 'statModifier', { pct: 25 }, { family: 'weaken' }),
  status(
    'poison_5',
    'debuff',
    'damageOverTime',
    { tick: 'ownerTurnStart', tickPct: 5, maxStacks: 5 },
    { family: 'poison' },
  ),
  status('hp_burn', 'debuff', 'damageOverTime', { tick: 'ownerTurnStart', tickPct: 3 }),
  status('heal_reduction_50', 'debuff', 'healReduction', { pct: 50 }),
  status('leech', 'debuff', 'lifesteal', { ratio: 18 }),
  status('stun', 'debuff', 'skipTurn', {}, { family: 'hard_cc', potency: 3 }),
  status('freeze', 'debuff', 'skipTurn', {}, { family: 'hard_cc', potency: 3 }),
  status('sleep', 'debuff', 'skipTurnBreakOnDamage', {}, { family: 'hard_cc', potency: 2 }),
  status('provoke', 'debuff', 'forceTargetA1', {}, { family: 'hard_cc', potency: 1 }),
  status('block_buffs', 'debuff', 'blockBuffs'),
];

export function skill(key: string, overrides: Partial<SkillDef> = {}): SkillDef {
  return {
    key,
    sortOrder: 1,
    name: key,
    description: '',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [{ type: 'damage', scale: 'atk', mult: 2, hits: 1 }],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack' },
    ...overrides,
  };
}

export const SKILLS: SkillDef[] = [skill('strike'), skill('enemy_strike')];

const BASE_STATS: Record<Stat, number> = {
  hp: 10_000,
  atk: 1_000,
  def: 1_000,
  spd: 100,
  critRate: 0,
  critDmg: 50,
  res: 0,
  acc: 0,
};

export function unit(
  side: Side,
  slot: number,
  overrides: Partial<Omit<BattleUnit, 'ref' | 'stats'>> & {
    stats?: Partial<Record<Stat, number>>;
  } = {},
): BattleUnit {
  const stats = Object.freeze({ ...BASE_STATS, ...overrides.stats });
  const { stats: _ignored, ...rest } = overrides;
  return {
    ref: { side, slot },
    defKey: `${side}_${slot}`,
    name: `${side} ${slot}`,
    element: 'mist',
    level: 60,
    stats,
    maxHp: stats.hp,
    hp: stats.hp,
    tm: 0,
    skills: [side === 'ally' ? 'strike' : 'enemy_strike'],
    cooldowns: {},
    buffs: [],
    debuffs: [],
    alive: true,
    isBoss: false,
    boss: { almightyImmunity: false, tmReductionImmune: false },
    ccStreak: 0,
    ...rest,
  };
}

export function statusMap(defs: readonly StatusDef[] = STATUSES): ReadonlyMap<string, StatusDef> {
  return new Map(defs.map((def) => [def.key, def]));
}

export function skillMap(defs: readonly SkillDef[] = SKILLS): ReadonlyMap<string, SkillDef> {
  return new Map(defs.map((def) => [def.key, def]));
}

/** An RNG that returns a scripted sequence, for testing roll order deterministically. */
export function scriptedRng(values: readonly number[]): Rng {
  let index = 0;
  const next = (): number => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    shuffle: (items) => [...items],
    getState: () => [1, 2, 3, 4],
  };
}
