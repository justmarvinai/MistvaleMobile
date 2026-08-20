import { describe, expect, it } from 'vitest';
import type { SkillDef } from '@mistvale/shared';
import { advance, createBattle, retreat } from './battle';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { SKILLS, skill, statusMap, unit } from './fixtures';
import type { BattleEvent, BattleRules, BattleState, BattleUnit } from './types';

/**
 * The simulation, end to end.
 *
 * The unit tests pin individual formulas; these pin how they combine — the order damage
 * passes through protection and shields, what a wave transition really resets, and the
 * determinism the whole replay story rests on.
 */

const config = DEFAULT_COMBAT_CONFIG;

function rulesWith(extra: readonly SkillDef[] = []): BattleRules {
  return {
    mode: 'campaign',
    skills: new Map([...SKILLS, ...extra].map((s) => [s.key, s])),
    statuses: statusMap(),
  };
}

function battle(options: {
  allies: BattleUnit[];
  waves: BattleUnit[][];
  extraSkills?: readonly SkillDef[];
  seed?: number;
  mode?: BattleState['mode'];
}) {
  const rules = { ...rulesWith(options.extraSkills), mode: options.mode ?? 'campaign' };
  const started = createBattle(
    {
      seed: options.seed ?? 42,
      mode: options.mode ?? 'campaign',
      allies: options.allies,
      waves: options.waves,
    },
    rules,
    config,
  );
  return { rules, ...started };
}

function runToEnd(state: BattleState, rules: BattleRules): BattleEvent[] {
  const result = advance(state, rules, config, { auto: true });
  return result.events;
}

/**
 * Plays exactly one player turn in manual mode.
 *
 * Manual play pauses twice per turn: once when the unit is ready to choose, and again at
 * the next unit that needs input. The first call runs everything up to the choice, the
 * second supplies it — the AI picks when no action is given.
 */
function playTurn(
  state: BattleState,
  rules: BattleRules,
  action?: { skill: string; target?: { side: 'ally' | 'enemy'; slot: number } },
): BattleEvent[] {
  const opening = advance(state, rules, config, { auto: false });
  const acting = advance(state, rules, config, { auto: false, action });
  return [...opening.events, ...acting.events];
}

const eventsOf = <T extends BattleEvent['type']>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] =>
  events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);

// ── Basic flow ──────────────────────────────────────────────────────────────

describe('a battle', () => {
  it('opens with a battleStart carrying both teams', () => {
    const { events } = battle({
      allies: [unit('ally', 0)],
      waves: [[unit('enemy', 0)]],
    });
    const start = eventsOf(events, 'battleStart')[0];
    expect(start).toBeDefined();
    expect(start?.allies).toHaveLength(1);
    expect(start?.enemies).toHaveLength(1);
  });

  it('runs to victory when the player team is far stronger', () => {
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 5_000, spd: 200 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 1_000, def: 0, spd: 50 } })]],
    });
    const events = runToEnd(state, rules);

    expect(state.finished).toBe(true);
    expect(state.outcome).toBe('victory');
    expect(eventsOf(events, 'battleEnd')[0]?.outcome).toBe('victory');
  });

  it('runs to defeat when the enemy team is far stronger', () => {
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { hp: 500, def: 0, spd: 50 } })],
      waves: [[unit('enemy', 0, { stats: { atk: 5_000, spd: 200 } })]],
    });
    runToEnd(state, rules);
    expect(state.outcome).toBe('defeat');
  });

  it('assigns every event a unique, monotonic id', () => {
    const {
      state,
      rules,
      events: opening,
    } = battle({
      allies: [unit('ally', 0, { stats: { atk: 3_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 4_000, def: 0 } })]],
    });
    const all = [...opening, ...runToEnd(state, rules)];
    expect(all.map((event) => event.id)).toEqual(all.map((_, index) => index));
  });

  it('stops at the turn cap and calls it a loss', () => {
    // Two units that cannot meaningfully hurt each other.
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 1, def: 50_000, hp: 50_000 } })],
      waves: [[unit('enemy', 0, { stats: { atk: 1, def: 50_000, hp: 50_000 } })]],
    });
    runToEnd(state, rules);
    expect(state.outcome).toBe('turnLimit');
    expect(state.turn).toBeGreaterThanOrEqual(config.maxTurns);
  });

  it('ends on retreat without touching the outcome rules', () => {
    const { state, rules } = battle({ allies: [unit('ally', 0)], waves: [[unit('enemy', 0)]] });
    const { events } = retreat(state, rules, config);
    expect(state.outcome).toBe('retreat');
    expect(eventsOf(events, 'battleEnd')[0]?.outcome).toBe('retreat');
  });

  it('is a no-op once finished', () => {
    const { state, rules } = battle({ allies: [unit('ally', 0)], waves: [[unit('enemy', 0)]] });
    retreat(state, rules, config);
    expect(advance(state, rules, config, { auto: true }).events).toEqual([]);
  });
});

