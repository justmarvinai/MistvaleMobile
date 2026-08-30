import { describe, expect, it } from 'vitest';
import type { BattleUnit, UnitRef } from '@mistvale/engine';
import { focusUnit } from './focus';

function unit(side: 'ally' | 'enemy', slot: number, over: Partial<BattleUnit> = {}): BattleUnit {
  return {
    ref: { side, slot },
    defKey: `${side}_${slot}`,
    name: `${side} ${slot}`,
    element: 'ember',
    level: 10,
    stats: {} as BattleUnit['stats'],
    maxHp: 100,
    hp: 100,
    tm: 0,
    skills: [],
    cooldowns: {},
    buffs: [],
    debuffs: [],
    alive: true,
    isBoss: false,
    boss: {} as BattleUnit['boss'],
    ccStreak: 0,
    ...over,
  } as BattleUnit;
}

const ref = (side: 'ally' | 'enemy', slot: number): UnitRef => ({ side, slot });

describe('focusUnit', () => {
  const ally = unit('ally', 0);
  const grunt = unit('enemy', 0);
  const chief = unit('enemy', 1, { isBoss: true });

  it('shows the first enemy still standing when nobody has been picked', () => {
    expect(focusUnit([ally], [grunt, chief], null, null)?.ref.slot).toBe(0);
  });

  it('skips a fallen enemy', () => {
    const fallen = unit('enemy', 0, { alive: false, hp: 0 });
    expect(focusUnit([ally], [fallen, chief], null, null)?.ref.slot).toBe(1);
  });

  it('shows whoever the player picked, on either side', () => {
    expect(focusUnit([ally], [grunt], ref('ally', 0), null)?.ref.side).toBe('ally');
  });

  it('draws no plate for the boss the bar across the top already names', () => {
    // The duplication this exists to prevent: the same name and the same health, in the
    // two most prominent places the screen has (C12c).
    expect(focusUnit([ally], [chief], null, ref('enemy', 1))).toBeNull();
  });

  it('still draws the boss when the player picked it', () => {
    // A click is a question and the plate is the answer, whoever was clicked.
    expect(focusUnit([ally], [chief], ref('enemy', 1), ref('enemy', 1))?.ref.slot).toBe(1);
  });

  it('draws the escort in front of a boss rather than nothing', () => {
    // The rule is about the *boss*, not about boss fights: an escort still standing is
    // exactly what the plate should be about, and it is the case that makes a browser
    // assertion on this rule pass for the wrong reason.
    expect(focusUnit([ally], [grunt, chief], null, ref('enemy', 1))?.ref.slot).toBe(0);
  });
});
