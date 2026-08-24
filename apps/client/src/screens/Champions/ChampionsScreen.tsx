import { useEffect, useMemo, useState } from 'react';
import { RARITIES } from '@mistvale/shared';
import { CollectionProgress } from '@/fui/components/CollectionProgress.ts';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Toggle } from '@/fui/components/Toggle.ts';
import { Fui } from '@/fui/react';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { usePlayerStore } from '../../state/playerStore';
import { ChampionDetailModal } from './ChampionDetail';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';
import styles from './ChampionsScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { Button } from '../../ui/Button/Button';
import {
  NO_FILTER,
  applyRoster,
  isNarrowed,
  rosterFacets,
  type RosterFilter,
  type SortKey,
} from './rosterFilter';

/**
 * The roster.
 *
 * A grid of everything the player owns, sorted the way a player actually thinks about
 * their collection: strongest first by default, with the filters that matter for the two
 * jobs this screen has — finding a champion to invest in, and finding food to feed it.
 */

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'power', label: 'Power' },
  { key: 'level', label: 'Level' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'name', label: 'Name' },
];

const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  attack: 'Attack',
  defense: 'Defence',
  hp: 'Health',
  support: 'Support',
});

export function ChampionsScreen(): JSX.Element {
  const champions = useRosterStore((state) => state.champions);
  const loading = useRosterStore((state) => state.loading);
  const load = useRosterStore((state) => state.load);
  const bundle = useContentStore((state) => state.bundle);
  const standing = usePlayerStore((state) => state.standing);
  const refreshPlayer = usePlayerStore((state) => state.refresh);
  // "Holding 1 champions" is the sort of thing a player reads once and never trusts again.
  const held = standing.champions === 1 ? 'champion' : 'champions';

  const [sort, setSort] = useState<SortKey>('power');
  const [filter, setFilter] = useState<RosterFilter>(NO_FILTER);
  const [selected, setSelected] = useState<string | null>(null);

  const narrow = <K extends keyof RosterFilter>(key: K, value: RosterFilter[K]): void =>
    setFilter((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    void load();
    // Standing rides on the player snapshot, and the roster changes without it — a summon,
    // a starter choice or a champion fed away all move the count while the snapshot on hand
    // still says what it said at boot. Re-reading here is what stops this screen saying
    // "Holding 0 champions" over a grid of nine, which is exactly what it did before.
    void refreshPlayer();
  }, [load, refreshPlayer]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const visible = useMemo(
    () => applyRoster(champions, defs, filter, sort),
    [champions, defs, filter, sort],
  );

  /** Only what the account actually holds — see `rosterFacets`. */
  const facets = useMemo(() => rosterFacets(champions, defs), [champions, defs]);

  const factionNames = useMemo(
    () => new Map((bundle?.factions ?? []).map((faction) => [faction.key, faction.name])),
    [bundle],
  );

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

            {/* What breadth is worth, beside the tally that measures it. The two belong
                together: the roll says what is left to collect and this says why it is
                worth collecting, and split across two screens neither one answers the
                other's question. */}
            <Panel title="Standing">
              <p className={styles.note}>
                {standing.tier > 0
                  ? `Holding ${standing.champions} ${held} earns every one of them +${standing.bonus.hpPct}% HP, ATK and DEF.`
                  : `Holding ${standing.champions} ${held}. Breadth of collection pays a little to everything you field.`}
                {standing.nextAt !== null &&
                  ` ${standing.nextAt - standing.champions} more for the next tier.`}
              </p>
            </Panel>

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
              checked: filter.hideFood,
              label: `Hide food (${foodCount})`,
            }}
            on={{ 'toggle:change': (checked) => narrow('hideFood', Boolean(checked)) }}
          />
        </div>

        {/* Thirty-seven champions is past what a flat grid serves, and this screen has two
            jobs — find somebody to invest in, find food to feed them — which are both
            searches. The five the owner's list named (2026-08-22), the element UI_UX §3 has
            specified since P0 — the filter a Depths team is chosen by — and the name box
            that answers "where is Anuria" faster than any of them. */}
        <div className={styles.filters} role="group" aria-label="Narrow the roster">
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.search}
              type="search"
              value={filter.search}
              placeholder="Anuria"
              onChange={(event) => narrow('search', event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Faction</span>
            <select
              className={styles.select}
              value={filter.factionKey}
              onChange={(event) => narrow('factionKey', event.target.value)}
            >
              <option value="any">Any</option>
              {facets.factionKeys.map((key) => (
                <option key={key} value={key}>
                  {factionNames.get(key) ?? key}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Element</span>
            <select
              className={styles.select}
              value={filter.element}
              onChange={(event) => narrow('element', event.target.value as RosterFilter['element'])}
            >
              <option value="any">Any</option>
              {facets.elements.map((element) => (
                <option key={element} value={element}>
                  {element[0]!.toUpperCase() + element.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Rarity</span>
            <select
              className={styles.select}
              value={filter.rarity}
              onChange={(event) => narrow('rarity', event.target.value as RosterFilter['rarity'])}
            >
              <option value="any">Any</option>
              {facets.rarities.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity[0]!.toUpperCase() + rarity.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Role</span>
            <select
              className={styles.select}
              value={filter.role}
              onChange={(event) => narrow('role', event.target.value as RosterFilter['role'])}
            >
              <option value="any">Any</option>
              {facets.roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role] ?? role}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={filter.notAtCap}
              onChange={(event) => narrow('notAtCap', event.target.checked)}
            />
            <span>Not at cap</span>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={filter.bare}
              onChange={(event) => narrow('bare', event.target.checked)}
            />
            <span>Wearing nothing</span>
          </label>

          <span className={styles.count}>
            {visible.length} of {champions.length}
          </span>

          {isNarrowed(filter) && (
            <Button size="sm" variant="ghost" onClick={() => setFilter(NO_FILTER)}>
              Reset
            </Button>
          )}
        </div>

        {loading && champions.length === 0 ? (
          <p className={styles.empty}>Reading the roll…</p>
        ) : visible.length === 0 ? (
          <p className={styles.empty}>
            {champions.length === 0
              ? 'No champions yet. Choose a starter in the Haven.'
              : 'Nothing matches that. Reset the filters to see the whole roll.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {visible.map(({ champion, def }) => (
              <ChampionCard
                key={champion.id}
                champion={champion}
                def={def}
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
