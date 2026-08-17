import { describe, expect, it } from 'vitest';
import type { MasteryEffect, SkillDef } from '@mistvale/shared';
import { advance, createBattle } from './battle';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { SKILLS, skill, statusMap, unit } from './fixtures';
import type { BattleEvent, BattleRules, BattleUnit } from './types';

/**
 * Masteries, at battle time.
 *
 * Only the half that reaches the engine is tested here — the conditions and the procs.
 * Anything unconditional is folded into a champion's stats before the fight, and is the
 * server's arithmetic to get right (`mastery.test.ts` in the server package).
 *
 * Each case is written from the promise the node makes to the player: "hits harder from
 * behind", "answers a heavy blow", "survives one".
 */

const config = DEFAULT_COMBAT_CONFIG;

function rules(extra: readonly SkillDef[] = []): BattleRules {
  return {
    mode: 'campaign',
    skills: new Map([...SKILLS, ...extra].map((entry) => [entry.key, entry])),
    statuses: statusMap(),
  };
}

function fight(options: {
  allies: BattleUnit[];
  waves: BattleUnit[][];
  extraSkills?: readonly SkillDef[];
  seed?: number;
  mode?: BattleRules['mode'];
}): BattleEvent[] {
  const ruleSet = { ...rules(options.extraSkills), mode: options.mode ?? 'campaign' };
  const opened = createBattle(
    {
      seed: options.seed ?? 11,
      mode: options.mode ?? 'campaign',
      allies: options.allies,
      waves: options.waves,
    },
    ruleSet,
    config,
  );
  const rest = advance(opened.state, ruleSet, config, { auto: true });
  return [...opened.events, ...rest.events];
}

const of = <T extends BattleEvent['type']>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] =>
  events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);

/** A champion carrying a mastery build. */
function trained(masteries: MasteryEffect[], overrides: Parameters<typeof unit>[2] = {}) {
  return unit('ally', 0, {
    masteries,
    masteryState: { killStacks: 0, a1Uses: 0, struckFirst: [], debuffsThisTurn: 0, livingFoes: 0 },
    ...overrides,
  });
}

/** Total damage one side dealt to the other. */
function damageTo(events: readonly BattleEvent[], side: 'ally' | 'enemy'): number {
  return of(events, 'damage')
    .filter((event) => event.target.side === side)
    .reduce((sum, event) => sum + event.amount, 0);
}

/**
 * The first blow landed on a side.
 *
 * Totals are the wrong measure when a target can die: a harder hit kills sooner and so
 * *lowers* the total, which reads as the mastery doing nothing. One hit is unambiguous.
 */
function firstHitOn(events: readonly BattleEvent[], side: 'ally' | 'enemy'): number {
  return of(events, 'damage').find((event) => event.target.side === side)?.amount ?? 0;
}

