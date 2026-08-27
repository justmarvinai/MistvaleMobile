import { describe, expect, it } from 'vitest';
import type { BattleEvent, UnitSnapshot } from '@mistvale/engine';
import { applyAll, applyEvent, emptyView, eventDuration, trimFloaters } from './playback';

/**
 * The playback reducer.
 *
 * This is where the client is most able to lie: every number on screen passes through
 * here, and the temptation is always to compute one rather than read it. These tests pin
 * the opposite — the view reflects the events and nothing else.
 */

const statusKind = (key: string): 'buff' | 'debuff' =>
  key.startsWith('atk_up') || key === 'shield' ? 'buff' : 'debuff';

let nextId = 0;

/**
 * Builds one event of a given type, filling in the id.
 *
 * The cast is unavoidable: TypeScript cannot prove that spreading `Omit<Member, 'id' |
 * 'type'>` back together with `id` and `type` reconstitutes that member. The call sites
 * are still fully checked — `rest` is typed to the exact member `type` selects.
 */
const ev = <T extends BattleEvent['type']>(
  type: T,
  rest: Omit<Extract<BattleEvent, { type: T }>, 'id' | 'type'>,
): Extract<BattleEvent, { type: T }> =>
  ({ id: nextId++, type, ...rest }) as unknown as Extract<BattleEvent, { type: T }>;

const snapshot = (side: 'ally' | 'enemy', slot: number, hp = 1000): UnitSnapshot => ({
  ref: { side, slot },
  defKey: `${side}_${slot}`,
  name: `${side} ${slot}`,
  element: 'mist',
  level: 10,
  maxHp: hp,
  hp,
  stats: { hp, atk: 100, def: 100, spd: 100, critRate: 15, critDmg: 50, res: 30, acc: 0 },
  skills: ['strike'],
  isBoss: false,
});

function opened() {
  const view = emptyView();
  applyEvent(
    view,
    ev('battleStart', {
      wave: 0,
      allies: [snapshot('ally', 0)],
      enemies: [snapshot('enemy', 0), snapshot('enemy', 1)],
    }),
    statusKind,
  );
  return view;
}

describe('battleStart', () => {
  it('places both teams at full health', () => {
    const view = opened();
    expect(view.allies).toHaveLength(1);
    expect(view.enemies).toHaveLength(2);
    expect(view.allies[0]?.hp).toBe(1000);
    expect(view.allies[0]?.alive).toBe(true);
  });
});

describe('damage', () => {
  it('takes the remaining health from the event rather than subtracting', () => {
    const view = opened();
    applyEvent(
      view,
      ev('damage', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        amount: 250,
        absorbed: 0,
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        // Deliberately inconsistent with `amount`: the view must trust this field, since
        // the server is the only thing that knows about shields, protection and floors.
        remainingHp: 700,
      }),
      statusKind,
    );
    expect(view.enemies[0]?.hp).toBe(700);
    expect(view.floaters.at(-1)?.text).toBe('250');
  });

  it('marks a crit so the stage can shake harder', () => {
    const view = opened();
    applyEvent(
      view,
      ev('damage', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        amount: 900,
        absorbed: 0,
        quality: 'strong',
        crit: true,
        hitIndex: 0,
        hits: 1,
        remainingHp: 100,
      }),
      statusKind,
    );
    expect(view.enemies[0]?.impulse).toBe('crit');
    expect(view.floaters.at(-1)?.crit).toBe(true);
  });

  it('shows the absorbed number when a shield eats the whole hit', () => {
    const view = opened();
    applyEvent(
      view,
      ev('damage', {
        source: { side: 'enemy', slot: 0 },
        target: { side: 'ally', slot: 0 },
        amount: 0,
        absorbed: 300,
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        remainingHp: 1000,
      }),
      statusKind,
    );
    const floater = view.floaters.at(-1);
    expect(floater?.kind).toBe('shield');
    expect(floater?.text).toBe('300');
  });
});