// ── Determinism ─────────────────────────────────────────────────────────────

describe('determinism', () => {
  const setup = () => ({
    allies: [
      unit('ally', 0, { stats: { atk: 1_200, spd: 110, critRate: 30 }, element: 'ember' }),
      unit('ally', 1, { stats: { atk: 900, spd: 95 }, element: 'tide' }),
    ],
    waves: [
      [
        unit('enemy', 0, { stats: { hp: 8_000, spd: 100 }, element: 'verdant' }),
        unit('enemy', 1, { stats: { hp: 6_000, spd: 105 }, element: 'ember' }),
      ],
    ],
  });

  it('replays byte-identically from the same seed', () => {
    const first = battle({ ...setup(), seed: 12_345 });
    const second = battle({ ...setup(), seed: 12_345 });

    const a = [...first.events, ...runToEnd(first.state, first.rules)];
    const b = [...second.events, ...runToEnd(second.state, second.rules)];

    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(first.state.outcome).toBe(second.state.outcome);
    expect(first.state.turn).toBe(second.state.turn);
  });

  it('diverges on a different seed', () => {
    const first = battle({ ...setup(), seed: 1 });
    const second = battle({ ...setup(), seed: 2 });
    const a = [...first.events, ...runToEnd(first.state, first.rules)];
    const b = [...second.events, ...runToEnd(second.state, second.rules)];
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('resumes mid-battle from a serialised state and lands in the same place', () => {
    const whole = battle({ ...setup(), seed: 777 });
    const wholeEvents = [...whole.events, ...runToEnd(whole.state, whole.rules)];

    // Same battle, but stepped one turn at a time through a JSON round-trip, exactly as
    // a paused-and-resumed session would be.
    const piecewise = battle({ ...setup(), seed: 777 });
    let state: BattleState = JSON.parse(JSON.stringify(piecewise.state)) as BattleState;
    const events: BattleEvent[] = [...piecewise.events];
    for (let guard = 0; guard < 500 && !state.finished; guard += 1) {
      const step = advance(state, piecewise.rules, config, { auto: false });
      events.push(...step.events);
      state = JSON.parse(JSON.stringify(step.state)) as BattleState;
      if (state.awaiting) {
        const step2 = advance(state, piecewise.rules, config, { auto: true });
        events.push(...step2.events);
        state = JSON.parse(JSON.stringify(step2.state)) as BattleState;
        break;
      }
    }
    expect(state.outcome).toBe(whole.state.outcome);
    expect(events.length).toBe(wholeEvents.length);
  });
});

// ── Damage interactions ─────────────────────────────────────────────────────

describe('damage application order', () => {
  it('absorbs into a shield before HP, and reports both numbers', () => {
    const target = unit('enemy', 0, { stats: { hp: 10_000, def: 0 } });
    target.buffs.push({ key: 'shield', turns: 3, source: null, stacks: 1, shield: 500 });

    const attacker = unit('ally', 0, { stats: { atk: 1_000, spd: 200, critRate: 0 } });
    const { state, rules } = battle({ allies: [attacker], waves: [[target]] });
    const events = runToEnd(state, rules);

    const first = eventsOf(events, 'damage')[0]!;
    expect(first.absorbed).toBeGreaterThan(0);
    expect(first.absorbed + first.amount).toBeGreaterThan(0);
  });

  it('drops a shield once its pool is spent', () => {
    const target = unit('enemy', 0, { stats: { hp: 10_000, def: 0, spd: 1 } });
    target.buffs.push({ key: 'shield', turns: 9, source: null, stacks: 1, shield: 10 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 2_000, spd: 200 } })],
      waves: [[target]],
    });
    const events = runToEnd(state, rules);
    expect(eventsOf(events, 'statusRemoved').some((e) => e.by === 'broken')).toBe(true);
  });

  it('splits a blow with the protector under Ally Protection', () => {
    const protector = unit('enemy', 1, { stats: { hp: 20_000, def: 0, spd: 1 } });
    const protectee = unit('enemy', 0, { stats: { hp: 20_000, def: 0, spd: 1 } });
    protectee.buffs.push({
      key: 'ally_protection_50',
      turns: 5,
      source: protector.ref,
      stacks: 1,
    });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 1_000, spd: 200 } })],
      waves: [[protectee, protector]],
    });
    const events = playTurn(state, rules);

    const damage = eventsOf(events, 'damage');
    const redirected = damage.find((event) => event.redirectedFrom);
    expect(redirected).toBeDefined();
    expect(redirected?.target).toEqual(protector.ref);
    expect(redirected?.redirectedFrom).toEqual(protectee.ref);
  });

  it('floors HP at 1 under Unkillable instead of killing', () => {
    const target = unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } });
    target.buffs.push({ key: 'unkillable', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 10_000, spd: 200 } })],
      waves: [[target]],
    });
    const events = playTurn(state, rules);

    expect(eventsOf(events, 'unkillable')).not.toHaveLength(0);
    expect(eventsOf(events, 'died')).toHaveLength(0);
    expect(state.enemies[0]?.hp).toBe(1);
  });
});

