import { useEffect, useMemo, useState } from 'react';
import type { Chronicle } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { gameApi } from '../../api/game';
import { avatarPath } from '../../game/sprites';
import { useContentStore } from '../../state/contentStore';
import styles from './ChronicleScreen.module.scss';
import { Portrait } from '../../ui/Portrait/Portrait';
import { Heading } from '@/ui/Heading/Heading';

/**
 * The Chronicle.
 *
 * Every champion in the world, in three states: owned, met, and unknown. A champion the
 * player has fought shows its silhouette and its name — the point of a collection tracker
 * is to make the gaps legible, and a wall of question marks tells you nothing about what
 * you are missing.
 *
 * Food units appear but do not count toward completion (GAME_DESIGN §10).
 */

type Filter = 'all' | 'owned' | 'missing';

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

  const visible = useMemo(() => {
    return (chronicle?.entries ?? []).filter((entry) => {
      const def = defs.get(entry.championKey);
      if (hideFood && def?.isFood) return false;
      if (filter === 'owned') return entry.owned;
      if (filter === 'missing') return !entry.owned;
      return true;
    });
  }, [chronicle, defs, filter, hideFood]);

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
      <Heading tagline="Every champion the vale has shown you, kept or not.">The Chronicle</Heading>

      <div>
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
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={hideFood}
              onChange={(event) => setHideFood(event.target.checked)}
            />
            Hide brood-kin
          </label>
        </div>

        <div className={styles.grid}>
          {visible.map((entry) => {
            const def = defs.get(entry.championKey);
            const asset = bundle?.assets.find((item) => item.key === def?.assetKey);
            const art = asset ? avatarPath(asset.basePath) : null;
            const state = entry.owned ? 'owned' : entry.seen ? 'seen' : 'unknown';

            return (
              <div
                key={entry.championKey}
                className={styles.entry}
                data-state={state}
                data-rarity={def?.rarity ?? 'common'}
                title={
                  entry.owned
                    ? `${entry.copies} held · best ★${entry.bestRank}`
                    : entry.seen
                      ? 'Met, but never yours'
                      : 'Not yet encountered'
                }
              >
                <span className={styles.portrait}>
                  {state === 'unknown' ? (
                    <span className={styles.silhouette}>?</span>
                  ) : (
                    <Portrait src={art} name={def?.name} size={56} />
                  )}
                </span>
                <span className={styles.name}>
                  {state === 'unknown' ? '???' : (def?.name ?? entry.championKey)}
                </span>
                {entry.owned && entry.copies > 1 && (
                  <span className={styles.copies}>×{entry.copies}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <aside className={styles.sidebar}>
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
            Champions you have fought are recorded even if you never owned them. Brood-kin are
            listed but do not count toward the total.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
