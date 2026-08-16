import { useEffect, useMemo, useState } from 'react';
import type { RosterChampion } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { ChampionDetailModal } from './ChampionDetail';
import { ChampionCard } from './ChampionCard';
import styles from './ChampionsScreen.module.scss';

/**
 * The roster.
 *
 * A grid of everything the player owns, sorted the way a player actually thinks about
 * their collection: strongest first by default, with the filters that matter for the two
 * jobs this screen has — finding a champion to invest in, and finding food to feed it.
 */

type SortKey = 'power' | 'level' | 'rarity' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'power', label: 'Power' },
  { key: 'level', label: 'Level' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'name', label: 'Name' },
];

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

export function ChampionsScreen(): JSX.Element {
  const champions = useRosterStore((state) => state.champions);
  const loading = useRosterStore((state) => state.loading);
  const load = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);

  const [sort, setSort] = useState<SortKey>('power');
  const [hideFood, setHideFood] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const visible = useMemo(() => {
    const list = champions.filter(
      (champion) => !hideFood || !defs.get(champion.championKey)?.isFood,
    );

    const rank = (champion: RosterChampion): number =>
      RARITY_ORDER.indexOf(defs.get(champion.championKey)?.rarity ?? 'common');

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'level':
          return b.rank - a.rank || b.level - a.level;
        case 'rarity':
          return rank(a) - rank(b) || b.power - a.power;
        case 'name':
          return (defs.get(a.championKey)?.name ?? '').localeCompare(
            defs.get(b.championKey)?.name ?? '',
          );
        default:
          // Favourites float regardless of sort: they are the champions a player is
          // actively working on, and hunting for them in a full roster is a chore.
          return Number(b.favourite) - Number(a.favourite) || b.power - a.power;
      }
    });
  }, [champions, defs, hideFood, sort]);

  const foodCount = champions.filter((c) => defs.get(c.championKey)?.isFood).length;

  return (
    <div className={styles.screen}>
      <div>
        <div className={styles.controls}>
          <div className={styles.sorts} role="group" aria-label="Sort by">
            {SORTS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={styles.sort}
                aria-pressed={sort === entry.key}
                onClick={() => setSort(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={hideFood}
              onChange={(event) => setHideFood(event.target.checked)}
            />
            Hide food ({foodCount})
          </label>
        </div>

        {loading && champions.length === 0 ? (
          <p className={styles.empty}>Reading the roll…</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            {champions.length === 0
              ? 'No champions yet. Choose a starter in the Haven.'
              : 'Nothing matches that filter.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {visible.map((champion) => (
              <ChampionCard
                key={champion.id}
                champion={champion}
                def={defs.get(champion.championKey)}
                onOpen={() => setSelected(champion.id)}
              />
            ))}
          </div>
        )}
      </div>

      <aside className={styles.sidebar}>
        <Panel title="Your champions">
          <p className={styles.note}>
            Every champion climbs four ladders: levels from food, star rank from same-rank
            champions, ascension from essences, and skills from tomes or duplicates.
          </p>
          <dl className={styles.stats}>
            <div>
              <dt>Owned</dt>
              <dd>{champions.length}</dd>
            </div>
            <div>
              <dt>Food on hand</dt>
              <dd>{foodCount}</dd>
            </div>
          </dl>
        </Panel>
      </aside>

      {selected && <ChampionDetailModal championId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
