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

  it('colours the three groups apart, and answers for a fourth', () => {
    const inks = ['relic', 'proving', 'springs'].map(dungeonInk);
    expect(new Set(inks).size).toBe(3);
    expect(dungeonInk('something_new')).toBeUndefined();
  });
});
