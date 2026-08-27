import {
  ELEMENTS,
  type ChampionDef,
  type Element,
  type Rarity,
  type Role,
  type RosterChampion,
} from '@mistvale/shared';

/**
 * Narrowing and ordering a roster.
 *
 * Thirty-seven champions is already past what a flat grid serves, and the two jobs this
 * screen has — find somebody to invest in, find food to feed them — are both searches. The
 * sort was here from P4; what was missing is the *filters*: the five the owner's list named
 * (2026-08-22) — faction, rarity, role, not at cap and wearing nothing — plus **element**,
 * which UI_UX §3 has specified since P0 and which is the one filter a player reaches for
 * with a purpose rather than a curiosity: a Depths floor or an arena defence is chosen by
 * affinity before it is chosen by anything else.
 *
 * Pure and on its own so the rules can be tested without a browser, which is worth doing
 * because two of them are about the *content* behind a champion rather than the champion —
 * a copy can outlive the definition that described it, and a filter that throws on one is
 * a roster that cannot be opened.
 */

export type SortKey = 'power' | 'rank' | 'level' | 'rarity' | 'name';

export interface RosterFilter {
  /** Substring of the champion's name, case-insensitively. Empty matches everything. */
  search: string;
  factionKey: string | 'any';
  element: Element | 'any';
  rarity: Rarity | 'any';
  role: Role | 'any';
  /** Only champions below their current rank's level cap — the ones food would help. */
  notAtCap: boolean;
  /** Only champions with no relics on — the ones a loadout is for. */
  bare: boolean;
  /** Food is a consumable that happens to be a champion; most searches are not about it. */
  hideFood: boolean;
}

export const NO_FILTER: RosterFilter = Object.freeze({
  search: '',
  factionKey: 'any',
  element: 'any',
  rarity: 'any',
  role: 'any',
  notAtCap: false,
  bare: false,
  hideFood: false,
});

/** Whether anything has been narrowed — for the Reset button and the "n of m" line. */
export function isNarrowed(filter: RosterFilter): boolean {
  return (
    filter.search.trim() !== '' ||
    filter.factionKey !== 'any' ||
    filter.element !== 'any' ||
    filter.rarity !== 'any' ||
    filter.role !== 'any' ||
    filter.notAtCap ||
    filter.bare ||
    filter.hideFood
  );
}

/**
 * Which way rarity runs, once.
 *
 * Descending, as the roster has always opened — and the *picker* reads off the same
 * constant, because a dropdown that offers Common first while the grid it filters puts
 * Legendary first is two answers to one question.
 */
const RARITY_ORDER: readonly Rarity[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export interface RosterView {
  champion: RosterChampion;
  def: ChampionDef | undefined;
}

/**
 * The champions a filter admits, in the order a sort asks for.
 *
 * A champion whose definition is missing is **kept** rather than hidden. It is a copy the
 * player owns and can open; dropping it from the grid would make an account with stale
 * content look robbed. What it cannot satisfy is a filter *about* its definition — faction,
 * rarity, role — so those exclude it, which is the honest reading of "show me the Sskarn".
 */
export function applyRoster(
  champions: readonly RosterChampion[],
  defs: ReadonlyMap<string, ChampionDef>,
  filter: RosterFilter,
  sort: SortKey,
): RosterView[] {
  const needle = filter.search.trim().toLowerCase();

  const admitted = champions.filter((champion) => {
    const def = defs.get(champion.championKey);
    if (filter.hideFood && def?.isFood) return false;
    if (filter.factionKey !== 'any' && def?.factionKey !== filter.factionKey) return false;
    if (filter.element !== 'any' && def?.element !== filter.element) return false;
    if (filter.rarity !== 'any' && def?.rarity !== filter.rarity) return false;
    if (filter.role !== 'any' && def?.role !== filter.role) return false;
    // The cap is the *rank's* cap, which is what makes this the "food would help" filter
    // rather than "not level 60": a ★4 at level 40 is finished until it ranks up.
    if (filter.notAtCap && champion.level >= champion.levelCap) return false;
    if (filter.bare && champion.equippedGearIds.length > 0) return false;
    if (needle) {
      const name = (def?.name ?? champion.championKey).toLowerCase();
      if (!name.includes(needle)) return false;
    }
    return true;
  });

  const rank = (champion: RosterChampion): number => {
    const rarity = defs.get(champion.championKey)?.rarity;
    const index = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
    // A champion with no definition sorts last rather than first — `indexOf` answers -1,
    // and -1 in front of Legendary is a stale copy at the top of the roster.
    return index === -1 ? RARITY_ORDER.length : index;
  };

  const named = (champion: RosterChampion): string =>
    defs.get(champion.championKey)?.name ?? champion.championKey;

  const ordered = [...admitted].sort((a, b) => {
    switch (sort) {
      // **Rank and level are different sorts**, and until C19 there was one of them wearing
      // the other's name: `level` sorted by star rank first, which is the reference game's
      // "By Rank" and not what a player asking for level wants. Both exist now, and each
      // falls back to the other — two champions at the same rank are ordered by level, and
      // two at the same level by rank.
      case 'rank':
        return b.rank - a.rank || b.level - a.level;
      case 'level':
        return b.level - a.level || b.rank - a.rank;
      case 'rarity':
        return rank(a) - rank(b) || b.power - a.power;
      case 'name':
        return named(a).localeCompare(named(b));
      default:
        // Favourites float regardless of sort: they are the champions a player is actively
        // working on, and hunting for them in a full roster is a chore.
        return Number(b.favourite) - Number(a.favourite) || b.power - a.power;
    }
  });

  return ordered.map((champion) => ({ champion, def: defs.get(champion.championKey) }));
}

/**
 * The factions, rarities and roles the account actually holds.
 *
 * The pickers offer what is there rather than everything published: a list of eight
 * factions when a player owns three is eight guesses at an empty grid. Food is counted for
 * this too — hiding it is its own switch, and a picker that changed shape when that switch
 * moved would be a picker nobody could rely on.
 */
export interface RosterFacets {
  factionKeys: string[];
  elements: Element[];
  rarities: Rarity[];
  roles: Role[];
}

export function rosterFacets(
  champions: readonly RosterChampion[],
  defs: ReadonlyMap<string, ChampionDef>,
): RosterFacets {
  const factionKeys = new Set<string>();
  const elements = new Set<string>();
  const rarities = new Set<string>();
  const roles = new Set<string>();
  for (const champion of champions) {
    const def = defs.get(champion.championKey);
    if (!def) continue;
    factionKeys.add(def.factionKey);
    elements.add(def.element);
    rarities.add(def.rarity);
    roles.add(def.role);
  }
  return {
    factionKeys: [...factionKeys].sort(),
    // Published order — the four affinities read the same way everywhere in the game, and
    // the wheel they beat each other in has no alphabet in it.
    elements: ELEMENTS.filter((element) => elements.has(element)),
    // The grid's own order rather than alphabetical: Legendary above Common is what a
    // player means by "sorted by rarity".
    rarities: RARITY_ORDER.filter((rarity) => rarities.has(rarity)),
    roles: [...roles].sort() as Role[],
  };
}