describe('reactive effects', () => {
  it('counterattacks with the A1 at the configured ratio', () => {
    const defender = unit('enemy', 0, { stats: { hp: 40_000, def: 0, spd: 1, atk: 1_000 } });
    defender.buffs.push({ key: 'counterattack', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 1_000, spd: 200, hp: 40_000 } })],
      waves: [[defender]],
    });
    const events = playTurn(state, rules);

    expect(eventsOf(events, 'counterattack')).not.toHaveLength(0);
    // The counter must land on the attacker, not on the counterattacker's own team.
    expect(eventsOf(events, 'counterattack')[0]?.target).toEqual({ side: 'ally', slot: 0 });
  });

  it('does not let two counterattackers loop forever', () => {
    const enemy = unit('enemy', 0, { stats: { hp: 60_000, def: 0, spd: 1, atk: 500 } });
    enemy.buffs.push({ key: 'counterattack', turns: 9, source: null, stacks: 1 });
    const ally = unit('ally', 0, { stats: { hp: 60_000, def: 0, spd: 200, atk: 500 } });
    ally.buffs.push({ key: 'counterattack', turns: 9, source: null, stacks: 1 });

    const { state, rules } = battle({ allies: [ally], waves: [[enemy]] });
    // If counters chained, this would never return.
    const events = playTurn(state, rules);
    expect(eventsOf(events, 'counterattack').length).toBeLessThanOrEqual(2);
  });

  it('reflects a share of damage back at the attacker', () => {
    const target = unit('enemy', 0, { stats: { hp: 40_000, def: 0, spd: 1 } });
    target.buffs.push({ key: 'reflect_30', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { atk: 1_000, spd: 200, hp: 40_000 } })],
      waves: [[target]],
    });
    const events = playTurn(state, rules);
    expect(eventsOf(events, 'reflected')).not.toHaveLength(0);
  });

  it('heals the attacker under Vampiric and the attacker under Leech', () => {
    const vampire = unit('ally', 0, { stats: { atk: 1_000, spd: 200, hp: 40_000 } });
    vampire.hp = 20_000;
    vampire.buffs.push({ key: 'vampiric_25', turns: 9, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [vampire],
      waves: [[unit('enemy', 0, { stats: { hp: 40_000, def: 0, spd: 1 } })]],
    });
    const events = playTurn(state, rules);
    expect(eventsOf(events, 'heal').some((e) => e.target.side === 'ally')).toBe(true);
  });
});

// ── Statuses in play ────────────────────────────────────────────────────────

