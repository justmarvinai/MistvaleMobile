import { useEffect, useMemo, useState } from 'react';
import type { ChampionDef, Chronicle, ChronicleEntry, FactionDef } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { gameApi } from '../../api/game';
import { avatarPath } from '../../game/sprites';
import { useContentStore } from '../../state/contentStore';
import styles from './ChronicleScreen.module.scss';
import { Portrait } from '../../ui/Portrait/Portrait';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { useTip } from '../../ui/Tooltip/useTooltip';
import { affinityOf } from '../../ui/affinity';
import { buildShelves, type Filter } from './shelves';

/**
 * The Chronicle.
 *
 * Every champion in the world, **by faction**, in three states: owned, met, and never
 * encountered. The genre's collection screen is a faction index — the reference game's is
 * exactly this — and the reason is that "which of the Sacred Order am I missing" is the
 * question a collector actually asks. A flat grid of two hundred faces cannot answer it.
 *
 * **Nothing is hidden** (the owner's call, 2026-08-21). A champion never met used to draw a
 * question mark and the word `???`, on the theory that a gap should be visible without
 * spoiling what fills it. In practice a wall of question marks is a wall of nothing: it
 * cannot be planned against, and the whole point of a collection tracker is to show what
 * exists. Every champion is drawn with their real face and their real name; the ones you do
 * not have are simply grey.
 *
 * Food units appear but do not count toward completion (GAME_DESIGN §10).
 */

