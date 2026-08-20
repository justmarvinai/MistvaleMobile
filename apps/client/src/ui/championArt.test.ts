import { describe, expect, it } from 'vitest';
import type { ChampionDef } from '@mistvale/shared';
import { CHAMPION_PLACEHOLDER, championArt, type ChampionArtAsset } from './championArt';

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
    expect(championArt(def(), [pending]).art).toBe(CHAMPION_PLACEHOLDER);
  });

  it('never returns both, so a card cannot be handed two answers', () => {
    for (const assets of [[drawn], [pending], [], undefined]) {
      const art = championArt(def(), assets);
      expect(Boolean(art.portrait) !== Boolean(art.art)).toBe(true);
    }
  });

  it('always answers with something — an empty frame is worse than a silhouette', () => {
    // The ×10 pull that found this: ten food champions, none with drawn art, ten blanks.
    expect(championArt(def({ role: 'support' }), []).art).toBe(CHAMPION_PLACEHOLDER);
    expect(championArt(undefined, []).art).toBe(CHAMPION_PLACEHOLDER);
    expect(championArt(def({ role: 'nonsense' as ChampionDef['role'] }), []).art).toBe(
      CHAMPION_PLACEHOLDER,
    );
  });

  /**
   * The owner's call, and the point of the change: one stand-in, not eight.
   *
   * The old map handed a different painted library hero to each faction, which made a
   * roster of art-pending champions look like eight unrelated games. A silhouette says
   * "not drawn yet"; a borrowed emberknight claims to be a portrait.
   */
  it('gives every faceless champion the same stand-in, whatever its house or role', () => {
    const factions = [
      'vale_sentinels',
      'emberclan',
      'wayfarers',
      'hollowborn',
      'sskarn',
      'thornweald',
      'runebound',
      'drowned_choir',
      'a_house_nobody_has_added_yet',
    ];
    const roles = ['attack', 'defense', 'hp', 'support'] as const;
    const arts = new Set(
      factions.flatMap((factionKey) =>
        roles.map((role) => championArt(def({ factionKey, role }), []).art),
      ),
    );
    expect([...arts]).toEqual([CHAMPION_PLACEHOLDER]);
  });
});