describe('statuses during a fight', () => {
  it('ticks Poison at the start of the poisoned unit’s turn, bypassing DEF', () => {
    const poisoned = unit('enemy', 0, { stats: { hp: 10_000, def: 50_000, spd: 150 } });
    poisoned.debuffs.push({ key: 'poison_5', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 1 } })],
      waves: [[poisoned]],
    });
    const events = advance(state, rules, config, { auto: false }).events;

    const tick = eventsOf(events, 'damage').find((event) => event.trueDamage);
    expect(tick).toBeDefined();
    // 5% of 10,000, undiminished by the enormous DEF.
    expect(tick?.amount).toBe(500);
  });

  it('scales a Poison tick with its stacks', () => {
    const poisoned = unit('enemy', 0, { stats: { hp: 10_000, def: 0, spd: 150 } });
    poisoned.debuffs.push({ key: 'poison_5', turns: 5, source: null, stacks: 3 });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 1 } })],
      waves: [[poisoned]],
    });
    const events = advance(state, rules, config, { auto: false }).events;
    expect(eventsOf(events, 'damage').find((e) => e.trueDamage)?.amount).toBe(1_500);
  });

  it('splashes HP Burn onto the burning unit’s allies', () => {
    const burning = unit('enemy', 0, { stats: { hp: 10_000, def: 0, spd: 150 } });
    burning.debuffs.push({ key: 'hp_burn', turns: 5, source: null, stacks: 1 });
    const bystander = unit('enemy', 1, { stats: { hp: 10_000, def: 0, spd: 1 } });

    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 1 } })],
      waves: [[burning, bystander]],
    });
    const events = advance(state, rules, config, { auto: false }).events;

    const splash = eventsOf(events, 'damage').find(
      (event) => event.trueDamage && event.target.slot === 1,
    );
    expect(splash).toBeDefined();
    expect(splash?.amount).toBe(300); // 3% of the burning unit's max HP.
  });

  it('heals over time at the start of the holder’s turn', () => {
    const wounded = unit('ally', 0, { stats: { hp: 10_000, spd: 150 } });
    wounded.hp = 5_000;
    wounded.buffs.push({ key: 'continuous_heal_15', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [wounded],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 50_000 } })]],
    });
    const events = advance(state, rules, config, { auto: false }).events;
    expect(eventsOf(events, 'heal')[0]?.amount).toBe(1_500);
  });

  it('halves healing under Heal Reduction', () => {
    const wounded = unit('ally', 0, { stats: { hp: 10_000, spd: 150 } });
    wounded.hp = 5_000;
    wounded.buffs.push({ key: 'continuous_heal_15', turns: 5, source: null, stacks: 1 });
    wounded.debuffs.push({ key: 'heal_reduction_50', turns: 5, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [wounded],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 50_000 } })]],
    });
    const events = advance(state, rules, config, { auto: false }).events;
    expect(eventsOf(events, 'heal')[0]?.amount).toBe(750);
  });

  it('skips a stunned unit’s turn and still expires the stun', () => {
    const stunned = unit('ally', 0, { stats: { spd: 150 } });
    stunned.debuffs.push({ key: 'stun', turns: 1, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [stunned],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 50_000 } })]],
    });
    const events = advance(state, rules, config, { auto: false }).events;

    expect(eventsOf(events, 'turnSkipped')[0]?.reason).toBe('stun');
    expect(eventsOf(events, 'statusExpired').some((e) => e.status === 'stun')).toBe(true);
  });

  it('forces a provoked unit to swing at its provoker', () => {
    const provoker = unit('enemy', 1, { stats: { hp: 50_000, def: 0, spd: 1 } });
    const attacker = unit('ally', 0, { stats: { spd: 200, atk: 1_000 } });
    attacker.debuffs.push({ key: 'provoke', turns: 3, source: provoker.ref, stacks: 1 });

    const { state, rules } = battle({
      allies: [attacker],
      waves: [[unit('enemy', 0, { stats: { hp: 50_000, def: 0, spd: 1 } }), provoker]],
    });
    const events = playTurn(state, rules);

    const skillUsed = eventsOf(events, 'skillUsed')[0];
    expect(skillUsed?.targets).toEqual([provoker.ref]);
  });
});

// ── Waves ───────────────────────────────────────────────────────────────────