describe('statuses', () => {
  it('files a buff and a debuff on the right bars', () => {
    const view = opened();
    const target = { side: 'ally', slot: 0 } as const;

    applyEvent(
      view,
      ev('statusApplied', { source: target, target, status: 'atk_up_50', turns: 2, stacks: 1 }),
      statusKind,
    );
    applyEvent(
      view,
      ev('statusApplied', {
        source: { side: 'enemy', slot: 0 },
        target,
        status: 'poison_5',
        turns: 3,
        stacks: 2,
      }),
      statusKind,
    );

    expect(view.allies[0]?.buffs.map((chip) => chip.key)).toEqual(['atk_up_50']);
    expect(view.allies[0]?.debuffs[0]).toMatchObject({ key: 'poison_5', turns: 3, stacks: 2 });
  });

  it('refreshes a chip in place rather than duplicating it', () => {
    const view = opened();
    const target = { side: 'ally', slot: 0 } as const;
    for (const turns of [2, 4]) {
      applyEvent(
        view,
        ev('statusApplied', { source: target, target, status: 'atk_up_50', turns, stacks: 1 }),
        statusKind,
      );
    }
    expect(view.allies[0]?.buffs).toHaveLength(1);
    expect(view.allies[0]?.buffs[0]?.turns).toBe(4);
  });

  it('drops a chip when it expires or is removed', () => {
    const view = opened();
    const target = { side: 'ally', slot: 0 } as const;
    applyEvent(
      view,
      ev('statusApplied', { source: target, target, status: 'atk_up_50', turns: 2, stacks: 1 }),
      statusKind,
    );
    applyEvent(view, ev('statusExpired', { target, status: 'atk_up_50' }), statusKind);
    expect(view.allies[0]?.buffs).toHaveLength(0);
  });

  it('shows a resist floater without touching health', () => {
    const view = opened();
    applyEvent(
      view,
      ev('statusResisted', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        status: 'stun',
        reason: 'resist',
      }),
      statusKind,
    );
    expect(view.floaters.at(-1)?.text).toBe('RESIST');
    expect(view.enemies[0]?.hp).toBe(1000);
  });

  it('distinguishes an immunity from a resist', () => {
    const view = opened();
    applyEvent(
      view,
      ev('statusResisted', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        status: 'stun',
        reason: 'immune',
      }),
      statusKind,
    );
    expect(view.floaters.at(-1)?.text).toBe('IMMUNE');
  });
});

describe('death and waves', () => {
  it('marks a unit dead and clears its effects', () => {
    const view = opened();
    const target = { side: 'enemy', slot: 0 } as const;
    applyEvent(
      view,
      ev('statusApplied', {
        source: { side: 'ally', slot: 0 },
        target,
        status: 'poison_5',
        turns: 3,
        stacks: 1,
      }),
      statusKind,
    );
    applyEvent(view, ev('died', { unit: target }), statusKind);

    expect(view.enemies[0]?.alive).toBe(false);
    expect(view.enemies[0]?.hp).toBe(0);
    expect(view.enemies[0]?.debuffs).toHaveLength(0);
  });

  it('clears ally effects and applies the heal when a wave falls', () => {
    const view = opened();
    const ally = { side: 'ally', slot: 0 } as const;
    applyEvent(
      view,
      ev('statusApplied', { source: ally, target: ally, status: 'atk_up_50', turns: 5, stacks: 1 }),
      statusKind,
    );
    view.allies[0]!.hp = 400;

    applyEvent(
      view,
      ev('waveCleared', { wave: 0, healed: [{ unit: ally, amount: 100 }] }),
      statusKind,
    );

    expect(view.allies[0]?.buffs).toHaveLength(0);
    expect(view.allies[0]?.hp).toBe(500);
  });

  it('replaces the enemy side on a new wave and raises a banner', () => {
    const view = opened();
    applyEvent(
      view,
      ev('waveStart', { wave: 1, enemies: [snapshot('enemy', 0, 2000)] }),
      statusKind,
    );
    expect(view.wave).toBe(1);
    expect(view.enemies).toHaveLength(1);
    expect(view.enemies[0]?.maxHp).toBe(2000);
    expect(view.banner?.tone).toBe('wave');
  });
});

describe('the end', () => {
  it('records the outcome and stops highlighting an actor', () => {
    const view = opened();
    applyEvent(view, ev('turnStart', { unit: { side: 'ally', slot: 0 }, turn: 3 }), statusKind);
    expect(view.acting).not.toBeNull();

    applyEvent(view, ev('battleEnd', { outcome: 'victory', turns: 9 }), statusKind);
    expect(view.finished).toBe(true);
    expect(view.outcome).toBe('victory');
    expect(view.acting).toBeNull();
    expect(view.banner?.tone).toBe('victory');
  });
});

