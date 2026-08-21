import { describe, expect, it } from 'vitest';
import type { ChampionDef, ChronicleEntry, FactionDef } from '@mistvale/shared';
import { buildShelves } from './shelves';

/**
 * The rules the faction index is made of.
 *
 * The screen is a grid; this is the part with decisions in it. Each of these was a way the
 * grouping could go quietly wrong and be believed — a tally that moves when a filter is
 * pressed looks like a tally, and a champion with no published faction disappearing looks
 * like a champion that does not exist.
 */

const champion = (key: string, over: Partial<ChampionDef> = {}): ChampionDef =>
  ({
    key,
    name: key,
    factionKey: 'sentinels',
    rarity: 'rare',
    element: 'ember',
    role: 'attack',
    isFood: false,
    ...over,
  }) as ChampionDef;

const met = (key: string, over: Partial<ChronicleEntry> = {}): ChronicleEntry => ({
  championKey: key,
  owned: false,
  copies: 0,
  bestRank: 0,
  seen: false,
  ...over,
});

const faction = (key: string, name: string): FactionDef =>
  ({ key, name, sortOrder: 0, lore: '', icon: '', active: true }) as unknown as FactionDef;

const FACTIONS = [faction('sentinels', 'Vale Sentinels'), faction('ember', 'Emberclan')];

const defsOf = (...list: ChampionDef[]): Map<string, ChampionDef> =>
  new Map(list.map((entry) => [entry.key, entry]));

describe('the faction index', () => {
  it('groups champions onto their own faction and keeps content’s order', () => {
    const defs = defsOf(
      champion('a', { factionKey: 'ember' }),
      champion('b', { factionKey: 'sentinels' }),
    );
    const shelves = buildShelves([met('a'), met('b')], defs, FACTIONS, 'all', true);

    expect(shelves.map((shelf) => shelf.faction?.name)).toEqual(['Vale Sentinels', 'Emberclan']);
  });

  /**
   * The one that would have been believed. A per-faction count that shrank when "Still
   * missing" was pressed reads as progress rather than as a filter.
   */
  it('counts the whole faction whatever the filter is showing', () => {
    const defs = defsOf(champion('a'), champion('b'), champion('c'));
    const entries = [met('a', { owned: true, copies: 1, bestRank: 3 }), met('b'), met('c')];

    for (const filter of ['all', 'owned', 'missing'] as const) {
      const [shelf] = buildShelves(entries, defs, FACTIONS, filter, true);
      expect({ filter, owned: shelf?.owned, total: shelf?.total }).toEqual({
        filter,
        owned: 1,
        total: 3,
      });
    }
  });

  it('reads owned, then met, then never encountered', () => {
    const defs = defsOf(champion('zed'), champion('ash'), champion('kai'));
    const [shelf] = buildShelves(
      [met('zed'), met('ash', { seen: true }), met('kai', { owned: true, copies: 1 })],
      defs,
      FACTIONS,
      'all',
      true,
    );

    expect(shelf?.entries.map((row) => row.entry.championKey)).toEqual(['kai', 'ash', 'zed']);
  });

  it('sorts by name inside each of those groups', () => {
    const defs = defsOf(champion('c', { name: 'Cass' }), champion('a', { name: 'Aldemar' }));
    const [shelf] = buildShelves([met('c'), met('a')], defs, FACTIONS, 'all', true);
    expect(shelf?.entries.map((row) => row.def?.name)).toEqual(['Aldemar', 'Cass']);
  });

  it('lists brood-kin without counting them, and hides them on request', () => {
    const defs = defsOf(champion('hero'), champion('food', { isFood: true }));
    const entries = [
      met('hero', { owned: true, copies: 1 }),
      met('food', { owned: true, copies: 4 }),
    ];

    const [shown] = buildShelves(entries, defs, FACTIONS, 'all', false);
    expect(shown?.entries).toHaveLength(2);
    // Both are owned; only the collectable one counts.
    expect({ owned: shown?.owned, total: shown?.total }).toEqual({ owned: 1, total: 1 });

    const [hidden] = buildShelves(entries, defs, FACTIONS, 'all', true);
    expect(hidden?.entries).toHaveLength(1);
  });

  it('gives a champion with no published faction a shelf rather than dropping it', () => {
    const shelves = buildShelves([met('stranger')], new Map(), FACTIONS, 'all', true);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]?.faction).toBeUndefined();
    expect(shelves[0]?.entries[0]?.entry.championKey).toBe('stranger');
  });

  it('drops a shelf the filter emptied, rather than drawing an empty heading', () => {
    const defs = defsOf(champion('a', { factionKey: 'ember' }), champion('b'));
    const entries = [met('a'), met('b', { owned: true, copies: 1 })];

    const shelves = buildShelves(entries, defs, FACTIONS, 'owned', true);
    expect(shelves.map((shelf) => shelf.faction?.name)).toEqual(['Vale Sentinels']);
  });
});
