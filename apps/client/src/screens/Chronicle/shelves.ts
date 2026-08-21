import type { ChampionDef, ChronicleEntry, FactionDef } from '@mistvale/shared';

/**
 * The Chronicle, grouped into faction shelves.
 *
 * Pure and separate from the screen because it is the only part of that screen with rules
 * in it, and the rules are the sort that go quietly wrong: which champions land on which
 * shelf, what each shelf's tally counts, and what order a shelf reads in. All three are
 * claims worth testing, and none of them is testable inside a `useMemo`.
 */

export type Filter = 'all' | 'owned' | 'missing';

/** One entry with its published definition, where there is one. */
export interface ShelfRow {
  entry: ChronicleEntry;
  def: ChampionDef | undefined;
}

/** One faction's shelf, and what the player has on it. */
export interface Shelf {
  faction: FactionDef | undefined;
  entries: ShelfRow[];
  owned: number;
  /** Collectable champions in this faction — food is listed but never counted. */
  total: number;
}

/** Owned above met above unknown, which is the order a collector reads a shelf in. */
function rank(entry: ChronicleEntry): number {
  return entry.owned ? 2 : entry.seen ? 1 : 0;
}

function nameOf(row: ShelfRow): string {
  return row.def?.name ?? row.entry.championKey;
}

/**
 * Groups the Chronicle by faction, in the order content puts the factions in.
 *
 * **The tally counts the whole faction, not what the filter left showing.** "Sacred Order
 * 12/31" has to mean the same thing whether or not the player is currently looking at what
 * they are missing — filtering the tiles and filtering the tally are different questions,
 * and only one of them was asked.
 *
 * A champion whose faction is not in the bundle still lands somewhere: its own key is a
 * stable bucket that sorts after every published faction rather than vanishing.
 */
export function buildShelves(
  entries: readonly ChronicleEntry[],
  defs: ReadonlyMap<string, ChampionDef>,
  factions: readonly FactionDef[],
  filter: Filter,
  hideFood: boolean,
): Shelf[] {
  const byFaction = new Map<string, ShelfRow[]>();

  for (const entry of entries) {
    const def = defs.get(entry.championKey);
    if (hideFood && def?.isFood) continue;
    const key = def?.factionKey ?? 'unaligned';
    const shelf = byFaction.get(key);
    if (shelf) shelf.push({ entry, def });
    else byFaction.set(key, [{ entry, def }]);
  }

  const order = new Map(factions.map((faction, index) => [faction.key, index]));

  return [...byFaction.entries()]
    .sort(
      ([a], [b]) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([key, all]) => {
      const collectable = all.filter((row) => !row.def?.isFood);
      return {
        faction: factions.find((entry) => entry.key === key),
        owned: collectable.filter((row) => row.entry.owned).length,
        total: collectable.length,
        entries: all
          .filter((row) => {
            if (filter === 'owned') return row.entry.owned;
            if (filter === 'missing') return !row.entry.owned;
            return true;
          })
          // Owned first, then met, then the rest — a collector reads their own progress
          // before the gaps — and alphabetical within each, so a name can still be found.
          .sort((a, b) => rank(b.entry) - rank(a.entry) || nameOf(a).localeCompare(nameOf(b))),
      };
    })
    .filter((shelf) => shelf.entries.length > 0);
}
