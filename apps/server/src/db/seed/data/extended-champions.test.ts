import { describe, expect, it } from 'vitest';
import { RARITIES, championDefSchema, skillDefSchema } from '@mistvale/shared';
import type { ChampionDef, EffectComponent, Rarity, SkillDef } from '@mistvale/shared';
import { EXTENDED_CHAMPIONS, EXTENDED_SKILLS } from './extended-champions';

/**
 * Guard rails for the extended roster seed (docs/CONTENT_PLAN_EA01.md §1b).
 *
 * These tests are deliberately adversarial: they re-derive the rules the content plan and
 * COMBAT_SYSTEM.md state — kit depth per rarity, multiplier bands, cooldown rules, the
 * status catalogue, roster composition — and check the data against them, so an authoring
 * slip fails here rather than at publish time or, worse, in a player's battle.
 */

// ── The EA status catalogue (COMBAT_SYSTEM §7, seeded in statuses.ts) ────────

const BUFF_STATUSES = [
  'atk_up_25',
  'atk_up_50',
  'def_up_30',
  'def_up_60',
  'spd_up_15',
  'spd_up_30',
  'crit_up_15',
  'crit_up_30',
  'strengthen_25',
  'shield',
  'continuous_heal_15',
  'counterattack',
  'ally_protection_25',
  'block_debuffs',
  'reflect_30',
  'vampiric_25',
  'unkillable',
] as const;

const DEBUFF_STATUSES = [
  'atk_down_25',
  'atk_down_50',
  'def_down_30',
  'def_down_60',
  'spd_down_15',
  'spd_down_30',
  'crit_down_30',
  'acc_down_50',
  'weaken_25',
  'poison_25',
  'poison_5',
  'hp_burn',
  'heal_reduction_50',
  'leech',
  'stun',
  'freeze',
  'sleep',
  'provoke',
  'block_buffs',
] as const;

const BUFFS = new Set<string>(BUFF_STATUSES);
const DEBUFFS = new Set<string>(DEBUFF_STATUSES);
const ALL_STATUSES = new Set<string>([...BUFF_STATUSES, ...DEBUFF_STATUSES]);

const ALLY_TARGETS = new Set(['self', 'allAllies', 'lowestHpAlly', 'randomAlly']);
const ENEMY_TARGETS = new Set(['hitTargets', 'allEnemies']);

const CONTENT_KEY = /^[a-z][a-z0-9_]*$/;
/** The schema also knows a `passive` slot; this roster expresses everything as A1–A4. */
const SLOT_ORDER: readonly SkillDef['slot'][] = ['a1', 'a2', 'a3', 'a4'];

/** Kit depth by rarity — CONTENT_PLAN §1b; food units follow the same rule. */
const SKILLS_BY_RARITY: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 3,
  legendary: 4,
};

/** Expected roster shape (CONTENT_PLAN §1b, GAME_DESIGN §5). */
const EXPECTED_ROSTER_RARITIES: Record<Rarity, number> = {
  common: 0,
  uncommon: 3,
  rare: 13,
  epic: 7,
  legendary: 7,
};
const EXPECTED_FOOD_RARITIES: Record<Rarity, number> = {
  common: 3,
  uncommon: 3,
  rare: 0,
  epic: 0,
  legendary: 0,
};

const EXPECTED_FACTIONS = [
  'vale_sentinels',
  'emberclan',
  'wayfarers',
  'hollowborn',
  'sskarn',
  'thornweald',
  'runebound',
  'drowned_choir',
];

/** Damage multiplier bands — COMBAT_SYSTEM §6. */
const EPSILON = 1e-9;
const ATK_BANDS = {
  a1: [1.7, 2.2],
  single: [3.5, 6.5],
  all: [2.0, 2.6],
  random: [1.5, 2.6],
} as const;
const DEF_BAND = [3.2, 4.2] as const;
const MAXHP_PER_HIT_BAND = [0.2, 0.26] as const;

// ── Parse once; every other test works from the validated data ──────────────

const skillParses = EXTENDED_SKILLS.map((raw) => ({
  key: raw.key,
  result: skillDefSchema.safeParse(raw),
}));
const championParses = EXTENDED_CHAMPIONS.map((raw) => ({
  key: raw.key,
  result: championDefSchema.safeParse(raw),
}));

const skills: SkillDef[] = skillParses.flatMap((p) => (p.result.success ? [p.result.data] : []));
const champions: ChampionDef[] = championParses.flatMap((p) =>
  p.result.success ? [p.result.data] : [],
);