describe('conditional damage', () => {
  it('hits a crowd-controlled target harder, and an untouched one no harder at all', () => {
    const opportunist: MasteryEffect[] = [
      { type: 'damageDealt', pct: 50, condition: { type: 'targetCrowdControlled' } },
    ];

    const plain = fight({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 2_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 400_000, spd: 1 } })]],
    });
    const withNode = fight({
      allies: [trained(opportunist, { stats: { spd: 200, atk: 2_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 400_000, spd: 1 } })]],
    });

    // Nothing is stunned, so the condition never holds and the numbers match exactly.
    expect(firstHitOn(withNode, 'enemy')).toBe(firstHitOn(plain, 'enemy'));

    const stunned = fight({
      allies: [trained(opportunist, { stats: { spd: 200, atk: 2_000 } })],
      waves: [
        [
          unit('enemy', 0, {
            stats: { hp: 400_000, spd: 1 },
            debuffs: [{ key: 'stun', turns: 9, source: null, stacks: 1 }],
          }),
        ],
      ],
    });
    expect(firstHitOn(stunned, 'enemy')).toBeGreaterThan(firstHitOn(plain, 'enemy'));
  });

  it('scales with how many debuffs the holder is carrying', () => {
    const furyBrand: MasteryEffect[] = [
      { type: 'damageDealt', pct: 20, condition: { type: 'perOwnDebuff', maxStacks: 3 } },
    ];
    const burdened = [
      { key: 'weaken_25', turns: 9, source: null, stacks: 1 },
      { key: 'heal_reduction_50', turns: 9, source: null, stacks: 1 },
    ];

    const clean = fight({
      allies: [trained(furyBrand, { stats: { spd: 200, atk: 2_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 400_000, spd: 1 } })]],
    });
    const loaded = fight({
      allies: [trained(furyBrand, { stats: { spd: 200, atk: 2_000 }, debuffs: burdened })],
      waves: [[unit('enemy', 0, { stats: { hp: 400_000, spd: 1 } })]],
    });

    expect(firstHitOn(loaded, 'enemy')).toBeGreaterThan(firstHitOn(clean, 'enemy'));
  });

  it('only pays out in the mode the content names', () => {
    const duellist: MasteryEffect[] = [
      { type: 'damageDealt', pct: 80, condition: { type: 'mode', mode: 'arena' } },
    ];
    const setup = () => ({
      allies: [trained(duellist, { stats: { spd: 200, atk: 2_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 400_000, spd: 1 } })]],
    });

    const campaign = fight({ ...setup(), mode: 'campaign' });
    const arena = fight({ ...setup(), mode: 'arena' });
    expect(firstHitOn(arena, 'enemy')).toBeGreaterThan(firstHitOn(campaign, 'enemy'));
  });
});

describe('conditional stats', () => {
  it('raises defence only while the holder carries no buffs', () => {
    const rooted: MasteryEffect[] = [
      { type: 'stat', stat: 'def', flat: 0, pct: 200, condition: { type: 'selfHasNoBuffs' } },
    ];

    const bare = fight({
      allies: [trained(rooted, { stats: { spd: 1, hp: 500_000, def: 1_000 } })],
      waves: [[unit('enemy', 0, { stats: { spd: 200, atk: 4_000 } })]],
    });
    const buffed = fight({
      allies: [
        trained(rooted, {
          stats: { spd: 1, hp: 500_000, def: 1_000 },
          buffs: [{ key: 'atk_up_25', turns: 99, source: null, stacks: 1 }],
        }),
      ],
      waves: [[unit('enemy', 0, { stats: { spd: 200, atk: 4_000 } })]],
    });

    // The buff switches Rooted off, so the buffed champion actually takes *more*.
    expect(firstHitOn(buffed, 'ally')).toBeGreaterThan(firstHitOn(bare, 'ally'));
  });
});