describe('waves', () => {
  const twoWaveBattle = () =>
    battle({
      allies: [unit('ally', 0, { stats: { atk: 10_000, spd: 200, hp: 20_000 } })],
      waves: [
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
      ],
    });

  it('moves to the next wave rather than ending the battle', () => {
    const { state, rules } = twoWaveBattle();
    const events = runToEnd(state, rules);

    expect(eventsOf(events, 'waveCleared')).toHaveLength(1);
    expect(eventsOf(events, 'waveStart')).toHaveLength(1);
    expect(state.outcome).toBe('victory');
    expect(state.wave).toBe(1);
  });

  it('clears both effect bars, heals survivors and resets meters', () => {
    const hero = unit('ally', 0, { stats: { atk: 10_000, spd: 200, hp: 20_000 } });
    hero.hp = 10_000;
    hero.buffs.push({ key: 'atk_up_25', turns: 9, source: null, stacks: 1 });
    hero.debuffs.push({ key: 'poison_5', turns: 9, source: null, stacks: 1 });

    const { state, rules } = battle({
      allies: [hero],
      waves: [
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
        [unit('enemy', 0, { stats: { hp: 5_000_000, def: 0, spd: 1 } })],
      ],
    });
    playTurn(state, rules);

    const survivor = state.allies[0]!;
    expect(survivor.buffs).toHaveLength(0);
    expect(survivor.debuffs).toHaveLength(0);
    // 10,000 at the start, less a 1,000 Poison tick (5% of 20,000 max HP) at the top of
    // its turn, plus the 2,000 the transition restores (10% of max HP).
    expect(survivor.hp).toBe(11_000);
  });

  it('reports the heal amounts on the waveCleared event', () => {
    const hero = unit('ally', 0, { stats: { atk: 10_000, spd: 200, hp: 20_000 } });
    hero.hp = 10_000;
    const { state, rules } = battle({
      allies: [hero],
      waves: [
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
        [unit('enemy', 0, { stats: { hp: 5_000_000, def: 0, spd: 1 } })],
      ],
    });
    const events = playTurn(state, rules);
    expect(eventsOf(events, 'waveCleared')[0]?.healed).toEqual([
      { unit: { side: 'ally', slot: 0 }, amount: 2_000 },
    ]);
  });

  it('carries HP and deaths across the transition', () => {
    const wounded = unit('ally', 0, { stats: { atk: 10_000, spd: 200, hp: 20_000 } });
    wounded.hp = 5_000;
    const dead = unit('ally', 1, { stats: { spd: 1 }, alive: false, hp: 0 });

    const { state, rules } = battle({
      allies: [wounded, dead],
      waves: [
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
        [unit('enemy', 0, { stats: { hp: 5_000_000, def: 0, spd: 1 } })],
      ],
    });
    playTurn(state, rules);

    expect(state.allies[0]?.hp).toBe(7_000);
    expect(state.allies[1]?.alive).toBe(false);
    expect(state.allies[1]?.hp).toBe(0);
  });

  it('ticks a cooldown down by one on the transition', () => {
    const nuke = skill('nuke', { slot: 'a2', cooldown: 4 });
    const hero = unit('ally', 0, {
      stats: { atk: 10_000, spd: 200, hp: 20_000 },
      skills: ['strike', 'nuke'],
      cooldowns: { nuke: 3 },
    });

    const { state, rules } = battle({
      allies: [hero],
      waves: [
        [unit('enemy', 0, { stats: { hp: 100, def: 0, spd: 1 } })],
        [unit('enemy', 0, { stats: { hp: 5_000_000, def: 0, spd: 1 } })],
      ],
      extraSkills: [nuke],
    });
    playTurn(state, rules);
    // One tick for the turn that cleared the wave, one for the transition itself.
    expect(state.allies[0]?.cooldowns.nuke).toBeLessThanOrEqual(2);
  });
});

// ── Manual play ─────────────────────────────────────────────────────────────