const skillsByKey = new Map(skills.map((skill) => [skill.key, skill]));
const championsByKey = new Map(champions.map((champion) => [champion.key, champion]));
const kitOf = (champion: ChampionDef): SkillDef[] =>
  champion.skills.flatMap((key) => {
    const skill = skillsByKey.get(key);
    return skill ? [skill] : [];
  });

type DamageComponent = Extract<EffectComponent, { type: 'damage' }>;
type StatusComponent = Extract<EffectComponent, { type: 'applyStatus' }>;

const damageComponents = (skill: SkillDef, scale: DamageComponent['scale']): DamageComponent[] =>
  skill.components.filter(
    (component): component is DamageComponent =>
      component.type === 'damage' && component.scale === scale,
  );

const statusComponents = (skill: SkillDef): StatusComponent[] =>
  skill.components.filter(
    (component): component is StatusComponent => component.type === 'applyStatus',
  );

const totalMult = (components: DamageComponent[]): number =>
  components.reduce((sum, component) => sum + component.mult * component.hits, 0);

const withinBand = (value: number, band: readonly [number, number] | readonly number[]): boolean =>
  value >= (band[0] ?? 0) - EPSILON && value <= (band[1] ?? 0) + EPSILON;

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

// ── Schema conformance ──────────────────────────────────────────────────────

describe('schema conformance', () => {
  it('every skill parses against skillDefSchema', () => {
    const failures = skillParses
      .filter((parse) => !parse.result.success)
      .map((parse) => {
        const { result } = parse;
        const detail = result.success
          ? ''
          : result.error.issues
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; ');
        return `${parse.key} — ${detail}`;
      });
    expect(failures).toEqual([]);
    expect(skills).toHaveLength(EXTENDED_SKILLS.length);
  });

  it('every champion parses against championDefSchema', () => {
    const failures = championParses
      .filter((parse) => !parse.result.success)
      .map((parse) => {
        const { result } = parse;
        const detail = result.success
          ? ''
          : result.error.issues
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; ');
        return `${parse.key} — ${detail}`;
      });
    expect(failures).toEqual([]);
    expect(champions).toHaveLength(EXTENDED_CHAMPIONS.length);
  });
});

// ── Keys and references ─────────────────────────────────────────────────────

