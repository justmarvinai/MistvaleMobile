import { describe, expect, it } from 'vitest';
import type { ChampionDef, RosterChampion } from '@mistvale/shared';
import { NO_FILTER, applyRoster, isNarrowed, rosterFacets } from './rosterFilter';

/**
 * Narrowing and ordering a roster.
 *
 * Two things here are worth being certain about rather than eyeballing. The filters each
 * answer a different question a player asks out loud, and getting one subtly wrong —
 * "not at cap" meaning level 60 rather than the *rank's* cap — produces a screen that looks
 * right and answers the wrong question. And a champion whose definition is missing must not
 * take the roster down, because content is edited live and a copy can outlive its content.
 */

const def = (over: Partial<ChampionDef> & { key: string }): ChampionDef =>
  ({
    name: over.key,
    factionKey: 'sskarn',
    element: 'ember',
    rarity: 'rare',
    role: 'attack',
    isFood: false,
    ...over,
  }) as ChampionDef;

const owned = (over: Partial<RosterChampion> & { championKey: string }): RosterChampion =>
  ({
    id: `id-${over.championKey}`,
    level: 10,
    rank: 3,
    ascension: 0,
    awakening: 0,
    xp: 0,
    locked: false,
    favourite: false,
    levelCap: 30,
    xpToNextLevel: 100,
    power: 1000,
    equippedGearIds: [],
    ...over,
  }) as RosterChampion;

const defsOf = (...list: ChampionDef[]): Map<string, ChampionDef> =>
  new Map(list.map((entry) => [entry.key, entry]));

describe('applyRoster — the filters', () => {
  it('finds a champion by part of its name, whatever the case', () => {
    const defs = defsOf(
      def({ key: 'anuria', name: 'Anuria' }),
      def({ key: 'kael', name: 'Kaeril' }),
    );
    const list = [owned({ championKey: 'anuria' }), owned({ championKey: 'kael' })];
    const found = applyRoster(list, defs, { ...NO_FILTER, search: 'NUR' }, 'power');
    expect(found.map((entry) => entry.champion.championKey)).toEqual(['anuria']);
  });

  it('narrows by element, which is how a Depths team is chosen', () => {
    const defs = defsOf(
      def({ key: 'a', element: 'ember' }),
      def({ key: 'b', element: 'tide' }),
      def({ key: 'c', element: 'ember' }),
    );
    const list = [
      owned({ championKey: 'a' }),
      owned({ championKey: 'b' }),
      owned({ championKey: 'c' }),
    ];
    const found = applyRoster(list, defs, { ...NO_FILTER, element: 'ember' }, 'name');
    expect(found.map((entry) => entry.champion.championKey)).toEqual(['a', 'c']);
  });

  it('narrows by faction, rarity and role', () => {
    const defs = defsOf(
      def({ key: 'a', factionKey: 'sskarn', rarity: 'epic', role: 'attack' }),
      def({ key: 'b', factionKey: 'hollow', rarity: 'epic', role: 'support' }),
      def({ key: 'c', factionKey: 'sskarn', rarity: 'rare', role: 'attack' }),
    );
    const list = [
      owned({ championKey: 'a' }),
      owned({ championKey: 'b' }),
      owned({ championKey: 'c' }),
    ];
    const keys = (filter: Parameters<typeof applyRoster>[2]) =>
      applyRoster(list, defs, filter, 'name').map((entry) => entry.champion.championKey);

    expect(keys({ ...NO_FILTER, factionKey: 'sskarn' })).toEqual(['a', 'c']);
    expect(keys({ ...NO_FILTER, rarity: 'epic' })).toEqual(['a', 'b']);
    expect(keys({ ...NO_FILTER, role: 'support' })).toEqual(['b']);
    expect(keys({ ...NO_FILTER, factionKey: 'sskarn', rarity: 'epic' })).toEqual(['a']);
  });

  it('reads "not at cap" against the rank’s cap, not against level 60', () => {
    // The distinction is the whole point of the filter: a ★4 at its cap is *finished*
    // until it ranks up, and pouring food on it does nothing. A filter that meant "not
    // level 60" would put it back in the list and waste the player's evening.
    const defs = defsOf(def({ key: 'capped' }), def({ key: 'growing' }));
    const list = [
      owned({ championKey: 'capped', level: 40, levelCap: 40 }),
      owned({ championKey: 'growing', level: 39, levelCap: 40 }),
    ];
    const found = applyRoster(list, defs, { ...NO_FILTER, notAtCap: true }, 'name');
    expect(found.map((entry) => entry.champion.championKey)).toEqual(['growing']);
  });

  it('finds the champions wearing nothing', () => {
    const defs = defsOf(def({ key: 'bare' }), def({ key: 'geared' }));
    const list = [
      owned({ championKey: 'bare', equippedGearIds: [] }),
      owned({ championKey: 'geared', equippedGearIds: ['relic'] }),
    ];
    const found = applyRoster(list, defs, { ...NO_FILTER, bare: true }, 'name');
    expect(found.map((entry) => entry.champion.championKey)).toEqual(['bare']);
  });

  it('hides food only when asked', () => {
    const defs = defsOf(def({ key: 'hero' }), def({ key: 'meal', isFood: true }));
    const list = [owned({ championKey: 'hero' }), owned({ championKey: 'meal' })];
    expect(applyRoster(list, defs, NO_FILTER, 'name')).toHaveLength(2);
    expect(applyRoster(list, defs, { ...NO_FILTER, hideFood: true }, 'name')).toHaveLength(1);
  });
});

