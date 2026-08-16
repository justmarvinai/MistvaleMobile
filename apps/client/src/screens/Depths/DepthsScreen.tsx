import { useEffect, useMemo, useState } from 'react';
import type { DungeonDef, StageDef } from '@mistvale/shared';
import { WEEKDAY_NAMES } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useDepthsStore } from '../../state/depthsStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { TeamSelect } from '../Battle/TeamSelect';
import { FloorPicker } from './FloorPicker';
import styles from './DepthsScreen.module.scss';

/**
 * The Depths hub.
 *
 * Three groups, because they are farmed for three different reasons: the relic keeps, the
 * Proving Grounds, and the springs — whose whole character is that most of them are shut
 * most of the time (docs/UI_UX_DESIGN.md §3, screen 15).
 *
 * Everything drawn here comes from the content bundle except two facts only the server can
 * know: which keeps are open today, and how deep this warden has been.
 */

const GROUPS: { kind: DungeonDef['kind']; title: string; blurb: string }[] = [
  {
    kind: 'relic',
    title: 'The Relic Keeps',
    blurb:
      'Four keeps, four sets. A run always pays a relic; how good a relic is how deep you went.',
  },
  {
    kind: 'proving',
    title: 'The Proving Grounds',
    blurb: 'Emblems for masteries, and a pitmaster whose patience runs out on a timer.',
  },
  {
    kind: 'springs',
    title: 'The Essence Springs',
    blurb: 'Ascension essence. The Pure Spring runs every day; the rest keep their own hours.',
  },
];

export function DepthsScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const standings = useDepthsStore((state) => state.dungeons);
  const weekday = useDepthsStore((state) => state.weekday);
  const graceUntil = useDepthsStore((state) => state.graceUntil);
  const loadDepths = useDepthsStore((state) => state.load);
  const loadProgress = useProgressStore((state) => state.load);
  const unlocks = usePlayerStore((state) => state.unlocks);

  const [openDungeon, setOpenDungeon] = useState<DungeonDef | null>(null);
  const [chosen, setChosen] = useState<{ stage: StageDef; title: string } | null>(null);

  // Both re-read on mount: a clear can open the next floor, and the rotation turns over
  // while a player is logged in.
  useEffect(() => {
    void loadDepths();
    void loadProgress();
  }, [loadDepths, loadProgress]);

  const byKind = useMemo(() => {
    const map = new Map<DungeonDef['kind'], DungeonDef[]>();
    for (const dungeon of bundle?.dungeons ?? []) {
      const list = map.get(dungeon.kind) ?? [];
      list.push(dungeon);
      map.set(dungeon.kind, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [bundle]);

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Feeling for the way down…</p>
      </Panel>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.list}>
        {(bundle.dungeons ?? []).length === 0 && (
          <p className={styles.empty}>Nothing has been opened down here yet.</p>
        )}

        {GROUPS.map((group) => {
          const dungeons = byKind.get(group.kind) ?? [];
          if (dungeons.length === 0) return null;

          return (
            <section key={group.kind} className={styles.group}>
              <header className={styles.groupHead}>
                <h2 className={styles.groupTitle}>{group.title}</h2>
                <p className={styles.groupBlurb}>{group.blurb}</p>
              </header>

              <div className={styles.keeps}>
                {dungeons.map((dungeon) => {
                  const standing = standings.get(dungeon.key);
                  // Hopeful until the server says otherwise: on the first paint a hub that
                  // shows everything shut would be wrong more often than right.
                  const open = standing?.open ?? true;
                  const depth = standing?.highestFloor ?? 0;

                  return (
                    <button
                      key={dungeon.key}
                      type="button"
                      className={styles.keep}
                      data-open={open}
                      data-entered={depth > 0 ? 'true' : undefined}
                      onClick={() => setOpenDungeon(dungeon)}
                    >
                      <span className={styles.keepHead}>
                        <span className={styles.keepName}>{dungeon.name}</span>
                        <span className={styles.keepDepth}>
                          {depth > 0
                            ? `Floor ${depth} / ${dungeon.floors}`
                            : `${dungeon.floors} floors`}
                        </span>
                      </span>

                      <span className={styles.keepTagline}>{dungeon.tagline}</span>

                      <span className={styles.keepFooter}>
                        {open ? (
                          <span className={styles.keepOpen}>{rotationLine(dungeon, weekday)}</span>
                        ) : (
                          <span className={styles.keepShut}>{standing?.lockedReason}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <aside className={styles.sidebar}>
        <Panel title="The Depths">
          <p className={styles.empty}>
            Below the vale are keeps the Sskarn moved into rather than built. Relics come out of
            four of them, mastery emblems out of the pit, and ascension essence out of the springs.
          </p>
        </Panel>

        {graceUntil && (
          <Panel title="Newcomer&rsquo;s welcome">
            <p className={styles.empty}>
              Every spring stands open to you until {formatDay(graceUntil)}, whatever the day. After
              that they keep their own hours.
            </p>
          </Panel>
        )}

        {unlocks && !unlocks.dungeons && (
          <Panel title="Still shut">
            <p className={styles.empty}>
              The relic keeps open at account level 12, and the Proving Grounds at 14.
            </p>
          </Panel>
        )}
      </aside>

      {openDungeon && (
        <FloorPicker
          dungeon={openDungeon}
          onClose={() => setOpenDungeon(null)}
          onPick={(stage, title) => {
            setOpenDungeon(null);
            setChosen({ stage, title });
          }}
        />
      )}

      {chosen && (
        <TeamSelect
          stage={chosen.stage}
          title={chosen.title}
          onClose={() => {
            setChosen(null);
            void loadDepths();
          }}
        />
      )}
    </div>
  );
}

/** "Open today" for a spring that is running, or the days it keeps. */
function rotationLine(dungeon: DungeonDef, weekday: number | null): string {
  if (dungeon.openDays.length === 0) return 'Open every day';
  if (weekday !== null && dungeon.openDays.includes(weekday)) return 'Open today';
  return `Open ${dungeon.openDays.map((day) => WEEKDAY_NAMES[day] ?? '').join(' & ')}`;
}

/** A date as the game speaks about them: a weekday, not a timestamp. */
function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'the end of your first week';
  return WEEKDAY_NAMES[date.getDay()] ?? 'the end of your first week';
}
