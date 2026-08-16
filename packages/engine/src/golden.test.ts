import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advance, createBattle } from './battle';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { SKILLS, skill, statusMap, unit } from './fixtures';
import type { BattleEvent, BattleRules, BattleUnit } from './types';

/**
 * Golden replays.
 *
 * A committed event log per scenario. Any change to the engine that shifts a number, a
 * roll order or an event payload fails these — which is the point: balance work should
 * move goldens *deliberately*, in a reviewed commit, never as a side effect of a
 * refactor (CLAUDE.md testing conventions, COMBAT_SYSTEM §13).
 *
 * To regenerate after an intended change: `UPDATE_GOLDENS=1 pnpm test`, then read the
 * diff before committing it. If the diff is larger than the change you made, the change
 * did more than you thought.
 */

const config = DEFAULT_COMBAT_CONFIG;
const GOLDEN_DIR = resolve(import.meta.dirname, '__goldens__');

const nuke = skill('nuke', {
  slot: 'a3',
  cooldown: 3,
  targeting: { side: 'enemy', mode: 'all' },
  components: [
    { type: 'damage', scale: 'atk', mult: 2.4, hits: 1 },
    { type: 'applyStatus', status: 'def_down_60', turns: 2, chance: 0.75, target: 'hitTargets' },
  ],
});

const support = skill('rally', {
  slot: 'a2',
  cooldown: 4,
  targeting: { side: 'ally', mode: 'all' },
  components: [
    { type: 'applyStatus', status: 'atk_up_50', turns: 2, target: 'allAllies' },
    { type: 'heal', scale: 'maxHp', mult: 0.12, target: 'allAllies' },
    { type: 'cleanse', count: 1, target: 'allAllies' },
  ],
});

const venom = skill('venom', {
  slot: 'a2',
  cooldown: 3,
  targeting: { side: 'enemy', mode: 'single' },
  components: [
    { type: 'damage', scale: 'atk', mult: 1.8, hits: 2 },
    { type: 'applyStatus', status: 'poison_5', turns: 3, chance: 0.8, target: 'hitTargets' },
  ],
});

interface Scenario {
  name: string;
  seed: number;
  allies: () => BattleUnit[];
  waves: () => BattleUnit[][];
}

const SCENARIOS: Scenario[] = [
  {
    name: 'duel',
    seed: 20_260_816,
    allies: () => [
      unit('ally', 0, {
        element: 'ember',
        stats: { hp: 16_000, atk: 1_250, def: 900, spd: 104, critRate: 25, acc: 40 },
        skills: ['strike', 'venom'],
      }),
    ],
    waves: () => [
      [
        unit('enemy', 0, {
          element: 'verdant',
          stats: { hp: 15_000, atk: 1_000, def: 800, spd: 98, res: 30 },
        }),
      ],
    ],
  },
  {
    name: 'four-on-four',
    seed: 4_040_404,
    allies: () => [
      unit('ally', 0, {
        element: 'ember',
        stats: { hp: 15_500, atk: 1_300, def: 850, spd: 112, critRate: 30, acc: 55 },
        skills: ['strike', 'nuke'],
      }),
      unit('ally', 1, {
        element: 'tide',
        stats: { hp: 18_000, atk: 950, def: 1_250, spd: 96, res: 45 },
        skills: ['strike', 'rally'],
      }),
      unit('ally', 2, {
        element: 'mist',
        stats: { hp: 17_000, atk: 1_050, def: 1_000, spd: 101, acc: 30 },
        skills: ['strike', 'venom'],
      }),
      unit('ally', 3, {
        element: 'verdant',
        stats: { hp: 19_000, atk: 900, def: 1_150, spd: 93 },
        skills: ['strike'],
      }),
    ],
    waves: () => [
      [
        unit('enemy', 0, {
          element: 'verdant',
          stats: { hp: 12_000, atk: 900, def: 700, spd: 99 },
        }),
        unit('enemy', 1, { element: 'ember', stats: { hp: 11_000, atk: 950, def: 650, spd: 103 } }),
        unit('enemy', 2, { element: 'tide', stats: { hp: 13_500, atk: 850, def: 800, spd: 95 } }),
      ],
      [
        unit('enemy', 0, {
          element: 'mist',
          stats: { hp: 40_000, atk: 1_400, def: 1_100, spd: 108, res: 60 },
          isBoss: true,
          boss: { almightyImmunity: true, tmReductionImmune: true },
          skills: ['enemy_strike'],
        }),
      ],
    ],
  },
];

function rules(): BattleRules {
  return {
    mode: 'campaign',
    skills: new Map([...SKILLS, nuke, support, venom].map((s) => [s.key, s])),
    statuses: statusMap(),
  };
}

function replay(scenario: Scenario): BattleEvent[] {
  const ruleSet = rules();
  const opening = createBattle(
    { seed: scenario.seed, mode: 'campaign', allies: scenario.allies(), waves: scenario.waves() },
    ruleSet,
    config,
  );
  const rest = advance(opening.state, ruleSet, config, { auto: true });
  return [...opening.events, ...rest.events];
}

describe('golden replays', () => {
  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s matches its committed log',
    (name, scenario) => {
      const events = replay(scenario);
      const serialised = `${JSON.stringify(events, null, 2)}\n`;
      const path = resolve(GOLDEN_DIR, `${name}.json`);

      if (process.env.UPDATE_GOLDENS) {
        writeFileSync(path, serialised, 'utf8');
      }

      const golden = readFileSync(path, 'utf8');
      expect(serialised).toEqual(golden);
    },
  );

  it.each(SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s is reproducible within a single process',
    (_name, scenario) => {
      expect(JSON.stringify(replay(scenario))).toEqual(JSON.stringify(replay(scenario)));
    },
  );

  it('covers the mechanics worth locking', () => {
    // A golden that never exercises a mechanic cannot protect it. If a scenario stops
    // producing one of these, the coverage has silently narrowed.
    const events = SCENARIOS.flatMap(replay);
    const types = new Set(events.map((event) => event.type));
    for (const required of [
      'battleStart',
      'turnStart',
      'skillUsed',
      'damage',
      'statusApplied',
      'cooldownChanged',
      'died',
      'waveCleared',
      'waveStart',
      'battleEnd',
    ] as const) {
      expect(types.has(required), `golden logs never emit ${required}`).toBe(true);
    }
  });
});
