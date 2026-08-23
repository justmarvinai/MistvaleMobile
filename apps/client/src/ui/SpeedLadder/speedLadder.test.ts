import { describe, expect, it } from 'vitest';
import { speedRungs, unlockSentence } from './speedLadder';

describe('speedRungs', () => {
  const unlocks = { '4': 'normal' };

  it('shows every rung a fresh account will ever have, not only the ones it holds', () => {
    // The whole point: ×4 is drawn even though this account cannot press it.
    const rungs = speedRungs({ open: [1, 2], current: 1, unlocks });
    expect(rungs.map((rung) => rung.speed)).toEqual([1, 2, 4]);
    expect(rungs.map((rung) => rung.state)).toEqual(['current', 'open', 'locked']);
  });

  it('says what earns a locked rung, in the difficulty config names', () => {
    const rungs = speedRungs({ open: [1, 2], current: 2, unlocks });
    expect(rungs[2]?.requires).toBe('Finish the campaign on Normal');
  });

  it('says nothing about a rung whose condition nobody wrote down', () => {
    const rungs = speedRungs({ open: [1, 2], current: 1, unlocks: {} });
    expect(rungs[2]?.state).toBe('locked');
    expect(rungs[2]?.requires).toBeUndefined();
  });

  it('marks the one in use, and never two of them', () => {
    const rungs = speedRungs({ open: [1, 2, 4], current: 4, unlocks });
    expect(rungs.filter((rung) => rung.state === 'current')).toHaveLength(1);
    expect(rungs.find((rung) => rung.state === 'current')?.speed).toBe(4);
  });

  it('leaves nothing current when the held speed is not open, so nothing lies', () => {
    // Reachable only through a stale store; the screen clamps before it renders. Drawn as
    // "no rung in use" rather than lighting one the account cannot press.
    const rungs = speedRungs({ open: [1, 2], current: 4, unlocks });
    expect(rungs.some((rung) => rung.state === 'current')).toBe(false);
  });
});

describe('unlockSentence', () => {
  it('names the three difficulties as the game does', () => {
    expect(unlockSentence('normal')).toBe('Finish the campaign on Normal');
    expect(unlockSentence('brutal')).toBe('Finish the campaign on Brutal');
  });

  it('passes an unknown difficulty through rather than inventing one', () => {
    expect(unlockSentence('nightmare')).toBe('Finish the campaign on nightmare');
  });
});
