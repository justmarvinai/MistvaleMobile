import { describe, expect, it } from 'vitest';
import { contributions } from './contribution';
import type { BattleEvent, BattleEventInput, HitQuality, UnitRef, UnitSnapshot } from './types';

/**
 * What each champion did, folded out of the event log.
 *
 * Built from hand-written logs rather than from real fights, deliberately: what is being
 * pinned here is the *reading* — which events count toward whom — and a real fight proves
 * that only for the handful of cases it happens to contain. Every rule the module's own
 * comment claims has a test below that fails if the rule is dropped.
 */

let nextId = 0;
// `BattleEventInput` rather than `Omit<BattleEvent, 'id'>`: a plain Omit over a union
// collapses it to the keys every member shares, which here is only `type`. The engine's
// own alias distributes over the union and keeps each member's payload — the same reason
// it exists for `emit`.
const ev = (event: BattleEventInput): BattleEvent =>
  ({ ...event, id: (nextId += 1) }) as BattleEvent;

function unit(side: UnitRef['side'], slot: number, name: string): UnitSnapshot {
  return {
    ref: { side, slot },
    defKey: `${name.toLowerCase()}_key`,
    name,
    element: 'ember',
    level: 30,
    maxHp: 10_000,
    hp: 10_000,
    stats: {
      hp: 10_000,
      atk: 900,
      def: 600,
      spd: 100,
      critRate: 15,
      critDmg: 50,
      res: 30,
      acc: 0,
    },
    skills: [],
    isBoss: false,
  };
}

/** A `damage` event with the parts a fold reads and defaults for the parts it does not. */
function hit(
  source: UnitRef,
  target: UnitRef,
  amount: number,
  extra: { absorbed?: number; quality?: HitQuality } = {},
): BattleEvent {
  return ev({
    type: 'damage',
    source,
    target,
    amount,
    absorbed: extra.absorbed ?? 0,
    quality: extra.quality ?? 'normal',
    crit: false,
    hitIndex: 0,
    hits: 1,
    remainingHp: 0,
  });
}

const ALLY_0: UnitRef = { side: 'ally', slot: 0 };
const ALLY_1: UnitRef = { side: 'ally', slot: 1 };
const FOE_0: UnitRef = { side: 'enemy', slot: 0 };

/** The opening event, which is where every roster in a log comes from. */
function opening(): BattleEvent {
  return ev({
    type: 'battleStart',
    wave: 0,
    allies: [unit('ally', 0, 'Blade'), unit('ally', 1, 'Mender')],
    enemies: [unit('enemy', 0, 'Brute')],
  });
}

