import { describe, expect, it } from 'vitest';
import type { ChampionDef } from '@mistvale/shared';
import { championArt, type ChampionArtAsset } from './championArt';

const def = (over: Partial<ChampionDef> = {}) =>
  ({ key: 'x', assetKey: 'art_x', factionKey: 'sskarn', role: 'attack', ...over }) as ChampionDef;

const drawn: ChampionArtAsset = {
  key: 'art_x',
  basePath: 'champions/x',
  avatarPath: 'champions/x/avatar',
};
/** The shared art-pending model every faceless champion points at. */
const pending: ChampionArtAsset = {
  key: 'art_x',
  basePath: 'enemies/teritorial_lizard',
  avatarPath: '',
};

describe('championArt', () => {
  it('prefers the champion drawn art when there is some', () => {
    const art = championArt(def(), [drawn]);
    expect(art.portrait).toContain('champions/x');
    expect(art.art).toBeUndefined();
  });

  it('reads the asset, not the mere fact of one', () => {
    // Nearly every champion points at `enemy_lizard`, so "has an asset record" is true for
    // all of them and answers nothing. `avatarPath` is what content actually claims.
    expect(championArt(def(), [pending]).portrait).toBeUndefined();
    expect(championArt(def(), [pending]).art).toBeTruthy();
  });

  it('never returns both, so a card cannot be handed two answers', () => {
    for (const assets of [[drawn], [pending], [], undefined]) {
      const art = championArt(def(), assets);
      expect(Boolean(art.portrait) !== Boolean(art.art)).toBe(true);
    }
  });

  it('always answers with something — an empty frame is worse than a silhouette', () => {
    // The ×10 pull that found this: ten food champions, none with drawn art, ten blanks.
    expect(championArt(def({ role: 'support' }), []).art).toBeTruthy();
    expect(championArt(undefined, []).art).toBeTruthy();
    expect(championArt(def({ role: 'nonsense' as ChampionDef['role'] }), []).art).toBeTruthy();
  });

  it('tells the eight houses apart, so a wall of stand-ins is still readable', () => {
    const factions = [
      'vale_sentinels',
      'emberclan',
      'wayfarers',
      'hollowborn',
      'sskarn',
      'thornweald',
      'runebound',
      'drowned_choir',
    ];
    const arts = new Set(factions.map((factionKey) => championArt(def({ factionKey }), []).art));
    expect(arts.size).toBe(factions.length);
  });

  it('falls back to role for a house it has never heard of', () => {
    // Content can add a ninth faction without a code change; it must land on something.
    const roles = ['attack', 'defense', 'hp', 'support'] as const;
    const arts = roles.map((role) => championArt(def({ factionKey: 'newcomers', role }), []).art);
    expect(arts.every(Boolean)).toBe(true);
    expect(new Set(arts).size).toBe(roles.length);
  });
});
