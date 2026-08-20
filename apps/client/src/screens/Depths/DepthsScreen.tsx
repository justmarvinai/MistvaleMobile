import { useEffect, useMemo, useState } from 'react';
import type { DungeonDef, StageDef } from '@mistvale/shared';
import { WEEKDAY_NAMES } from '@mistvale/shared';
import { EventBanner } from '@/fui/components/EventBanner.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useDepthsStore } from '../../state/depthsStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { dungeonArt, dungeonInk } from '../../ui/dungeonArt';
import { TeamSelect } from '../Battle/TeamSelect';
import { FloorPicker } from './FloorPicker';
import styles from './DepthsScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';
import { SpringDial } from '../../ui/SpringDial/SpringDial';

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

  /** The springs, for the dial: the one group whose whole character is taking turns. */
  const springs = useMemo(() => byKind.get('springs') ?? [], [byKind]);

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Feeling for the way down…</p>
      </Panel>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline="Four keeps under the vale, and every floor gives up one kind of relic."
        actions={
          <ScreenInfo title="The Depths" label="About the Depths">
            <p>
              Below the vale are keeps the Sskarn moved into rather than built. Relics come out of
              four of them, mastery emblems out of the pit, and ascension essence out of the
              springs.
            </p>
            <p>
              A keep is a ladder of floors: each one clears harder and pays better, and the deepest
              floor you have reached is the only progress a keep keeps. The relic keeps open at
              account level 12 and the Proving Grounds at 14.
            </p>
            <p>
              The springs keep their own hours — most are shut most of the week, which is what the
              week strip above them is for.
            </p>
          </ScreenInfo>
        }
      >
        The Depths
      </Heading>

      <div className={styles.list}>
        {(bundle.dungeons ?? []).length === 0 && (
          <Empty
            glyph="glyph-skull-wreath"
            title="Nothing has been opened down here"
            message="The keeps under the vale are published from the Admin Suite."
          />
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

              {/* The two things the sidebar used to say about a group, said by the group
                  itself. Both are conditional and both are about *these* keeps, so they
                  belong over these tiles rather than in a column that outlives them. */}
              {group.kind === 'relic' && unlocks && !unlocks.dungeons && (
                <p className={styles.notice}>
                  The relic keeps open at account level 12, and the Proving Grounds at 14.
                </p>
              )}

              {group.kind === 'springs' && (
                <>
                  {graceUntil && (
                    <p className={styles.notice}>
                      Every spring stands open to you until {formatDay(graceUntil)}, whatever the
                      day. After that they keep their own hours.
                    </p>
                  )}
                  {/* The week, once, with the springs on it — five tiles each saying their
                      own hours answers "is this open now" and never answers "when do I come
                      back for Verdant". */}
                  <div className={styles.week}>
                    <SpringDial springs={springs} today={weekday} />
                  </div>
                </>
              )}

              <div className={styles.keeps}>
                {dungeons.map((dungeon) => {
                  const standing = standings.get(dungeon.key);
                  // Hopeful until the server says otherwise: on the first paint a hub that
                  // shows everything shut would be wrong more often than right.
                  const open = standing?.open ?? true;
                  const depth = standing?.highestFloor ?? 0;

                  return (
                    // A keep is key art with a name, a state and a way in, which is what
                    // `EventBanner` is — the same tile the events hub is made of, because
                    // "here is a place, here is what it pays, here is whether it is open
                    // today" is the same question in both. Keyed on what it draws, since
                    // the banner takes its options at construction and the rotation and
                    // the depth both arrive a request after the first paint.
                    <Fui
                      key={`${dungeon.key}|${open}|${depth}|${weekday ?? ''}`}
                      of={EventBanner}
                      className={styles.keep}
                      options={{
                        title: dungeon.name,
                        subtitle: dungeon.tagline,
                        art: dungeonArt(dungeon.key, dungeon.kind),
                        // The ribbon is a corner of the tile and fits about six letters,
                        // so it carries the state and the sentence goes underneath.
                        tag: !open ? 'Shut' : dungeon.openDays.length === 0 ? 'Daily' : 'Today',
                        progress: depth / Math.max(dungeon.floors, 1),
                        progressLabel: !open
                          ? (standing?.lockedReason ?? 'Not open today')
                          : depth > 0
                            ? `Floor ${depth} / ${dungeon.floors} · ${rotationLine(dungeon, weekday)}`
                            : `${dungeon.floors} floors · ${rotationLine(dungeon, weekday)}`,
                        // No button when it is shut: the tag says so, and a way in that
                        // refuses is worse than no way in.
                        ...(open ? { action: depth > 0 ? 'Go back down' : 'Go down' } : {}),
                        ...(dungeonInk(dungeon.kind) ? { color: dungeonInk(dungeon.kind) } : {}),
                      }}
                      on={{ 'event:enter': () => setOpenDungeon(dungeon) }}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

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