describe('applyRoster — a champion whose content is gone', () => {
  const defs = defsOf(def({ key: 'known', name: 'Known' }));
  const list = [owned({ championKey: 'known' }), owned({ championKey: 'stale', power: 9999 })];

  it('keeps it in an unfiltered roster', () => {
    // It is a copy the player owns and can open. Dropping it would make an account with
    // stale content look robbed.
    expect(applyRoster(list, defs, NO_FILTER, 'power')).toHaveLength(2);
  });

  it('leaves it out of a filter about its definition', () => {
    // "Show me the Sskarn" cannot include a champion nothing can say the faction of.
    expect(applyRoster(list, defs, { ...NO_FILTER, factionKey: 'sskarn' }, 'name')).toHaveLength(1);
    expect(applyRoster(list, defs, { ...NO_FILTER, rarity: 'rare' }, 'name')).toHaveLength(1);
  });

  it('sorts it last by rarity rather than first', () => {
    // `indexOf` answers -1 for an unknown rarity, and -1 in front of Legendary would put
    // every stale copy at the top of the roster.
    const byRarity = applyRoster(list, defs, NO_FILTER, 'rarity');
    expect(byRarity.map((entry) => entry.champion.championKey)).toEqual(['known', 'stale']);
  });

  it('is searchable by its key, since that is all there is to call it', () => {
    const found = applyRoster(list, defs, { ...NO_FILTER, search: 'sta' }, 'name');
    expect(found.map((entry) => entry.champion.championKey)).toEqual(['stale']);
  });
});

describe('applyRoster — the order', () => {
  const defs = defsOf(
    def({ key: 'leg', name: 'Aureleth', rarity: 'legendary' }),
    def({ key: 'com', name: 'Bran', rarity: 'common' }),
  );

  it('floats favourites above power, and only on the default sort', () => {
    const list = [
      owned({ championKey: 'leg', power: 5000 }),
      owned({ championKey: 'com', power: 100, favourite: true }),
    ];
    expect(applyRoster(list, defs, NO_FILTER, 'power')[0]?.champion.championKey).toBe('com');
    // Asked for rarity, the player gets rarity — a favourite Common at the top of a
    // rarity sort would be the control lying about what it does.
    expect(applyRoster(list, defs, NO_FILTER, 'rarity')[0]?.champion.championKey).toBe('leg');
  });

  it('sorts by name using the published name rather than the key', () => {
    const list = [owned({ championKey: 'leg' }), owned({ championKey: 'com' })];
    expect(applyRoster(list, defs, NO_FILTER, 'name').map((e) => e.champion.championKey)).toEqual([
      'leg',
      'com',
    ]);
  });
});

describe('rosterFacets', () => {
  it('offers only what the account holds', () => {
    // Eight factions in a picker when a player owns three is eight guesses at an empty grid.
    const defs = defsOf(
      def({ key: 'a', factionKey: 'sskarn', element: 'tide', rarity: 'epic', role: 'attack' }),
      def({ key: 'b', factionKey: 'hollow', element: 'ember', rarity: 'common', role: 'hp' }),
      def({ key: 'c', factionKey: 'sskarn', element: 'tide', rarity: 'epic', role: 'attack' }),
    );
    const facets = rosterFacets(
      [owned({ championKey: 'a' }), owned({ championKey: 'b' }), owned({ championKey: 'c' })],
      defs,
    );
    expect(facets.factionKeys).toEqual(['hollow', 'sskarn']);
    // Descending, so the picker agrees with the grid's own rarity sort rather than
    // offering Common first to a screen that puts Legendary first.
    expect(facets.rarities).toEqual(['epic', 'common']);
    expect(facets.roles).toEqual(['attack', 'hp']);
    // Published order, which is how the four affinities read everywhere else in the game.
    expect(facets.elements).toEqual(['ember', 'tide']);
  });

  it('ignores a champion whose content is gone', () => {
    expect(rosterFacets([owned({ championKey: 'stale' })], new Map()).factionKeys).toEqual([]);
  });
});

describe('isNarrowed', () => {
  it('is false for the default and true for each switch', () => {
    expect(isNarrowed(NO_FILTER)).toBe(false);
    expect(isNarrowed({ ...NO_FILTER, search: '  ' })).toBe(false);
    expect(isNarrowed({ ...NO_FILTER, search: 'a' })).toBe(true);
    expect(isNarrowed({ ...NO_FILTER, factionKey: 'sskarn' })).toBe(true);
    expect(isNarrowed({ ...NO_FILTER, notAtCap: true })).toBe(true);
    expect(isNarrowed({ ...NO_FILTER, bare: true })).toBe(true);
    expect(isNarrowed({ ...NO_FILTER, hideFood: true })).toBe(true);
  });
});
