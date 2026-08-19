import { describe, expect, it } from 'vitest';
import { REWARD_ART_FALLBACK, rewardArt } from './art';

describe('rewardArt', () => {
  it('names the wallet keys exactly', () => {
    expect(rewardArt('silver')).toBe('rune-jade-coin');
    expect(rewardArt('crystals')).toBe('rune-radiant-gem');
    expect(rewardArt('valorMedals')).toBe('crest-gilded-crown');
  });

  it('matches a family by prefix, so a new sigil needs no client change', () => {
    expect(rewardArt('sigil_faded')).toBe(rewardArt('sigil_radiant'));
    // The point of the rule: a key that does not exist yet still lands on its family.
    expect(rewardArt('sigil_umbral')).toBe(rewardArt('sigil_faded'));
    expect(rewardArt('tome_legendary')).toBe(rewardArt('tome_epic'));
  });

  it('falls back to a real icon rather than to nothing', () => {
    // A reward the player is actually receiving must never render as a blank chip.
    expect(rewardArt('something_nobody_has_seen')).toBe(REWARD_ART_FALLBACK);
    expect(REWARD_ART_FALLBACK).not.toBe('');
  });
});