describe('procs', () => {
  it('survives one lethal blow, and only one', () => {
    const events = fight({
      allies: [trained([{ type: 'lastStand' }], { stats: { spd: 1, hp: 1_000, def: 0 } })],
      waves: [[unit('enemy', 0, { stats: { spd: 200, atk: 40_000 } })]],
    });

    const saves = of(events, 'masteryProc').filter((event) => event.mastery === 'lastStand');
    expect(saves).toHaveLength(1);
    // Saved once, then killed: the fight still ends in defeat.
    expect(of(events, 'died').some((event) => event.unit.side === 'ally')).toBe(true);
  });

  it('opens each battle behind a shield', () => {
    const events = fight({
      allies: [trained([{ type: 'battleStartShield', pctMaxHp: 25, turns: 3 }])],
      waves: [[unit('enemy', 0)]],
    });

    const shield = of(events, 'shieldGained')[0];
    expect(shield).toBeDefined();
    expect(shield!.amount).toBe(2_500);
  });

  it('answers a blow heavy enough to matter', () => {
    const events = fight({
      allies: [
        trained([{ type: 'counterProc', trigger: 'heavyHit', chance: 1, hpLostPct: 20 }], {
          stats: { spd: 1, hp: 60_000, def: 0, atk: 500 },
        }),
      ],
      waves: [[unit('enemy', 0, { stats: { spd: 200, atk: 8_000, hp: 400_000 } })]],
    });

    expect(
      of(events, 'masteryProc').filter((e) => e.mastery === 'counterProc').length,
    ).toBeGreaterThan(0);
    expect(of(events, 'counterattack').length).toBeGreaterThan(0);
  });

  it('ignores a blow that was not heavy enough', () => {
    const events = fight({
      allies: [
        trained([{ type: 'counterProc', trigger: 'heavyHit', chance: 1, hpLostPct: 90 }], {
          stats: { spd: 1, hp: 500_000, def: 2_000, atk: 500 },
        }),
      ],
      waves: [[unit('enemy', 0, { stats: { spd: 200, atk: 900, hp: 400_000 } })]],
    });

    expect(of(events, 'masteryProc').filter((e) => e.mastery === 'counterProc')).toHaveLength(0);
  });

  it('ramps a repeated basic attack and resets when something else is cast', () => {
    const flat = fight({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 2_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 9_000_000, spd: 1 } })]],
    });
    const ramped = fight({
      allies: [
        trained([{ type: 'a1Ramp', pctPerUse: 10, maxPct: 100 }], {
          stats: { spd: 200, atk: 2_000 },
        }),
      ],
      waves: [[unit('enemy', 0, { stats: { hp: 9_000_000, spd: 1 } })]],
    });

    // The first blow is identical; it is the twentieth that separates them.
    expect(firstHitOn(ramped, 'enemy')).toBe(firstHitOn(flat, 'enemy'));
    expect(damageTo(ramped, 'enemy')).toBeGreaterThan(damageTo(flat, 'enemy'));
  });

  it('takes a target’s meter the first time it is struck, and not the second', () => {
    const events = fight({
      allies: [trained([{ type: 'firstStrike', pct: 25 }], { stats: { spd: 200, atk: 10 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1 } })]],
    });

    const openers = of(events, 'masteryProc').filter((event) => event.mastery === 'firstStrike');
    expect(openers).toHaveLength(1);
  });

  it('hands the team meter when enough debuffs land in one turn', () => {
    const hex = skill('hex', {
      components: [
        { type: 'applyStatus', status: 'atk_down_50', turns: 3, target: 'hitTargets' },
        { type: 'applyStatus', status: 'def_down_60', turns: 3, target: 'hitTargets' },
      ],
      targeting: { side: 'enemy', mode: 'single' },
    });
    const events = fight({
      allies: [
        trained(
          [
            {
              type: 'turnMeterProc',
              trigger: 'debuffsLandedInTurn',
              chance: 1,
              pct: 15,
              target: 'team',
              threshold: 2,
            },
          ],
          { skills: ['hex'], stats: { spd: 200, acc: 300 } },
        ),
        unit('ally', 1, { stats: { spd: 50 } }),
      ],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1, res: 0 } })]],
      extraSkills: [hex],
    });

    const procs = of(events, 'masteryProc').filter((event) => event.mastery === 'turnMeterProc');
    expect(procs.length).toBeGreaterThan(0);
    // The whole team, not just the caster.
    const boosted = of(events, 'turnMeter').filter(
      (event) => event.deltaPct === 15 && event.target.slot === 1,
    );
    expect(boosted.length).toBeGreaterThan(0);
  });

  it('stretches its own debuffs by a turn, and never a stun', () => {
    const hex = skill('hex', {
      components: [{ type: 'applyStatus', status: 'atk_down_50', turns: 2, target: 'hitTargets' }],
    });
    const stunner = skill('stunner', {
      components: [{ type: 'applyStatus', status: 'stun', turns: 1, target: 'hitTargets' }],
    });

    const veil: MasteryEffect[] = [
      { type: 'statusDuration', mode: 'ownDebuffs', chance: 1, turns: 1, excludeHardCc: true },
    ];

    const stretched = fight({
      allies: [trained(veil, { skills: ['hex'], stats: { spd: 200, acc: 300 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1, res: 0 } })]],
      extraSkills: [hex],
    });
    const applied = of(stretched, 'statusApplied').find((event) => event.status === 'atk_down_50');
    expect(applied?.turns).toBe(3);

    const stunned = fight({
      allies: [trained(veil, { skills: ['stunner'], stats: { spd: 200, acc: 300 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1, res: 0 } })]],
      extraSkills: [stunner],
    });
    const stun = of(stunned, 'statusApplied').find((event) => event.status === 'stun');
    expect(stun?.turns).toBe(1);
  });

  it('shrugs a debuff off at the start of its turn', () => {
    const events = fight({
      allies: [
        trained([{ type: 'cleanseProc', chance: 1, count: 1 }], {
          stats: { spd: 200, hp: 500_000 },
          debuffs: [{ key: 'atk_down_50', turns: 9, source: null, stacks: 1 }],
        }),
      ],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1 } })]],
    });

    expect(
      of(events, 'masteryProc').filter((e) => e.mastery === 'cleanseProc').length,
    ).toBeGreaterThan(0);
    expect(of(events, 'statusRemoved').some((event) => event.status === 'atk_down_50')).toBe(true);
  });
});