describe('manual play', () => {
  it('stops and reports which unit is waiting', () => {
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200 } })],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 500_000 } })]],
    });
    advance(state, rules, config, { auto: false });
    expect(state.awaiting).toEqual({ side: 'ally', slot: 0 });
  });

  it('uses the skill and target the player chose', () => {
    const nuke = skill('nuke', { slot: 'a2', cooldown: 3 });
    const hero = unit('ally', 0, { stats: { spd: 200, atk: 1_000 }, skills: ['strike', 'nuke'] });

    const { state, rules } = battle({
      allies: [hero],
      waves: [
        [
          unit('enemy', 0, { stats: { hp: 500_000, spd: 1 } }),
          unit('enemy', 1, { stats: { hp: 500_000, spd: 1 } }),
        ],
      ],
      extraSkills: [nuke],
    });

    const events = playTurn(state, rules, { skill: 'nuke', target: { side: 'enemy', slot: 1 } });

    const used = eventsOf(events, 'skillUsed')[0];
    expect(used?.skill).toBe('nuke');
    expect(used?.targets).toEqual([{ side: 'enemy', slot: 1 }]);
  });

  it('puts a used skill on cooldown and lets it come back', () => {
    const nuke = skill('nuke', { slot: 'a2', cooldown: 2 });
    const hero = unit('ally', 0, { stats: { spd: 200, atk: 100 }, skills: ['strike', 'nuke'] });

    const { state, rules } = battle({
      allies: [hero],
      waves: [[unit('enemy', 0, { stats: { hp: 500_000, spd: 1 } })]],
      extraSkills: [nuke],
    });

    playTurn(state, rules, { skill: 'nuke' });
    expect(state.allies[0]?.cooldowns.nuke).toBe(2);
  });

  it('falls back to the AI when handed an illegal action', () => {
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 1_000 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 500_000, spd: 1 } })]],
    });
    const events = playTurn(state, rules, { skill: 'a_skill_this_unit_does_not_have' });
    expect(eventsOf(events, 'skillUsed')[0]?.skill).toBe('strike');
  });
});

// ── Properties ──────────────────────────────────────────────────────────────

describe('auto-battle the player can take back', () => {
  /**
   * `auto: true` used to mean "resolve the whole fight", full stop — which is right for
   * multi-battle and the Arena, and is why the Auto *button* could be turned on and never
   * off: by the time the player pressed it again the battle was already decided on the
   * server and only the playback was left. `autoTurns` is what makes it a real toggle.
   */
  it('stops after the number of player turns it was given', () => {
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 1 } })],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 500_000 } })]],
    });

    advance(state, rules, config, { auto: true, autoTurns: 1 });

    expect(state.finished, 'the fight is still going').toBe(false);
    expect(state.awaiting, 'and it is the player who is waited on').toEqual({
      side: 'ally',
      slot: 0,
    });
  });

  it('still runs the fight out when it is not told where to stop', () => {
    // Multi-battle and the Arena, unchanged.
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 5_000 } })],
      waves: [[unit('enemy', 0, { stats: { spd: 1, hp: 100 } })]],
    });

    advance(state, rules, config, { auto: true });

    expect(state.finished).toBe(true);
  });

  it('concentrates on the enemy the player picked', () => {
    // Two identical foes, and a fight the AI would otherwise spread across them.
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 100 } })],
      waves: [
        [
          unit('enemy', 0, { stats: { hp: 500_000, spd: 1 } }),
          unit('enemy', 1, { stats: { hp: 500_000, spd: 1 } }),
        ],
      ],
    });

    const focus = { side: 'enemy', slot: 1 } as const;
    const { events } = advance(state, rules, config, { auto: true, autoTurns: 4, focus });

    const hit = eventsOf(events, 'skillUsed').flatMap((event) => event.targets);
    expect(hit.length, 'the ally took its turns').toBeGreaterThan(0);
    for (const target of hit) expect(target).toEqual(focus);
  });

  it('treats a focus as a preference, never as an order', () => {
    // A focus that is already dead must not wedge the fight or retarget anything.
    const { state, rules } = battle({
      allies: [unit('ally', 0, { stats: { spd: 200, atk: 100 } })],
      waves: [[unit('enemy', 0, { stats: { hp: 500_000, spd: 1 } })]],
    });

    const { events } = advance(state, rules, config, {
      auto: true,
      autoTurns: 2,
      focus: { side: 'enemy', slot: 3 },
    });

    const hit = eventsOf(events, 'skillUsed').flatMap((event) => event.targets);
    expect(hit.length).toBeGreaterThan(0);
    for (const target of hit) expect(target).toEqual({ side: 'enemy', slot: 0 });
  });
});