export function ChronicleScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const [chronicle, setChronicle] = useState<Chronicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hideFood, setHideFood] = useState(true);

  useEffect(() => {
    let cancelled = false;
    gameApi
      .chronicle()
      .then((result) => {
        if (!cancelled) setChronicle(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'The Chronicle is closed.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const shelves = useMemo(
    () => buildShelves(chronicle?.entries ?? [], defs, bundle?.factions ?? [], filter, hideFood),
    [bundle, chronicle, defs, filter, hideFood],
  );

  if (!chronicle) {
    return (
      <Panel>
        <p className={styles.empty}>{error ?? 'Opening the Chronicle…'}</p>
      </Panel>
    );
  }

  const pct = chronicle.total > 0 ? Math.round((chronicle.owned / chronicle.total) * 100) : 0;

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Every champion the vale holds, kept or not."
        actions={
          <ScreenInfo title="The Chronicle">
            <Panel title="The Chronicle">
              <p className={styles.progress}>
                <span className={styles.progressValue}>
                  {chronicle.owned} / {chronicle.total}
                </span>
                <span className={styles.progressLabel}>champions gathered</span>
              </p>
              <div
                className={styles.bar}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span style={{ width: `${pct}%` }} />
              </div>
              <p className={styles.note}>
                Every champion in the game is listed, whether you have met them or not — the ones
                you do not hold are greyed. Champions you have fought are marked as met. Brood-kin
                are listed but do not count toward the total.
              </p>
            </Panel>
          </ScreenInfo>
        }
      >
        The Chronicle
      </Heading>

      <div className={styles.body}>
        <div className={styles.controls}>
          <div className={styles.filters} role="group" aria-label="Filter">
            {(['all', 'owned', 'missing'] as Filter[]).map((entry) => (
              <button
                key={entry}
                type="button"
                className={styles.filter}
                aria-pressed={filter === entry}
                onClick={() => setFilter(entry)}
              >
                {entry === 'all' ? 'Everyone' : entry === 'owned' ? 'Owned' : 'Still missing'}
              </button>
            ))}
          </div>
          <span className={styles.tally}>
            {chronicle.owned} of {chronicle.total} gathered
          </span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={hideFood}
              onChange={(event) => setHideFood(event.target.checked)}
            />
            Hide brood-kin
          </label>
        </div>

        <div className={styles.shelves}>
          {shelves.map((shelf, index) => (
            <section key={shelf.faction?.key ?? index} className={styles.shelf}>
              {/* Name, tally, rule. No faction art: `factionDef.icon` is a free-form
                  content string rather than one of the kit's typed icons, and a header
                  that draws a broken symbol for a faction added in Admin is worse than one
                  that draws none. */}
              <header className={styles.shelfHead}>
                <h2 className={styles.shelfName}>{shelf.faction?.name ?? 'Unaligned'}</h2>
                <span className={styles.shelfCount}>
                  {shelf.owned}
                  <span className={styles.shelfOf}>/{shelf.total}</span>
                </span>
                <span className={styles.shelfRule} aria-hidden="true" />
              </header>

              <div className={styles.grid}>
                {shelf.entries.map(({ entry, def }) => (
                  <Tile
                    key={entry.championKey}
                    entry={entry}
                    def={def}
                    faction={shelf.faction}
                    art={artFor(def, bundle?.assets)}
                  />
                ))}
              </div>
            </section>
          ))}

          {shelves.length === 0 && <p className={styles.empty}>Nothing matches that filter.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * One champion in the index.
 *
 * A component because a tooltip is a hook and there are two hundred of these. The tile
 * itself stays deliberately thin — a face, a name, and two marks — and everything else a
 * collector might want is on the hover: role, faction, what the champion is called, how
 * many copies are held and the best rank among them.
 *
 * The two marks are the ones that change what a player *does*: the rarity, as the frame
 * colour, because it is what a summon is judged by; and the affinity, as a corner pip,
 * because it is what a team is built around. Level and power are deliberately absent —
 * this is a record of the world, not of the roster.
 */
function Tile({
  entry,
  def,
  faction,
  art,
}: {
  entry: ChronicleEntry;
  def: ChampionDef | undefined;
  faction: FactionDef | undefined;
  art: string | null;
}): JSX.Element {
  const state = entry.owned ? 'owned' : entry.seen ? 'seen' : 'unknown';
  const affinity = def?.element ? affinityOf(def.element) : undefined;

  const ref = useTip({
    title: def?.name ?? entry.championKey,
    ...(def?.rarity ? { rarity: def.rarity } : {}),
    subtitle: faction?.name ?? 'Unaligned',
    ...(def?.title ? { slotLabel: def.title } : {}),
    stats: [
      ...(def?.rarity
        ? [{ label: 'Rarity', value: titleCase(def.rarity), tone: 'magic' as const }]
        : []),
      ...(affinity ? [{ label: 'Affinity', value: affinity.label, tone: 'plain' as const }] : []),
      ...(def?.role ? [{ label: 'Role', value: titleCase(def.role), tone: 'plain' as const }] : []),
      entry.owned
        ? { label: 'Held', value: `${entry.copies}`, tone: 'good' as const }
        : { label: 'Held', value: 'None', tone: 'plain' as const },
      ...(entry.owned
        ? [{ label: 'Best rank', value: `★${entry.bestRank}`, tone: 'plain' as const }]
        : []),
    ],
    ...(def?.lore ? { flavor: def.lore } : {}),
    ...(entry.owned
      ? {}
      : { requires: [entry.seen ? 'Met in the field, never yours' : 'Not yet encountered'] }),
  });

  return (
    <div
      ref={ref}
      className={styles.entry}
      data-state={state}
      data-rarity={def?.rarity ?? 'common'}
    >
      <span className={styles.portrait}>
        <Portrait src={art} name={def?.name} size={CHRONICLE_PORTRAIT} />
        {affinity && (
          <span
            className={styles.affinity}
            style={{ '--mv-affinity': affinity.color } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
      </span>
      <span className={styles.name}>{def?.name ?? entry.championKey}</span>
      {entry.owned ? (
        <span className={styles.marks}>
          <span className={styles.rank}>{'★'.repeat(Math.max(1, entry.bestRank))}</span>
          {entry.copies > 1 && <span className={styles.copies}>×{entry.copies}</span>}
        </span>
      ) : (
        <span className={styles.marks} data-quiet="true">
          {entry.seen ? 'Met' : '—'}
        </span>
      )}
    </div>
  );
}

/**
 * The drawn avatar, or nothing.
 *
 * `avatarPath` and not the asset itself: every art-pending champion points at the shared
 * model, which has no face. Falling through to `Portrait`'s placeholder is the answer, and
 * asking for a URL that is not there first is not.
 */
/**
 * How large a face is drawn on a shelf.
 *
 * `$tile-chronicle` (11rem = 176px) less the tile's own padding. It is a number in two
 * places because the library's `Portrait` sizes its frame in pixels and the tile sizes its
 * track in CSS — and the two disagreeing is exactly the bug this fixed: a 56px portrait
 * adrift in a tile that had stretched to three hundred.
 */
const CHRONICLE_PORTRAIT = 168;

function artFor(
  def: ChampionDef | undefined,
  assets: readonly { key: string; basePath: string; avatarPath: string }[] | undefined,
): string | null {
  const asset = (assets ?? []).find((item) => item.key === def?.assetKey);
  return asset?.avatarPath ? avatarPath(asset.basePath) : null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
