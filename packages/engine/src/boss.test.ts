import { describe, expect, it } from 'vitest';
import type { SkillDef } from '@mistvale/shared';
import { advance, createBattle } from './battle';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { SKILLS, skill, statusMap, unit } from './fixtures';
import type { BattleEvent, BattleRules, BattleUnit } from './types';

/**
 * Boss mechanics.
 *
 * Each of these is a promise the content makes to the player — "break the shield or be
 * punished", "burst it in fewer steps", "clear the adds" — so the tests are written from
 * the player's side of the promise rather than from the implementation's.
 */

const config = DEFAULT_COMBAT_CONFIG;

function rules(extra: readonly SkillDef[] = []): BattleRules {
  return {
    mode: 'dungeon',
    skills: new Map([...SKILLS, ...extra].map((entry) => [entry.key, entry])),
    statuses: statusMap(),
  };
}

/** Runs a whole fight and returns its log. */
function fight(options: {
  allies: BattleUnit[];
  waves: BattleUnit[][];
  extraSkills?: readonly SkillDef[];
  seed?: number;
}): BattleEvent[] {
  const ruleSet = rules(options.extraSkills);
  const opened = createBattle(
    { seed: options.seed ?? 7, mode: 'dungeon', allies: options.allies, waves: options.waves },
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

/** A boss slow enough that the player gets several swings before it acts. */
function boss(flags: Partial<BattleUnit['boss']>, stats: Partial<BattleUnit['stats']> = {}) {
  return unit('enemy', 0, {
    isBoss: true,
    boss: { almightyImmunity: true, tmReductionImmune: false, ...flags },
    stats: { hp: 400_000, spd: 30, atk: 400, def: 500, ...stats },
  });
}

describe('the hit-counter shield', () => {
  it('absorbs every blow until the count is spent', () => {
    const events = fight({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 4_000 } })],
      waves: [[boss({ hitShield: { hits: 3, punishTmPct: 30 } })]],
    });

    const shieldHits = of(events, 'bossShield').filter((event) => event.up || event.hits === 0);
    expect(shieldHits.length).toBeGreaterThan(0);

    // The first three player hits land on the shield and cost the boss no HP at all.
    const early = of(events, 'damage')
      .filter((event) => event.target.side === 'enemy')
      .slice(0, 3);
    expect(early).toHaveLength(3);
    for (const hit of early) {
      expect(hit.amount).toBe(0);
      expect(hit.absorbed).toBeGreaterThan(0);
    }

    // The fourth gets through.
    const fourth = of(events, 'damage').filter((event) => event.target.side === 'enemy')[3];
    expect(fourth?.amount).toBeGreaterThan(0);
  });

  it('counts hits rather than damage, so a multi-hit skill breaks it in one turn', () => {
    const flurry = skill('flurry', {
      components: [{ type: 'damage', scale: 'atk', mult: 0.4, hits: 4 }],
    });
    const events = fight({
      allies: [unit('ally', 0, { skills: ['flurry'], stats: { spd: 200, atk: 4_000 } })],
      waves: [[boss({ hitShield: { hits: 3, punishTmPct: 30 } })]],
      extraSkills: [flurry],
    });

    const broken = of(events, 'bossShield').find((event) => !event.up);
    const firstRealHit = of(events, 'damage').find(
      (event) => event.target.side === 'enemy' && event.amount > 0,
    );
    expect(broken).toBeDefined();
    expect(firstRealHit).toBeDefined();
    // The fourth hit of the very first skill is the one that connects.
    expect(firstRealHit!.hitIndex).toBe(3);
  });

  it('punishes the team when it survives to the boss’s turn', () => {
    const events = fight({
      // Nobody breaks a twelve-hit shield with single strikes before the boss acts.
      allies: [unit('ally', 0, { stats: { spd: 100, atk: 2_000 } })],
      waves: [[boss({ hitShield: { hits: 12, punishTmPct: 40 } }, { spd: 90 })]],
    });

    const punishes = of(events, 'bossPunish');
    expect(punishes.length).toBeGreaterThan(0);
    expect(punishes[0]!.tmPct).toBe(40);

    // The punish drains the meter of everyone opposite.
    const drained = of(events, 'turnMeter').filter(
      (event) => event.deltaPct === -40 && event.target.side === 'ally',
    );
    expect(drained.length).toBeGreaterThan(0);
  });

  it('restores the count only after the boss has finished reeling', () => {
    const flurry = skill('flurry', {
      components: [{ type: 'damage', scale: 'atk', mult: 0.3, hits: 5 }],
    });
    const events = fight({
      allies: [unit('ally', 0, { skills: ['flurry'], stats: { spd: 220, atk: 2_000 } })],
      waves: [[boss({ hitShield: { hits: 4, punishTmPct: 20 } }, { hp: 400_000, spd: 60 })]],
      extraSkills: [flurry],
    });

    const beats = events.filter(
      (event) => event.type === 'bossExposed' || (event.type === 'bossShield' && event.hits === 4),
    );
    // Exposed first, restored after — never the other way round, or the window the break
    // buys would close before the team could use it.
    expect(beats[0]?.type).toBe('bossExposed');
    expect(beats[1]?.type).toBe('bossShield');
  });

  it('lets damage over time chip through without touching the counter', () => {
    // Nothing but poison: no hit ever lands, so the counter has nothing to react to.
    const venom = skill('venom', {
      components: [{ type: 'applyStatus', status: 'poison_5', turns: 8, target: 'hitTargets' }],
    });
    const events = fight({
      allies: [unit('ally', 0, { skills: ['venom'], stats: { spd: 200, acc: 200 } })],
      waves: [[boss({ hitShield: { hits: 20, punishTmPct: 10 } }, { hp: 60_000, res: 0 })]],
      extraSkills: [venom],
    });

    // Poison ticks are true damage: they land on HP while the shield still stands.
    const ticks = of(events, 'damage').filter(
      (event) => event.target.side === 'enemy' && event.trueDamage === true && event.amount > 0,
    );
    expect(ticks.length).toBeGreaterThan(0);

    // …and the counter never moves, because only real hits register against it.
    expect(of(events, 'bossShield')).toHaveLength(0);
    expect(of(events, 'bossExposed')).toHaveLength(0);
  });

  it('keeps the count between the boss’s turns, so chipping at it adds up', () => {
    const events = fight({
      // One strike per turn against an eight-hit shield: it can only fall if the count
      // survives the boss's turns in between.
      allies: [unit('ally', 0, { stats: { spd: 120, atk: 3_000 } })],
      waves: [[boss({ hitShield: { hits: 8, punishTmPct: 15 } }, { hp: 200_000, spd: 100 })]],
    });

    expect(of(events, 'bossPunish').length).toBeGreaterThan(0);
    expect(of(events, 'bossExposed').length).toBeGreaterThan(0);

    // Breaking it buys a turn the boss does not get to take, and a window in which real
    // damage lands.
    const realHits = of(events, 'damage').filter(
      (event) => event.target.side === 'enemy' && event.amount > 0,
    );
    expect(realHits.length).toBeGreaterThan(0);
  });
});