describe('contributions', () => {
  it('gives every champion a row, in the order the log introduced them', () => {
    const rows = contributions([opening()]);
    expect(rows.map((row) => row.name)).toEqual(['Blade', 'Mender']);
    // A row of zeroes is kept: a champion who did nothing is a fact about the fight, and
    // dropping them leaves a player counting three cards where they fielded four.
    expect(rows.every((row) => row.damage === 0 && row.healing === 0)).toBe(true);
    // The other side is not the player's business (the owner's rule: own group only).
    expect(rows.some((row) => row.name === 'Brute')).toBe(false);
  });

  it('adds up what a champion landed on the other side', () => {
    const rows = contributions([
      opening(),
      hit(ALLY_0, FOE_0, 1_200),
      hit(ALLY_0, FOE_0, 800),
      hit(ALLY_1, FOE_0, 50),
    ]);
    expect(rows[0]).toMatchObject({ name: 'Blade', damage: 2_000 });
    expect(rows[1]).toMatchObject({ name: 'Mender', damage: 50 });
  });

  it('counts a blow a shield ate', () => {
    // The Titan fold's rule, for the Titan fold's reason: the shield is the target's
    // answer to the hit, not grounds for pretending it missed. A boss hit-shield reports
    // the whole blow as `absorbed` with `amount: 0`, which is the case that would read as
    // a champion doing nothing all fight.
    const rows = contributions([opening(), hit(ALLY_0, FOE_0, 0, { absorbed: 3_000 })]);
    expect(rows[0]?.damage).toBe(3_000);
  });

  it('keeps overkill on the striker', () => {
    // `amount` is not clamped to the target's remaining health, which is the engine's own
    // figure and the rule the world boss states out loud. A finishing blow is worth what
    // it was worth.
    const rows = contributions([
      opening(),
      hit(ALLY_0, FOE_0, 50_000),
      ev({ type: 'died', unit: FOE_0 }),
    ]);
    expect(rows[0]?.damage).toBe(50_000);
  });

  it('leaves out damage that came back onto our own side', () => {
    // A reflect, a retaliation and a poison we are wearing are all `damage` events with an
    // ally on the receiving end. None of them is work the party did, and counting the
    // reflect would credit whichever champion happened to be standing in front of it.
    const rows = contributions([
      opening(),
      hit(FOE_0, ALLY_0, 900),
      hit(ALLY_0, ALLY_1, 400),
      hit(ALLY_0, FOE_0, 100),
    ]);
    expect(rows.find((row) => row.name === 'Blade')?.damage).toBe(100);
    expect(rows.find((row) => row.name === 'Mender')?.damage).toBe(0);
  });

  it('credits healing and shielding to whoever provided them', () => {
    const rows = contributions([
      opening(),
      ev({ type: 'heal', source: ALLY_1, target: ALLY_0, amount: 1_500, remainingHp: 9_000 }),
      // A self-heal is still healing somebody did.
      ev({ type: 'heal', source: ALLY_1, target: ALLY_1, amount: 500, remainingHp: 9_500 }),
      ev({ type: 'shieldGained', source: ALLY_1, target: ALLY_0, amount: 2_200, turns: 2 }),
    ]);
    const mender = rows.find((row) => row.name === 'Mender');
    expect(mender).toMatchObject({ healing: 2_000, shielding: 2_200, damage: 0 });
  });

  it('attributes nothing when the log names no source', () => {
    // A wave-clear top-up heals the party and nobody cast it, so there is nobody to
    // credit. Silently crediting slot 0 would be worse than a zero.
    const rows = contributions([
      opening(),
      ev({ type: 'heal', source: null, target: ALLY_0, amount: 3_000, remainingHp: 10_000 }),
    ]);
    expect(rows.every((row) => row.healing === 0)).toBe(true);
  });

  it('says who went down', () => {
    const rows = contributions([opening(), ev({ type: 'died', unit: ALLY_1 })]);
    expect(rows.find((row) => row.name === 'Blade')?.fell).toBe(false);
    expect(rows.find((row) => row.name === 'Mender')?.fell).toBe(true);
  });

  it('gives a summoned add a row, on the side it was summoned onto', () => {
    // A boss calls adds mid-fight and they take slots nothing has occupied, so a fold that
    // only read `battleStart` would drop every blow struck at them. Read from the enemy's
    // point of view, which is the same code path the Admin inspector would want.
    const whelp = unit('enemy', 2, 'Whelp');
    const rows = contributions(
      [
        opening(),
        ev({ type: 'bossSummon', unit: FOE_0, summoned: [whelp] }),
        hit(whelp.ref, ALLY_0, 700),
      ],
      'enemy',
    );
    expect(rows.find((row) => row.name === 'Whelp')?.damage).toBe(700);
  });

  it('gives a champion who arrived on a later wave a row', () => {
    const rows = contributions(
      [opening(), ev({ type: 'waveStart', wave: 1, enemies: [unit('enemy', 1, 'Second')] })],
      'enemy',
    );
    expect(rows.map((row) => row.name)).toContain('Second');
  });

  it('puts the biggest contribution first, whatever kind of work it was', () => {
    const rows = contributions([
      opening(),
      hit(ALLY_0, FOE_0, 100),
      ev({ type: 'heal', source: ALLY_1, target: ALLY_0, amount: 9_000, remainingHp: 10_000 }),
    ]);
    expect(rows[0]?.name).toBe('Mender');
  });

  it('answers for an empty log', () => {
    expect(contributions([])).toEqual([]);
  });
});