describe('Deathmark', () => {
  it('adds damage measured off the target, and far less of it against a boss', () => {
    const mark: MasteryEffect[] = [{ type: 'bonusDamageMaxHp', chance: 1, pct: 10, bossPct: 1 }];

    const versusTrash = fight({
      allies: [trained(mark, { stats: { spd: 200, atk: 10 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 900_000, spd: 1 } })]],
    });
    const versusBoss = fight({
      allies: [trained(mark, { stats: { spd: 200, atk: 10 } })],
      waves: [
        [
          unit('enemy', 0, {
            isBoss: true,
            boss: { almightyImmunity: true, tmReductionImmune: false },
            stats: { hp: 900_000, spd: 1 },
          }),
        ],
      ],
    });

    const procs = of(versusTrash, 'masteryProc').filter((e) => e.mastery === 'bonusDamageMaxHp');
    expect(procs.length).toBeGreaterThan(0);

    // Ten percent of a 900,000 bar against one percent of the same — measured on the
    // proc's own blow, because a total would only tell us which target died first.
    const markDamage = (events: readonly BattleEvent[]): number =>
      of(events, 'damage').find((event) => event.trueDamage === true)?.amount ?? 0;
    expect(markDamage(versusTrash)).toBe(90_000);
    expect(markDamage(versusBoss)).toBe(9_000);
  });
});

describe('determinism', () => {
  it('replays a mastery-heavy fight identically from the same seed', () => {
    const build: MasteryEffect[] = [
      { type: 'damageDealt', pct: 15, condition: { type: 'targetHpBelow', pct: 60 } },
      { type: 'lifesteal', pct: 10 },
      { type: 'cooldownProc', chance: 0.5, minDamagePctMaxHp: 1 },
      { type: 'counterProc', trigger: 'heavyHit', chance: 0.5, hpLostPct: 5 },
      { type: 'bonusDamageMaxHp', chance: 0.5, pct: 5, bossPct: 2 },
      { type: 'onKill', stat: 'spd', flat: 10, maxStacks: 3, shieldPctMaxHp: 5 },
    ];
    const setup = () => ({
      allies: [trained(build, { stats: { spd: 130, atk: 3_000, hp: 40_000 } })],
      waves: [
        [unit('enemy', 0, { stats: { hp: 20_000, spd: 90, atk: 2_000 } })],
        [unit('enemy', 0, { stats: { hp: 30_000, spd: 95, atk: 2_400 } })],
      ],
      seed: 20_260_817,
    });

    expect(JSON.stringify(fight(setup()))).toBe(JSON.stringify(fight(setup())));
  });
});