describe('threshold retaliation', () => {
  it('swings back each time its HP falls through a band', () => {
    const events = fight({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 20_000 } })],
      waves: [
        [
          boss(
            { thresholdRetaliation: { perHpPct: 20, skipIfDot: true } },
            { hp: 200_000, spd: 20 },
          ),
        ],
      ],
    });

    expect(of(events, 'bossRetaliate').length).toBeGreaterThan(0);
  });

  it('owes one retaliation per band, even when a single blow crosses several', () => {
    const execute = skill('execute', {
      components: [{ type: 'damage', scale: 'atk', mult: 60, hits: 1 }],
    });
    const events = fight({
      allies: [unit('ally', 0, { skills: ['execute'], stats: { spd: 200, atk: 20_000 } })],
      waves: [
        [
          boss(
            { thresholdRetaliation: { perHpPct: 10, skipIfDot: true } },
            { hp: 3_000_000, def: 0, spd: 10 },
          ),
        ],
      ],
      extraSkills: [execute],
    });

    // The opening blow alone carries the boss through more than one tenth of its bar.
    const firstTurnRetaliations = of(events, 'bossRetaliate').length;
    expect(firstTurnRetaliations).toBeGreaterThan(1);
  });

  it('ignores damage over time when the content says to', () => {
    const venom = skill('venom', {
      components: [{ type: 'applyStatus', status: 'poison_5', turns: 6, target: 'hitTargets' }],
      targeting: { side: 'enemy', mode: 'single' },
    });
    const events = fight({
      allies: [unit('ally', 0, { skills: ['venom'], stats: { spd: 200, acc: 200 } })],
      waves: [
        [
          boss(
            { thresholdRetaliation: { perHpPct: 5, skipIfDot: true } },
            { hp: 20_000, spd: 15, res: 0 },
          ),
        ],
      ],
      extraSkills: [venom],
    });

    const poisonTicks = of(events, 'damage').filter(
      (event) => event.target.side === 'enemy' && event.trueDamage === true,
    );
    expect(poisonTicks.length).toBeGreaterThan(0);
    expect(of(events, 'bossRetaliate')).toHaveLength(0);
  });
});