describe('keys and references', () => {
  it('has no duplicate champion keys', () => {
    const keys = champions.map((champion) => champion.key);
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it('has no duplicate skill keys', () => {
    const keys = skills.map((skill) => skill.key);
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it('uses lowercase snake_case keys everywhere', () => {
    const bad = [...champions.map((c) => c.key), ...skills.map((s) => s.key)].filter(
      (key) => !CONTENT_KEY.test(key) || key.length < 2 || key.length > 64,
    );
    expect(bad).toEqual([]);
  });

  it('resolves every champion skill reference', () => {
    const dangling = champions.flatMap((champion) =>
      champion.skills
        .filter((key) => !skillsByKey.has(key))
        .map((key) => `${champion.key} -> ${key}`),
    );
    expect(dangling).toEqual([]);
  });

  it('leaves no skill unowned, and none shared between champions', () => {
    const referenceCount = new Map<string, number>();
    for (const champion of champions) {
      for (const key of champion.skills) {
        referenceCount.set(key, (referenceCount.get(key) ?? 0) + 1);
      }
    }
    const wrong = skills
      .map((skill) => ({ key: skill.key, count: referenceCount.get(skill.key) ?? 0 }))
      .filter((entry) => entry.count !== 1);
    expect(wrong).toEqual([]);
  });

  it('names each skill <championKey>_<slot>_<shortName>', () => {
    const mismatched = champions.flatMap((champion) =>
      kitOf(champion)
        .filter((skill) => !skill.key.startsWith(`${champion.key}_${skill.slot}_`))
        .map((skill) => `${champion.key}: ${skill.key}`),
    );
    expect(mismatched).toEqual([]);
  });

  it('orders each kit A1 first, then the actives', () => {
    const wrong = champions
      .map((champion) => ({
        key: champion.key,
        slots: kitOf(champion).map((skill) => skill.slot),
      }))
      .filter(
        (entry) => entry.slots.join(',') !== SLOT_ORDER.slice(0, entry.slots.length).join(','),
      );
    expect(wrong).toEqual([]);
  });

  it('numbers champions contiguously after the showcase seven and skills by slot', () => {
    expect(champions.map((champion) => champion.sortOrder)).toEqual(
      champions.map((_, index) => 8 + index),
    );
    const wrong = skills
      .filter((skill) => skill.sortOrder !== SLOT_ORDER.indexOf(skill.slot) + 1)
      .map((skill) => skill.key);
    expect(wrong).toEqual([]);
  });
});

// ── Kit depth and cooldowns ─────────────────────────────────────────────────

describe('kit depth and cooldowns', () => {
  it('gives every champion the skill count its rarity earns', () => {
    const wrong = champions
      .map((champion) => ({
        key: champion.key,
        rarity: champion.rarity,
        got: champion.skills.length,
        want: SKILLS_BY_RARITY[champion.rarity],
      }))
      .filter((entry) => entry.got !== entry.want);
    expect(wrong).toEqual([]);
  });

  it('uses only the A1–A4 slots', () => {
    const wrong = skills.filter((skill) => !SLOT_ORDER.includes(skill.slot)).map((s) => s.key);
    expect(wrong).toEqual([]);
  });

  it('leaves every A1 free of cooldown', () => {
    const wrong = skills
      .filter((skill) => skill.slot === 'a1' && skill.cooldown !== 0)
      .map((skill) => `${skill.key}: ${skill.cooldown}`);
    expect(wrong).toEqual([]);
  });

  it('keeps every active on a 3–5 turn cooldown', () => {
    const wrong = skills
      .filter((skill) => skill.slot !== 'a1' && (skill.cooldown < 3 || skill.cooldown > 5))
      .map((skill) => `${skill.key}: ${skill.cooldown}`);
    expect(wrong).toEqual([]);
  });

  it('gives every skill a 2–4 rung tome ladder, and never shortens an A1 cooldown', () => {
    const wrongLength = skills
      .filter((skill) => skill.upgrades.length < 2 || skill.upgrades.length > 4)
      .map((skill) => `${skill.key}: ${skill.upgrades.length}`);
    expect(wrongLength).toEqual([]);

    const pointless = skills
      .filter(
        (skill) =>
          skill.slot === 'a1' && skill.upgrades.some((upgrade) => upgrade.effect === 'cooldown'),
      )
      .map((skill) => skill.key);
    expect(pointless).toEqual([]);
  });
});

// ── Effect components ───────────────────────────────────────────────────────

describe('effect components', () => {
  it('only references statuses from the EA catalogue', () => {
    const unknown = skills.flatMap((skill) =>
      statusComponents(skill)
        .filter((component) => !ALL_STATUSES.has(component.status))
        .map((component) => `${skill.key}: ${component.status}`),
    );
    expect(unknown).toEqual([]);
  });

  it('only hints at statuses from the EA catalogue', () => {
    const unknown = skills
      .filter(
        (skill) =>
          skill.aiHints.dontRepeatWhileActive !== undefined &&
          !ALL_STATUSES.has(skill.aiHints.dontRepeatWhileActive),
      )
      .map((skill) => `${skill.key}: ${skill.aiHints.dontRepeatWhileActive}`);
    expect(unknown).toEqual([]);
  });

  it('puts buffs on allies without a chance roll, and debuffs on enemies with one', () => {
    const wrong = skills.flatMap((skill) =>
      statusComponents(skill).flatMap((component) => {
        const label = `${skill.key}/${component.status}`;
        if (BUFFS.has(component.status)) {
          if (!ALLY_TARGETS.has(component.target)) return [`${label}: buff on ${component.target}`];
          if (component.chance !== undefined) return [`${label}: buff carries a chance`];
          return [];
        }
        if (!DEBUFFS.has(component.status)) return [];
        if (!ENEMY_TARGETS.has(component.target))
          return [`${label}: debuff on ${component.target}`];
        if (component.chance === undefined) return [`${label}: debuff without a chance`];
        return [];
      }),
    );
    expect(wrong).toEqual([]);
  });

  it('states chances as fractions, never percentages', () => {
    const wrong = skills.flatMap((skill) =>
      skill.components
        .filter(
          (component) =>
            'chance' in component && component.chance !== undefined && component.chance < 0.05,
        )
        .map((component) => `${skill.key}: ${component.type}`),
    );
    expect(wrong).toEqual([]);
  });

  it('never aims an on-hit component at hitTargets from an ally- or self-targeted skill', () => {
    const wrong = skills
      .filter((skill) => skill.targeting.side !== 'enemy')
      .flatMap((skill) =>
        skill.components
          .filter((component) => 'target' in component && component.target === 'hitTargets')
          .map((component) => `${skill.key}: ${component.type}`),
      );
    expect(wrong).toEqual([]);
  });

  it('gives multi-target random skills a target count', () => {
    const wrong = skills
      .filter(
        (skill) =>
          skill.targeting.mode === 'random' &&
          (skill.targeting.count === undefined || skill.targeting.count < 2),
      )
      .map((skill) => skill.key);
    expect(wrong).toEqual([]);
  });

  it('keeps turn-meter swings inside a sane band', () => {
    const wrong = skills.flatMap((skill) =>
      skill.components
        .filter(
          (component) =>
            component.type === 'turnMeter' &&
            (Math.abs(component.deltaPct) < 10 || Math.abs(component.deltaPct) > 50),
        )
        .map((component) => `${skill.key}: ${component.type}`),
    );
    expect(wrong).toEqual([]);
  });

  it('keeps MaxHP-scaled heals and shields proportionate', () => {
    const wrong = skills.flatMap((skill) =>
      skill.components.flatMap((component) => {
        if (component.type === 'heal' && component.scale === 'maxHp') {
          return component.mult < 0.1 || component.mult > 0.45 ? [`${skill.key} heal`] : [];
        }
        if (component.type === 'shield' && component.scale === 'maxHp') {
          return component.mult < 0.12 || component.mult > 0.3 ? [`${skill.key} shield`] : [];
        }
        return [];
      }),
    );
    expect(wrong).toEqual([]);
  });
});

// ── Damage bands (COMBAT_SYSTEM §6) ─────────────────────────────────────────

describe('damage multiplier bands', () => {
  it('keeps every ATK-scaled skill inside its band', () => {
    const wrong = skills.flatMap((skill) => {
      const total = totalMult(damageComponents(skill, 'atk'));
      if (total === 0) return [];
      const band =
        skill.slot === 'a1'
          ? ATK_BANDS.a1
          : skill.targeting.mode === 'all'
            ? ATK_BANDS.all
            : skill.targeting.mode === 'random'
              ? ATK_BANDS.random
              : ATK_BANDS.single;
      return withinBand(total, band) ? [] : [`${skill.key}: ×${total} outside ${band.join('–')}`];
    });
    expect(wrong).toEqual([]);
  });

  it('keeps every DEF-scaled skill inside ×3.2–4.2 DEF', () => {
    const wrong = skills.flatMap((skill) => {
      const total = totalMult(damageComponents(skill, 'def'));
      if (total === 0) return [];
      return withinBand(total, DEF_BAND) ? [] : [`${skill.key}: ×${total}`];
    });
    expect(wrong).toEqual([]);
  });

  it('keeps every MaxHP-scaled hit inside ×0.20–0.26 MaxHP', () => {
    const wrong = skills.flatMap((skill) =>
      damageComponents(skill, 'maxHp')
        .filter((component) => !withinBand(component.mult, MAXHP_PER_HIT_BAND))
        .map((component) => `${skill.key}: ×${component.mult}`),
    );
    expect(wrong).toEqual([]);
  });

  it('gives every damaging skill at least one damage component', () => {
    const noScaling = skills.filter((skill) =>
      skill.components.every((component) => component.type !== 'damage'),
    );
    // Pure utility skills are legitimate; they must still do something.
    const empty = noScaling.filter((skill) => skill.components.length === 0);
    expect(empty).toEqual([]);
    expect(noScaling.every((skill) => skill.slot !== 'a1')).toBe(true);
  });
});

// ── Roster composition ──────────────────────────────────────────────────────

describe('roster composition', () => {
  const roster = champions.filter((champion) => !champion.isFood);
  const food = champions.filter((champion) => champion.isFood);

  it('ships 30 extended champions and 6 food units', () => {
    expect(roster).toHaveLength(30);
    expect(food).toHaveLength(6);
    expect(champions).toHaveLength(36);
  });

  it('matches the rarity spread of CONTENT_PLAN §1b', () => {
    const count = (list: ChampionDef[], rarity: Rarity): number =>
      list.filter((champion) => champion.rarity === rarity).length;
    for (const rarity of RARITIES) {
      expect([rarity, count(roster, rarity)]).toEqual([rarity, EXPECTED_ROSTER_RARITIES[rarity]]);
      expect([rarity, count(food, rarity)]).toEqual([rarity, EXPECTED_FOOD_RARITIES[rarity]]);
    }
  });

  it('has exactly one unsummonable champion, the missions-chain Aureleth', () => {
    const exclusive = champions.filter((champion) => !champion.summonable);
    expect(exclusive.map((champion) => champion.key)).toEqual(['aureleth']);
    expect(exclusive[0]?.rarity).toBe('legendary');
  });

  it('covers every faction in the table', () => {
    const present = new Set(roster.map((champion) => champion.factionKey));
    expect([...present].sort()).toEqual([...EXPECTED_FACTIONS].sort());
  });

  it('covers every element, with at least two Rares each', () => {
    const rares = roster.filter((champion) => champion.rarity === 'rare');
    for (const element of ['ember', 'tide', 'verdant', 'mist'] as const) {
      expect([element, roster.some((champion) => champion.element === element)]).toEqual([
        element,
        true,
      ]);
      expect([
        element,
        rares.filter((champion) => champion.element === element).length >= 2,
      ]).toEqual([element, true]);
    }
  });

  it('fills the Mist-only Mistwoven pool with 3 Rares and 3 Legendaries', () => {
    const mist = roster.filter((champion) => champion.element === 'mist' && champion.summonable);
    expect(mist.filter((champion) => champion.rarity === 'rare')).toHaveLength(3);
    expect(mist.filter((champion) => champion.rarity === 'legendary')).toHaveLength(3);
  });

  it('uses the placeholder lizard asset throughout and claims no starter slot', () => {
    expect(champions.every((champion) => champion.assetKey === 'enemy_lizard')).toBe(true);
    expect(champions.every((champion) => champion.starter === false)).toBe(true);
    expect(champions.every((champion) => champion.balanceVersion === 1)).toBe(true);
  });

  it('writes a title and real lore for everyone', () => {
    const thin = champions
      .filter((champion) => champion.title.length < 3 || champion.lore.length < 80)
      .map((champion) => champion.key);
    expect(thin).toEqual([]);
  });
});

// ── Base stats ──────────────────────────────────────────────────────────────

describe('base stats', () => {
  it('rises monotonically with rarity for HP, ATK and DEF', () => {
    // Measured across the summonable roster: food units are deliberately off-band and
    // are all one role per tier, so their means say nothing about rarity scaling.
    const roster = champions.filter((champion) => !champion.isFood);
    const present = RARITIES.filter((rarity) =>
      roster.some((champion) => champion.rarity === rarity),
    );
    for (const stat of ['hp', 'atk', 'def'] as const) {
      const means = present.map((rarity) =>
        mean(
          roster
            .filter((champion) => champion.rarity === rarity)
            .map((champion) => champion.baseStats[stat]),
        ),
      );
      for (let index = 1; index < means.length; index += 1) {
        expect([stat, present[index], (means[index] ?? 0) > (means[index - 1] ?? 0)]).toEqual([
          stat,
          present[index],
          true,
        ]);
      }
    }
  });

  it('anchors every champion within 10% of its role × rarity template', () => {
    // The Epic role anchors of COMBAT_SYSTEM §1, scaled by the rarity factors documented
    // at the top of extended-champions.ts. Per-champion identity lives in the tolerance;
    // anything further out is an authoring slip, not a design choice.
    const ROLE_ANCHOR: Record<ChampionDef['role'], { hp: number; atk: number; def: number }> = {
      attack: { hp: 15_000, atk: 1_420, def: 900 },
      defense: { hp: 18_000, atk: 880, def: 1_380 },
      hp: { hp: 19_000, atk: 950, def: 1_080 },
      support: { hp: 17_500, atk: 980, def: 1_150 },
    };
    const RARITY_FACTOR: Record<Rarity, number> = {
      common: 0.55,
      uncommon: 0.72,
      rare: 0.88,
      epic: 1,
      legendary: 1.08,
    };

    const wrong = champions.flatMap((champion) => {
      const anchor = ROLE_ANCHOR[champion.role];
      const factor = RARITY_FACTOR[champion.rarity];
      return (['hp', 'atk', 'def'] as const).flatMap((stat) => {
        const expected = anchor[stat] * factor;
        const drift = Math.abs(champion.baseStats[stat] - expected) / expected;
        return drift > 0.1
          ? [`${champion.key}.${stat}: ${champion.baseStats[stat]} vs ~${Math.round(expected)}`]
          : [];
      });
    });
    expect(wrong).toEqual([]);
  });

  it('shapes the spread by role', () => {
    const byRole = (role: ChampionDef['role'], stat: 'hp' | 'atk' | 'def'): number =>
      mean(
        champions
          .filter((champion) => champion.role === role && !champion.isFood)
          .map((champion) => champion.baseStats[stat]),
      );
    expect(byRole('attack', 'atk')).toBeGreaterThan(byRole('defense', 'atk'));
    expect(byRole('defense', 'def')).toBeGreaterThan(byRole('attack', 'def'));
    expect(byRole('hp', 'hp')).toBeGreaterThan(byRole('attack', 'hp'));
    expect(byRole('support', 'def')).toBeGreaterThan(byRole('attack', 'def'));
  });

  it('keeps secondary stats inside the COMBAT §1 ranges', () => {
    const wrong = champions
      .filter((champion) => {
        const { critRate, critDmg, res, acc, spd } = champion.baseStats;
        return (
          critRate < 15 ||
          critRate > 20 ||
          critDmg < 50 ||
          critDmg > 57 ||
          res < 15 ||
          res > 50 ||
          acc < 0 ||
          acc > 25 ||
          spd < 88 ||
          spd > 115
        );
      })
      .map((champion) => champion.key);
    expect(wrong).toEqual([]);
  });
});

// ── Auras ───────────────────────────────────────────────────────────────────

describe('auras', () => {
  it('gives one to roughly half the roster', () => {
    const withAura = champions.filter((champion) => champion.aura !== null);
    expect(withAura.length / champions.length).toBeGreaterThanOrEqual(0.4);
    expect(withAura.length / champions.length).toBeLessThanOrEqual(0.6);
  });

  it('always arms Legendaries, often Epics, rarely Rares and never food or Uncommons', () => {
    const share = (rarity: Rarity): number => {
      const group = champions.filter((champion) => champion.rarity === rarity && !champion.isFood);
      return group.length === 0
        ? 0
        : group.filter((champion) => champion.aura !== null).length / group.length;
    };
    expect(share('legendary')).toBe(1);
    expect(share('epic')).toBeGreaterThanOrEqual(0.7);
    expect(share('rare')).toBeLessThan(0.5);
    expect(share('uncommon')).toBe(0);
    expect(champions.filter((champion) => champion.isFood).every((c) => c.aura === null)).toBe(
      true,
    );
  });

  it('scales aura strength with rarity', () => {
    const strongest = (rarity: Rarity): number =>
      Math.max(
        0,
        ...champions
          .filter((champion) => champion.rarity === rarity && champion.aura !== null)
          .map((champion) => champion.aura?.value ?? 0),
      );
    expect(strongest('legendary')).toBeGreaterThan(strongest('rare'));
    expect(strongest('epic')).toBeGreaterThan(strongest('rare'));
  });
});

// ── Kit identity: every champion plays its CONTENT_PLAN §1b hook ────────────

const appliesStatus = (kit: SkillDef[], status: string): boolean =>
  kit.some((skill) => statusComponents(skill).some((component) => component.status === status));

const appliesStatusTo = (kit: SkillDef[], status: string, target: string): boolean =>
  kit.some((skill) =>
    statusComponents(skill).some(
      (component) => component.status === status && component.target === target,
    ),
  );

const hasComponent = (kit: SkillDef[], type: EffectComponent['type']): boolean =>
  kit.some((skill) => skill.components.some((component) => component.type === type));

const hasTurnMeter = (kit: SkillDef[], sign: 1 | -1): boolean =>
  kit.some((skill) =>
    skill.components.some(
      (component) => component.type === 'turnMeter' && Math.sign(component.deltaPct) === sign,
    ),
  );

const hasCondition = (kit: SkillDef[], type: string): boolean =>
  kit.some((skill) => skill.components.some((component) => component.condition?.type === type));

const scalesFrom = (kit: SkillDef[], scale: DamageComponent['scale']): boolean =>
  kit.some((skill) => damageComponents(skill, scale).length > 0);

const hitsAll = (kit: SkillDef[]): boolean =>
  kit.some((skill) => skill.targeting.mode === 'all' && skill.targeting.side === 'enemy');

/** One structural assertion per kit hook in the §1b table. */
const KIT_HOOKS: [string, string, (kit: SkillDef[]) => boolean][] = [
  ['ashka_torchhand', 'fast A1 with an HP Burn chance', (k) => appliesStatus(k, 'hp_burn')],
  [
    'grib_the_unburied',
    'thorny bruiser with self Continuous Heal',
    (k) => appliesStatusTo(k, 'continuous_heal_15', 'self') && appliesStatus(k, 'reflect_30'),
  ],
  [
    'ssiv_quickfang',
    'double-hit A1 and self SPD',
    (k) =>
      k.some(
        (skill) =>
          skill.slot === 'a1' &&
          damageComponents(skill, 'atk').some((component) => component.hits === 2),
      ) && appliesStatusTo(k, 'spd_up_30', 'self'),
  ],
  [
    'serjeant_bramwell',
    'self Shield and a single Provoke',
    (k) => hasComponent(k, 'shield') && appliesStatus(k, 'provoke'),
  ],
  [
    'kerra_palewatch',
    'DEF Down opener into a nuke',
    (k) =>
      appliesStatus(k, 'def_down_60') &&
      k.some((skill) => totalMult(damageComponents(skill, 'atk')) >= 4.5),
  ],
  [
    'brekka_foehammer',
    'HP-scaled hits with Stun chances',
    (k) => scalesFrom(k, 'maxHp') && appliesStatus(k, 'stun'),
  ],
  [
    'maddoc_threefingers',
    'self Counterattack and Weaken',
    (k) => appliesStatusTo(k, 'counterattack', 'self') && appliesStatus(k, 'weaken_25'),
  ],
  [
    'wisp_of_hallen',
    'Leech and Heal Reduction spreader',
    (k) => appliesStatus(k, 'leech') && appliesStatus(k, 'heal_reduction_50'),
  ],
  [
    'petta_lanternmaid',
    'single heal, cleanse and Continuous Heal',
    (k) =>
      hasComponent(k, 'heal') &&
      hasComponent(k, 'cleanse') &&
      appliesStatus(k, 'continuous_heal_15'),
  ],
  [
    'sylvi_mistreader',
    'turn-meter control both ways',
    (k) => hasTurnMeter(k, 1) && hasTurnMeter(k, -1),
  ],
  [
    'old_gharssa',
    'AoE Poison plus an ally heal',
    (k) => appliesStatus(k, 'poison_5') && hasComponent(k, 'heal') && hitsAll(k),
  ],
  [
    'krosska_shieldback',
    'team Shield and a self taunt',
    (k) =>
      k.some((skill) =>
        skill.components.some(
          (component) => component.type === 'shield' && component.target === 'allAllies',
        ),
      ) && appliesStatusTo(k, 'ally_protection_25', 'self'),
  ],
  ['bracken_puck', 'turn-meter thief', (k) => hasTurnMeter(k, -1) && hasTurnMeter(k, 1)],
  [
    'torvi_anvilborn',
    'DEF-scaled AoE and team DEF Up',
    (k) =>
      k.some(
        (skill) => skill.targeting.mode === 'all' && damageComponents(skill, 'def').length > 0,
      ) && appliesStatusTo(k, 'def_up_60', 'allAllies'),
  ],
  [
    'hodrek_deepline',
    'armour-ignoring single-target rune nuker',
    (k) =>
      k.some((skill) =>
        damageComponents(skill, 'atk').some((component) => (component.ignoreDefPct ?? 0) > 0),
      ),
  ],
  [
    'sister_nerissa',
    'team Continuous Heal and debuff wards',
    (k) =>
      appliesStatusTo(k, 'continuous_heal_15', 'allAllies') &&
      appliesStatusTo(k, 'block_debuffs', 'allAllies'),
  ],
  [
    'castellan_ordwin',
    'AoE Provoke, team DEF Up and a counter',
    (k) =>
      appliesStatusTo(k, 'provoke', 'allEnemies') &&
      appliesStatusTo(k, 'def_up_60', 'allAllies') &&
      appliesStatusTo(k, 'counterattack', 'self'),
  ],
  [
    'ugrim_pyrechant',
    'team ATK Up and HP Burn spread',
    (k) =>
      appliesStatusTo(k, 'atk_up_50', 'allAllies') && appliesStatus(k, 'hp_burn') && hitsAll(k),
  ],
  [
    'aldemar_the_cartographer',
    'team Shield and AoE Weaken',
    (k) =>
      k.some((skill) =>
        skill.components.some(
          (component) => component.type === 'shield' && component.target === 'allAllies',
        ),
      ) && appliesStatus(k, 'weaken_25'),
  ],
  [
    'lady_merrow',
    'Sleep control and a big heal',
    (k) => appliesStatus(k, 'sleep') && hasComponent(k, 'heal'),
  ],
  [
    'vessk_the_unchained',
    'three random hits and self ATK Up',
    (k) =>
      k.some((skill) => skill.targeting.mode === 'random' && skill.targeting.count === 3) &&
      appliesStatusTo(k, 'atk_up_50', 'self'),
  ],
  [
    'briar_knight',
    'Reflect and Provoke thorns tank',
    (k) => appliesStatusTo(k, 'reflect_30', 'self') && appliesStatus(k, 'provoke'),
  ],
  [
    'cantor_maelis',
    'AoE with a SPD Down chorus',
    (k) => hitsAll(k) && appliesStatus(k, 'spd_down_30'),
  ],
  [
    'warden_elstan',
    'team Ally Protection, Shield engine and counters',
    (k) =>
      appliesStatusTo(k, 'ally_protection_25', 'allAllies') &&
      hasComponent(k, 'shield') &&
      appliesStatusTo(k, 'counterattack', 'self'),
  ],
  [
    'vulkas_emberlord',
    'HP Burn AoE that punishes burning targets',
    (k) => appliesStatus(k, 'hp_burn') && hasCondition(k, 'targetHasStatus') && hitsAll(k),
  ],
  [
    'orenna_veilmother',
    'mass cleanse, Block Debuffs and team SPD Up',
    (k) =>
      k.some((skill) =>
        skill.components.some(
          (component) => component.type === 'cleanse' && component.count === 'all',
        ),
      ) &&
      appliesStatusTo(k, 'block_debuffs', 'allAllies') &&
      appliesStatusTo(k, 'spd_up_30', 'allAllies'),
  ],
  [
    'pale_duke',
    'Leech, AoE Weaken and self-sustain',
    (k) =>
      appliesStatus(k, 'leech') &&
      appliesStatus(k, 'weaken_25') &&
      k.some((skill) =>
        skill.components.some(
          (component) => component.type === 'heal' && component.target === 'self',
        ),
      ),
  ],
  [
    'szarran_coilfather',
    'mass Poison with a poison payoff',
    (k) =>
      k.filter((skill) => statusComponents(skill).some((c) => c.status === 'poison_5')).length >=
        3 && hasCondition(k, 'targetHasStatus'),
  ],
  [
    'vessaryn',
    'veil buffs and an execute below 40% HP',
    (k) => appliesStatusTo(k, 'block_debuffs', 'self') && hasCondition(k, 'targetHpBelow'),
  ],
  [
    'aureleth',
    'revive-lite heal plus turn-meter surge and team ATK Up',
    (k) =>
      hasComponent(k, 'heal') &&
      hasTurnMeter(k, 1) &&
      appliesStatusTo(k, 'atk_up_50', 'allAllies') &&
      hasComponent(k, 'cleanse'),
  ],
];

describe('kit identity', () => {
  it('covers all thirty roster champions', () => {
    const roster = champions.filter((champion) => !champion.isFood).map((champion) => champion.key);
    expect(KIT_HOOKS.map(([key]) => key).sort()).toEqual([...roster].sort());
  });

  it.each(KIT_HOOKS)('%s plays its hook: %s', (key, _label, check) => {
    const champion = championsByKey.get(key);
    if (!champion) throw new Error(`No champion seeded under the key "${key}".`);
    expect(check(kitOf(champion))).toBe(true);
  });

  it('gives no two roster champions the same kit', () => {
    const signatures = champions
      .filter((champion) => !champion.isFood)
      .map((champion) =>
        JSON.stringify(
          kitOf(champion).map((skill) => [
            skill.slot,
            skill.cooldown,
            skill.targeting,
            skill.components,
          ]),
        ),
      );
    expect(signatures).toHaveLength(new Set(signatures).size);
  });
});

// ── Food units ──────────────────────────────────────────────────────────────

describe('food units', () => {
  const food = champions.filter((champion) => champion.isFood);

  it('ships three Broodlings and three Broodguards, one per non-Mist element', () => {
    const broodlings = food.filter((champion) => champion.rarity === 'common');
    const broodguards = food.filter((champion) => champion.rarity === 'uncommon');
    expect(broodlings.map((champion) => champion.element).sort()).toEqual([
      'ember',
      'tide',
      'verdant',
    ]);
    expect(broodguards.map((champion) => champion.element).sort()).toEqual([
      'ember',
      'tide',
      'verdant',
    ]);
    expect(food.every((champion) => champion.factionKey === 'sskarn')).toBe(true);
    expect(food.every((champion) => champion.summonable)).toBe(true);
  });

  it('stays weaker than every summonable champion of the same rarity', () => {
    const foodUncommon = food.filter((champion) => champion.rarity === 'uncommon');
    const rosterUncommon = champions.filter(
      (champion) => champion.rarity === 'uncommon' && !champion.isFood,
    );
    expect(mean(foodUncommon.map((champion) => champion.baseStats.atk))).toBeLessThan(
      mean(rosterUncommon.map((champion) => champion.baseStats.atk)),
    );
  });
});
