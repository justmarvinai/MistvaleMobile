import { describe, expect, it } from 'vitest';
import { enemyDefSchema, stageDefSchema } from '@mistvale/shared';
import type { EnemyDef, Stat } from '@mistvale/shared';
import { DEFAULT_CHAMPION_SCALING } from './config';
import { buildStageWaves, buildWave } from './setup';

/**
 * An enemy's rating, and the fact that it decides something.
 *
 * `stars` was authored on every one of the game's 3,452 enemy lines from P2 onward,
 * validated at publish, shown in the Admin editor — and read by nothing. `scaleEnemyStats`
 * took a def and a level and computed from `baseStats`, `growth` and `anchorLevel` alone,
 * so an operator had one difficulty lever where the editor promised two, and forty-one
 * balance gates and 176 engine tests all passed over the top of it. That is the shape of
 * defect this project keeps finding: not a wrong number, an *inert* one.
 *
 * C13 (Q8, answered by the owner 2026-08-26) makes it real, and this file is what stops it
 * going quiet again — every assertion here fails if `scaleEnemyStats` reverts to ignoring
 * the argument, which no golden replay would notice because the goldens build their units
 * directly rather than through a stage's waves.
 */

const SCALING = DEFAULT_CHAMPION_SCALING;
const LADDER = SCALING.rankMultipliers;

const ANCHOR = {
  hp: 20_000,
  atk: 1_000,
  def: 800,
  spd: 100,
  critRate: 15,
  critDmg: 50,
  res: 30,
  acc: 0,
};

function enemy(overrides: Record<string, unknown> = {}): EnemyDef {
  return enemyDefSchema.parse({
    key: 'test_lizard',
    name: 'Test Lizard',
    archetype: 'skirmisher',
    element: 'ember',
    role: 'attack',
    baseStats: ANCHOR,
    anchorLevel: 60,
    growth: 1.045,
    skills: ['test_swipe'],
    assetKey: 'test_lizard',
    ...overrides,
  });
}

/** One unit at a rating, built the way a stage builds it. */
function unitAt(stars: number, level = 60, def = enemy()) {
  return buildWave([{ def, level, stars, slot: 0 }], SCALING)[0]!;
}

describe('an enemy’s star rating', () => {
  it('is full strength at ★6 — the anchor stats are the six-star stats', () => {
    const top = unitAt(6);
    expect(top.stats.hp).toBe(ANCHOR.hp);
    expect(top.stats.atk).toBe(ANCHOR.atk);
    expect(top.stats.def).toBe(ANCHOR.def);
  });

  it('scales by the same ladder a champion’s rank does', () => {
    for (let stars = 1; stars <= LADDER.length; stars += 1) {
      const unit = unitAt(stars);
      const factor = LADDER[stars - 1]!;
      expect(unit.stats.hp, `★${stars} hp`).toBe(Math.round(ANCHOR.hp * factor));
      expect(unit.stats.atk, `★${stars} atk`).toBe(Math.round(ANCHOR.atk * factor));
      expect(unit.stats.def, `★${stars} def`).toBe(Math.round(ANCHOR.def * factor));
    }
  });

  it('decides something — a ★1 is not a ★6', () => {
    // The whole of Q8 in one line. If this passes trivially the field is inert again.
    expect(unitAt(1).stats.hp).toBeLessThan(unitAt(6).stats.hp);
  });

  it('climbs without ever stepping back', () => {
    const hp = [1, 2, 3, 4, 5, 6].map((stars) => unitAt(stars).stats.hp);
    for (let i = 1; i < hp.length; i += 1) {
      expect(hp[i]!, `★${i + 1} vs ★${i}`).toBeGreaterThan(hp[i - 1]!);
    }
  });

  /**
   * The deliberate exclusion, and the reason the change was safe to make at all.
   *
   * Speed decides turn order before anything else happens, and every boss in the game is
   * built on a turn count — a hit shield with a window, a mender's cooldown, the Titan's
   * fifty-turn cap. A rating that also moved speed would have retuned all of it in one
   * commit. Crit and resistance are left flat for the smaller version of the same reason:
   * an author sets them per archetype, not per rung.
   */
  it('leaves speed, crit and resistance alone at every rung', () => {
    const flat: Stat[] = ['spd', 'critRate', 'critDmg', 'res', 'acc'];
    const bottom = unitAt(1);
    const top = unitAt(6);
    for (const stat of flat) {
      expect(bottom.stats[stat], stat).toBe(top.stats[stat]);
    }
    expect(bottom.stats.spd).toBe(ANCHOR.spd);
  });

  it('composes with the level curve rather than replacing it', () => {
    // A ★3 ten levels above the anchor is the anchor, grown ten levels, then rated.
    const grown = Math.pow(1.045, 10);
    expect(unitAt(3, 70).stats.hp).toBe(Math.round(ANCHOR.hp * grown * LADDER[2]!));
    // …and the rating is the only difference between two units at the same level.
    expect(unitAt(3, 70).stats.hp / unitAt(6, 70).stats.hp).toBeCloseTo(LADDER[2]! / LADDER[5]!, 3);
  });

  it('clamps a rating the schema would never have let through', () => {
    // Published content is validated 1–6, so this is about a hand-built call and a snapshot
    // written by an older schema: a nonsense rating gets an end of the ladder, not a crash.
    expect(unitAt(0).stats.hp).toBe(unitAt(1).stats.hp);
    expect(unitAt(99).stats.hp).toBe(unitAt(6).stats.hp);
  });
});