describe('add summoning', () => {
  it('calls adds at the start of its turn, up to the cap', () => {
    const add = unit('enemy', 0, { defKey: 'brood_spawn', stats: { hp: 3_000, spd: 80 } });
    const events = fight({
      allies: [unit('ally', 0, { stats: { spd: 60, atk: 100 } })],
      waves: [
        [
          boss(
            { addSummon: { perTurn: 2, cap: 4, template: add } },
            { hp: 900_000, spd: 120, atk: 50 },
          ),
        ],
      ],
    });

    const summons = of(events, 'bossSummon');
    expect(summons.length).toBeGreaterThan(0);
    expect(summons[0]!.summoned).toHaveLength(2);

    // Never more than the cap alive at once: every summon event is bounded by what is
    // missing, so the totals across a fight can exceed the cap only as replacements.
    for (const event of summons) expect(event.summoned.length).toBeLessThanOrEqual(4);

    // The adds are real combatants, not decoration: they occupy their own refs.
    const slots = new Set(summons.flatMap((event) => event.summoned.map((add) => add.ref.slot)));
    expect(slots.size).toBeGreaterThan(1);
  });

  it('stops summoning while the cap is full', () => {
    const add = unit('enemy', 0, { defKey: 'brood_spawn', stats: { hp: 999_999, spd: 5 } });
    const events = fight({
      // Allies too weak to kill anything, so the cap genuinely stays full.
      allies: [unit('ally', 0, { stats: { spd: 40, atk: 1 } })],
      waves: [
        [boss({ addSummon: { perTurn: 1, cap: 2, template: add } }, { hp: 900_000, spd: 200 })],
      ],
    });

    const summoned = of(events, 'bossSummon').flatMap((event) => event.summoned);
    expect(summoned).toHaveLength(2);
  });
});

describe('enrage', () => {
  it('announces the ramp once and then hits harder every turn', () => {
    const events = fight({
      allies: [
        unit('ally', 0, { stats: { spd: 100, atk: 1, hp: 5_000_000 } }),
        unit('ally', 1, { stats: { spd: 100, atk: 1, hp: 5_000_000 } }),
      ],
      waves: [[boss({ enrage: { afterTurn: 4, dmgPctPerTurn: 25 } }, { hp: 9_000_000, spd: 100 })]],
    });

    const announcements = of(events, 'bossEnraged');
    expect(announcements).toHaveLength(1);
    expect(announcements[0]!.pct).toBeGreaterThan(0);

    // Damage from the boss grows: the last blow of the fight beats the first.
    const bossHits = of(events, 'damage').filter(
      (event) => event.source.side === 'enemy' && event.target.side === 'ally' && event.amount > 0,
    );
    expect(bossHits.length).toBeGreaterThan(2);
    expect(bossHits[bossHits.length - 1]!.amount).toBeGreaterThan(bossHits[0]!.amount);
  });

  it('leaves a boss without the mechanic exactly as it was', () => {
    const events = fight({
      allies: [unit('ally', 0, { stats: { spd: 100, atk: 1, hp: 5_000_000 } })],
      waves: [[boss({}, { hp: 9_000_000, spd: 100 })]],
    });
    expect(of(events, 'bossEnraged')).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('replays a boss fight with every mechanic identically from the same seed', () => {
    const add = unit('enemy', 1, { defKey: 'brood_spawn', stats: { hp: 4_000, spd: 70 } });
    const setup = () => ({
      allies: [unit('ally', 0, { stats: { spd: 130, atk: 3_000, acc: 100 } })],
      waves: [
        [
          boss(
            {
              hitShield: { hits: 4, punishTmPct: 20 },
              thresholdRetaliation: { perHpPct: 25, skipIfDot: true },
              addSummon: { perTurn: 1, cap: 3, template: add },
              enrage: { afterTurn: 10, dmgPctPerTurn: 5 },
            },
            { hp: 300_000, spd: 90 },
          ),
        ],
      ],
      seed: 20_260_816,
    });

    const first = fight(setup());
    const second = fight(setup());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
