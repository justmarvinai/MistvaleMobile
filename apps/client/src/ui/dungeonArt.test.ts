import { describe, expect, it } from 'vitest';
import { dungeonArt, dungeonInk } from './dungeonArt';

const KEEPS = [
  'wyrms_hollow',
  'frostgrave_vault',
  'cinderspire',
  'silkmire_depths',
  'proving_grounds',
  'spring_pure',
  'spring_verdant',
  'spring_ember',
  'spring_tide',
  'spring_mist',
  'titan_valewurm',
];

describe('dungeonArt', () => {
  it('gives every keep its own face', () => {
    expect(new Set(KEEPS.map((key) => dungeonArt(key))).size).toBe(KEEPS.length);
  });

  it('falls back by kind for a keep added after this was written', () => {
    // An eleventh keep is an Admin edit, not a release.
    expect(dungeonArt('sunken_reliquary', 'relic')).toBe(dungeonArt('another_one', 'relic'));
    expect(dungeonArt('sunken_reliquary', 'relic')).toBeTruthy();
    expect(dungeonArt('nothing_at_all')).toBeTruthy();
  });

  it('colours the four groups apart, and answers for a fifth', () => {
    // A hub where two kinds share a colour is a hub nobody can scan, which is the whole
    // reason the ink is by kind rather than by keep.
    const kinds = ['relic', 'proving', 'springs', 'titan'];
    const inks = kinds.map(dungeonInk);
    expect(new Set(inks).size).toBe(kinds.length);
    expect(dungeonInk('something_new')).toBeUndefined();
  });
});