describe('applyAll', () => {
  it('lands in the same place as playing the events one by one', () => {
    const events: BattleEvent[] = [
      ev('battleStart', {
        wave: 0,
        allies: [snapshot('ally', 0)],
        enemies: [snapshot('enemy', 0)],
      }),
      ev('turnStart', { unit: { side: 'ally', slot: 0 }, turn: 0 }),
      ev('damage', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        amount: 600,
        absorbed: 0,
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        remainingHp: 400,
      }),
      ev('died', { unit: { side: 'enemy', slot: 0 } }),
      ev('battleEnd', { outcome: 'victory', turns: 1 }),
    ];

    const stepped = emptyView();
    for (const event of events) applyEvent(stepped, event, statusKind);
    // Cleared the way `applyAll` clears them: both carry ids that count up per call, so
    // comparing them would only ever prove that two runs are two runs.
    stepped.floaters = [];
    stepped.effects = [];
    stepped.banner = null;

    const jumped = emptyView();
    applyAll(jumped, events, statusKind);

    expect(jumped).toEqual(stepped);
  });

  it('leaves no floaters or banner behind, so a skip does not replay them', () => {
    const view = emptyView();
    applyAll(
      view,
      [
        ev('battleStart', {
          wave: 0,
          allies: [snapshot('ally', 0)],
          enemies: [snapshot('enemy', 0)],
        }),
        ev('battleEnd', { outcome: 'defeat', turns: 4 }),
      ],
      statusKind,
    );
    expect(view.floaters).toEqual([]);
    expect(view.banner).toBeNull();
  });
});

describe('pacing', () => {
  it('gives an informative beat more room than bookkeeping', () => {
    const damage = eventDuration(
      ev('damage', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'enemy', slot: 0 },
        amount: 1,
        absorbed: 0,
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        remainingHp: 1,
      }),
    );
    const bookkeeping = eventDuration(
      ev('cooldownChanged', { unit: { side: 'ally', slot: 0 }, skill: 'strike', value: 2 }),
    );
    expect(damage).toBeGreaterThan(bookkeeping);
    expect(bookkeeping).toBe(0);
  });

  it('lands later hits of a multi-hit skill faster than the first', () => {
    const hit = (hitIndex: number) =>
      eventDuration(
        ev('damage', {
          source: { side: 'ally', slot: 0 },
          target: { side: 'enemy', slot: 0 },
          amount: 1,
          absorbed: 0,
          quality: 'normal',
          crit: false,
          hitIndex,
          hits: 3,
          remainingHp: 1,
        }),
      );
    expect(hit(1)).toBeLessThan(hit(0));
  });
});

describe('trimFloaters', () => {
  it('keeps a long fight from accumulating them forever', () => {
    const view = opened();
    for (let index = 0; index < 40; index += 1) {
      applyEvent(
        view,
        ev('heal', {
          source: null,
          target: { side: 'ally', slot: 0 },
          amount: 1,
          remainingHp: 1000,
        }),
        statusKind,
      );
    }
    trimFloaters(view, 12);
    expect(view.floaters).toHaveLength(12);
  });
});

/**
 * The motion the fight is made of.
 *
 * The owner's report (2026-08-22) was that battles are "extremely static besides the
 * characters having their animations" — and they were: `impulse` had three kinds, one
 * renderer turned it into a shake, and the other ignored it entirely. Everything a beat
 * needs was already in the engine's event contract and none of it reached the screen.
 *
 * These pin the *decisions* rather than the drawing, because both renderers read this one
 * model and neither should be inventing beats of its own.
 */
