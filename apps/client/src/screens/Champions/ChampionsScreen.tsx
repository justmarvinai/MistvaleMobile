import { useEffect, useMemo, useState } from 'react';
import { RARITIES, type RosterChampion } from '@mistvale/shared';
import { CollectionProgress } from '@/fui/components/CollectionProgress.ts';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Toggle } from '@/fui/components/Toggle.ts';
import { Fui } from '@/fui/react';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { ChampionDetailModal } from './ChampionDetail';
import { ChampionCard } from './ChampionCard';
import styles from './ChampionsScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';

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

  /** Owned against published, by rarity — food left out of both sides. */
  const tiers = useMemo(() => {
    const owned = new Map<string, Set<string>>();
    for (const champion of champions) {
      const def = defs.get(champion.championKey);
      if (!def || def.isFood) continue;
      const set = owned.get(def.rarity) ?? new Set<string>();
      set.add(def.key);
      owned.set(def.rarity, set);
    }
    return RARITIES.map((rarity) => ({
      rarity,
      owned: owned.get(rarity)?.size ?? 0,
      total: (bundle?.champions ?? []).filter((def) => !def.isFood && def.rarity === rarity).length,
    })).filter((tier) => tier.total > 0);
  }, [bundle, champions, defs]);

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Who stands with you, and how far each of them has come."
        actions={
          <ScreenInfo title="Your champions">
            {/* What is left to chase, split by rarity — the only breakdown that answers the
            question a collection screen exists to raise. Food is excluded from both sides
            of every count: it is a consumable that happens to be a champion, and folding
            it in would tell a player they had collected eleven Commons when they had
            farmed eleven meals. */}
            {/* No setters on this one either: it draws its bars at construction. Keyed on
                the counts so a summon is visible in the tally that exists to track it. */}
            <Fui
              key={tiers.map((tier) => `${tier.rarity}${tier.owned}/${tier.total}`).join('|')}
              of={CollectionProgress}
              className={styles.collection}
              options={{ title: 'The roll', unit: 'champions', showTotal: true, tiers }}
            />

            <Panel title="How they grow">
              <p className={styles.note}>
                Every champion climbs four ladders: levels from food, star rank from same-rank
                champions, ascension from essences, and skills from tomes or duplicates.
              </p>
              <dl className={styles.stats}>
                <div>
                  <dt>Food on hand</dt>
                  <dd>{foodCount}</dd>
                </div>
              </dl>
            </Panel>
          </ScreenInfo>
        }
      >
        Your Champions
      </Heading>

      <div>
        <div className={styles.controls}>
          <Fui
            of={SegmentedControl}
            className={styles.sorts}
            attrs={{ 'aria-label': 'Sort by' }}
            options={{
              value: sort,
              segments: SORTS.map((entry) => ({ value: entry.key, label: entry.label })),
            }}
            on={{ 'segment:change': (value) => setSort(value as SortKey) }}
          />

          <Fui
            of={Toggle}
            className={styles.toggle}
            options={{
              checked: hideFood,
              label: `Hide food (${foodCount})`,
            }}
            on={{ 'toggle:change': (checked) => setHideFood(Boolean(checked)) }}
          />
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

      {selected && <ChampionDetailModal championId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