describe('a stage’s waves', () => {
  const lizard = enemy();
  const enemies = new Map<string, EnemyDef>([[lizard.key, lizard]]);

  function stageWith(stars: readonly number[]) {
    return stageDefSchema.parse({
      key: 'test_stage',
      mode: 'campaign',
      parentKey: 'test_chapter',
      number: 1,
      energyCost: 6,
      waves: [
        stars.map((value, slot) => ({ enemyKey: lizard.key, level: 60, stars: value, slot })),
      ],
      rewards: { silverMin: 1, silverMax: 1, playerXp: 1, championXp: 1 },
      starRules: {},
    });
  }

  it('carry each line’s own rating through to the unit', () => {
    const [wave] = buildStageWaves(stageWith([1, 6]), enemies, SCALING);
    expect(wave![0]!.stats.hp).toBe(Math.round(ANCHOR.hp * LADDER[0]!));
    expect(wave![1]!.stats.hp).toBe(ANCHOR.hp);
  });

  it('read an omitted rating as full strength', () => {
    // The schema default. It was ★1 while the field was inert, which cost nothing then and
    // would now hand out a 58% nerf for leaving a box empty in Admin.
    const stage = stageDefSchema.parse({
      key: 'test_stage_bare',
      mode: 'campaign',
      parentKey: 'test_chapter',
      number: 1,
      energyCost: 6,
      waves: [[{ enemyKey: lizard.key, level: 60, slot: 0 }]],
      rewards: { silverMin: 1, silverMax: 1, playerXp: 1, championXp: 1 },
      starRules: {},
    });
    expect(buildStageWaves(stage, enemies, SCALING)[0]![0]!.stats.hp).toBe(ANCHOR.hp);
  });
});

describe('a boss’s summoned add', () => {
  /**
   * Built at full strength whatever the boss is rated.
   *
   * A summon is named by the boss's mechanic rather than by a wave line, so there is no
   * authored rating to honour — and inheriting the summoner's would be a balance change
   * nobody asked for, since a ★4 boss on Hard would then call weaker adds than the same
   * boss on Brutal without an author ever saying so.
   */
  it('ignores the summoner’s rating', () => {
    const add = enemy({ key: 'test_broodling', name: 'Test Broodling' });
    const boss = enemy({
      key: 'test_boss',
      name: 'Test Boss',
      isBoss: true,
      bossMechanics: {
        almightyImmunity: false,
        tmReductionImmune: false,
        addSummon: { unitKey: add.key, perTurn: 1, cap: 2 },
      },
    });
    const enemies = new Map<string, EnemyDef>([
      [add.key, add],
      [boss.key, boss],
    ]);

    const weak = buildWave([{ def: boss, level: 60, stars: 1, slot: 0 }], SCALING, enemies)[0]!;
    const strong = buildWave([{ def: boss, level: 60, stars: 6, slot: 0 }], SCALING, enemies)[0]!;

    expect(weak.stats.hp).toBeLessThan(strong.stats.hp);
    expect(weak.boss.addSummon?.template.stats.hp).toBe(ANCHOR.hp);
    expect(weak.boss.addSummon?.template.stats.hp).toBe(strong.boss.addSummon?.template.stats.hp);
  });
});