describe('invariants', () => {
  const randomTeam = (side: 'ally' | 'enemy', seed: number, size: number): BattleUnit[] =>
    Array.from({ length: size }, (_, slot) =>
      unit(side, slot, {
        element: (['ember', 'tide', 'verdant', 'mist'] as const)[(seed + slot) % 4],
        stats: {
          hp: 5_000 + ((seed * 37 + slot * 91) % 15_000),
          atk: 600 + ((seed * 13 + slot * 29) % 900),
          def: 400 + ((seed * 7 + slot * 53) % 1_200),
          spd: 85 + ((seed * 3 + slot * 11) % 60),
          critRate: (seed * 5 + slot) % 60,
          res: (seed * 11 + slot * 3) % 60,
          acc: (seed * 17 + slot * 5) % 80,
        },
      }),
    );

  it('always terminates, and never leaves HP outside [0, maxHp]', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { state, rules } = battle({
        allies: randomTeam('ally', seed, 1 + (seed % 4)),
        waves: [randomTeam('enemy', seed * 3, 1 + ((seed + 1) % 4))],
        seed,
      });
      runToEnd(state, rules);

      expect(state.finished).toBe(true);
      expect(state.outcome).not.toBeNull();
      expect(state.turn).toBeLessThanOrEqual(config.maxTurns);

      for (const combatant of [...state.allies, ...state.enemies]) {
        expect(combatant.hp).toBeGreaterThanOrEqual(0);
        expect(combatant.hp).toBeLessThanOrEqual(combatant.maxHp);
        expect(combatant.alive).toBe(combatant.hp > 0);
        expect(combatant.buffs.length).toBeLessThanOrEqual(config.effectBarCap);
        expect(combatant.debuffs.length).toBeLessThanOrEqual(config.effectBarCap);
      }
    }
  });

  it('emits a died event exactly once per casualty', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const opening = battle({
        allies: randomTeam('ally', seed, 3),
        waves: [randomTeam('enemy', seed * 5, 3)],
        seed,
      });
      const events = [...opening.events, ...runToEnd(opening.state, opening.rules)];

      const deaths = eventsOf(events, 'died').map((event) => JSON.stringify(event.unit));
      expect(new Set(deaths).size).toBe(deaths.length);
    }
  });

  it('never reports negative damage or healing', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const opening = battle({
        allies: randomTeam('ally', seed, 2),
        waves: [randomTeam('enemy', seed * 7, 2)],
        seed,
      });
      const events = [...opening.events, ...runToEnd(opening.state, opening.rules)];

      for (const event of eventsOf(events, 'damage')) {
        expect(event.amount).toBeGreaterThanOrEqual(0);
        expect(event.absorbed).toBeGreaterThanOrEqual(0);
        expect(event.remainingHp).toBeGreaterThanOrEqual(0);
      }
      for (const event of eventsOf(events, 'heal')) {
        expect(event.amount).toBeGreaterThan(0);
      }
    }
  });
});

// ── Performance ─────────────────────────────────────────────────────────────

describe('performance', () => {
  it('resolves a full four-on-four stage well inside the budget', () => {
    // The budget is 20 ms per stage headless (ROADMAP P2 exit criterion); the target box
    // is one core, so this needs headroom rather than to merely pass.
    const build = () =>
      battle({
        allies: Array.from({ length: 4 }, (_, slot) =>
          unit('ally', slot, { stats: { hp: 18_000, atk: 1_200, def: 900, spd: 100 + slot * 5 } }),
        ),
        waves: [
          Array.from({ length: 4 }, (_, slot) =>
            unit('enemy', slot, { stats: { hp: 12_000, atk: 900, def: 700, spd: 95 + slot * 3 } }),
          ),
          Array.from({ length: 4 }, (_, slot) =>
            unit('enemy', slot, {
              stats: { hp: 14_000, atk: 1_000, def: 800, spd: 98 + slot * 3 },
            }),
          ),
        ],
        seed: 99,
      });

    const runs = 50;
    const started = performance.now();
    for (let i = 0; i < runs; i += 1) {
      const { state, rules } = build();
      runToEnd(state, rules);
    }
    const perStage = (performance.now() - started) / runs;
    expect(perStage).toBeLessThan(20);
  });
});