describe('effects', () => {
  it('lunges the attacker and bursts on the target, once per swing', () => {
    const view = opened();
    // Two hits of one skill: the strike is the swing, the impacts are the blows.
    for (const hitIndex of [0, 1]) {
      applyEvent(
        view,
        ev('damage', {
          source: { side: 'ally', slot: 0 },
          target: { side: 'enemy', slot: 0 },
          amount: 100,
          absorbed: 0,
          quality: 'normal',
          crit: false,
          hitIndex,
          hits: 2,
          remainingHp: 900 - hitIndex * 100,
        }),
        statusKind,
      );
    }

    const strikes = view.effects.filter((effect) => effect.kind === 'strike');
    const impacts = view.effects.filter((effect) => effect.kind === 'impact');
    expect(strikes).toHaveLength(1);
    expect(strikes[0]?.ref).toEqual({ side: 'ally', slot: 0 });
    expect(strikes[0]?.toward).toEqual({ side: 'enemy', slot: 0 });
    expect(impacts).toHaveLength(2);
  });

  it('does not lunge a unit at its own side — a DoT has no swing', () => {
    const view = opened();
    applyEvent(
      view,
      ev('damage', {
        source: { side: 'enemy', slot: 0 },
        target: { side: 'enemy', slot: 1 },
        amount: 40,
        absorbed: 0,
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        trueDamage: true,
        remainingHp: 960,
      }),
      statusKind,
    );
    expect(view.effects.filter((effect) => effect.kind === 'strike')).toHaveLength(0);
    expect(view.effects.filter((effect) => effect.kind === 'impact')).toHaveLength(1);
  });

  it('tells a glancing blow from a solid one and from a crit', () => {
    const view = opened();
    const hit = (quality: 'normal' | 'weak' | 'strong', crit: boolean) => {
      applyEvent(
        view,
        ev('damage', {
          source: { side: 'enemy', slot: 0 },
          target: { side: 'ally', slot: 0 },
          amount: 50,
          absorbed: 0,
          quality,
          crit,
          hitIndex: 0,
          hits: 1,
          remainingHp: 500,
        }),
        statusKind,
      );
      return view.allies[0]?.impulse;
    };

    expect(hit('weak', false)).toBe('weak');
    expect(hit('normal', false)).toBe('hit');
    expect(hit('strong', false)).toBe('hit');
    // A crit outranks affinity: the biggest thing that happened is what the body shows.
    expect(hit('weak', true)).toBe('crit');
  });

  it('gives a cast its own beat, coloured by whoever threw it', () => {
    const view = opened();
    applyEvent(
      view,
      ev('skillUsed', {
        unit: { side: 'ally', slot: 0 },
        skill: 'strike',
        targets: [{ side: 'enemy', slot: 0 }],
      }),
      statusKind,
    );
    const cast = view.effects.find((effect) => effect.kind === 'cast');
    expect(cast?.ref).toEqual({ side: 'ally', slot: 0 });
    expect(cast?.element).toBe('mist');
  });

  it('makes shrugging off a debuff a beat of its own', () => {
    // The nearest thing this engine has to a dodge — an attack never misses, but a debuff
    // can fail to land, and that is a defensive moment worth showing.
    const view = opened();
    applyEvent(
      view,
      ev('statusResisted', {
        source: { side: 'enemy', slot: 0 },
        target: { side: 'ally', slot: 0 },
        status: 'atk_down',
        reason: 'resist',
      }),
      statusKind,
    );
    expect(view.allies[0]?.impulse).toBe('resist');
    const resist = view.effects.find((effect) => effect.kind === 'resist');
    expect(resist?.toward).toEqual({ side: 'enemy', slot: 0 });
  });

  it('marks a heal, a shield and a death', () => {
    const view = opened();
    applyEvent(
      view,
      ev('heal', {
        source: { side: 'ally', slot: 0 },
        target: { side: 'ally', slot: 0 },
        amount: 100,
        remainingHp: 1000,
      }),
      statusKind,
    );
    expect(view.allies[0]?.impulse).toBe('heal');

    applyEvent(
      view,
      ev('shieldGained', {
        source: { side: 'ally', slot: 1 },
        target: { side: 'ally', slot: 0 },
        amount: 200,
        turns: 2,
      }),
      statusKind,
    );
    expect(view.allies[0]?.impulse).toBe('shield');

    applyEvent(view, ev('died', { unit: { side: 'enemy', slot: 1 } }), statusKind);
    expect(view.enemies[1]?.impulse).toBe('death');
    expect(view.effects.some((effect) => effect.kind === 'death')).toBe(true);
  });

  it('hands every effect its own id, so a renderer can draw each one once', () => {
    const view = opened();
    applyEvent(
      view,
      ev('skillUsed', { unit: { side: 'ally', slot: 0 }, skill: 's', targets: [] }),
      statusKind,
    );
    applyEvent(
      view,
      ev('skillUsed', { unit: { side: 'ally', slot: 0 }, skill: 's', targets: [] }),
      statusKind,
    );
    const ids = view.effects.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is trimmed with the floaters, so a long fight does not accumulate them', () => {
    const view = opened();
    for (let i = 0; i < 40; i += 1) {
      applyEvent(
        view,
        ev('skillUsed', { unit: { side: 'ally', slot: 0 }, skill: 's', targets: [] }),
        statusKind,
      );
    }
    expect(view.effects.length).toBeGreaterThan(12);
    trimFloaters(view);
    expect(view.effects).toHaveLength(12);
  });
});
