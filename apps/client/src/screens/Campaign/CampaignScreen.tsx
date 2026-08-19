import { useEffect, useMemo, useState } from 'react';
import type { CampaignChapterDef, Difficulty, StageDef } from '@mistvale/shared';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { StageSelect } from '@/fui/components/StageSelect.ts';
import { WorldMap, type MapNode } from '@/fui/components/WorldMap.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { regionGlyph } from '../../ui/regionArt';
import { TeamSelect } from '../Battle/TeamSelect';
import styles from './CampaignScreen.module.scss';
import { highlightable } from '../../app/highlight';
import { Heading } from '@/ui/Heading/Heading';
import { stageBoss } from '../../ui/BossCard/bossRules';

/**
 * The campaign map, and since the design rework it is one.
 *
 * Twelve chapters on three difficulties is 252 stages, far too many to lay flat: a player
 * wants the chapter they are *in*, not an inventory of everywhere they have been. It used
 * to answer that with an accordion — twelve fold-out rows of text — which is the right
 * information in the shape of a settings screen. Now it is the library's `WorldMap` with
 * the vale's twelve chapters on it, and the chosen one's seven stages snaking below in
 * `StageSelect`, which is the shape this genre has used since the first campaign map and
 * the reason a player can see where they are without reading anything.
 *
 * The map opens on the chapter the player is in — the first with something left to do —
 * so it answers "where was I" before it is asked (docs/UI_UX_DESIGN.md §3).
 *
 * Everything shown is read from the published content bundle and the server's progress
 * payload, so adding chapter 13 in Admin puts a marker on the map with no client change,
 * and a stage greyed out here is a stage the battle route will refuse (CLAUDE.md — content
 * is data). Where each marker *sits* is derived from the chapter's own number rather than
 * authored, for the same reason: a thirteenth chapter has to land somewhere sensible
 * without anybody placing it first.
 */

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'brutal'];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

/** Three stars on seven stages: what a chapter is worth on one difficulty. */
const STARS_PER_CHAPTER_DIFFICULTY = 21;

/** Markers per row before the road turns back on itself. */
const MAP_COLUMNS = 4;

/**
 * The map's height in pixels — one row, plus a step for each row after it.
 *
 * A number rather than a percentage: the map sits in a scroller whose own height is
 * indefinite, where a percentage resolves against nothing and collapses the map to a
 * strip.
 */
const MAP_ROW_HEIGHT = 200;
const MAP_ROW_STEP = 110;

const mapRows = (chapters: number): number => Math.max(1, Math.ceil(chapters / MAP_COLUMNS));

/**
 * Where a chapter sits on the map.
 *
 * A serpentine, because the road is walked in order and a grid would not say so: odd rows
 * run right to left, so the last marker of one row is directly above the first of the next
 * and the path between them is short. The nudge is `index`-derived rather than random —
 * a map that reshuffles itself on every re-render is a map nobody can learn.
 */
function mapPosition(index: number): { x: number; y: number } {
  const row = Math.floor(index / MAP_COLUMNS);
  const withinRow = index % MAP_COLUMNS;
  const column = row % 2 === 0 ? withinRow : MAP_COLUMNS - 1 - withinRow;
  return {
    x: 12 + column * (76 / (MAP_COLUMNS - 1)),
    y: 16 + row * 28 + (index % 3) * 3,
  };
}

export function CampaignScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const standings = useProgressStore((state) => state.stages);
  const parentStars = useProgressStore((state) => state.parentStars);
  const claimedChests = useProgressStore((state) => state.claimedChests);
  const loadProgress = useProgressStore((state) => state.load);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [chosen, setChosen] = useState<StageDef | null>(null);
  /**
   * The chapter the player has opened, or null for "wherever I am".
   *
   * Null rather than a key so switching difficulty re-answers the question instead of
   * carrying a chapter across that may not even be open on the harder road.
   */
  const [opened, setOpened] = useState<string | null>(null);

  // Re-read on mount: coming back from a fight, the map has to know what opened.
  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const chapters = useMemo<CampaignChapterDef[]>(
    () => [...(bundle?.campaignChapters ?? [])].sort((a, b) => a.number - b.number),
    [bundle],
  );

  const stagesByChapter = useMemo(() => {
    const map = new Map<string, StageDef[]>();
    for (const stage of bundle?.stages ?? []) {
      if (stage.mode !== 'campaign' || stage.difficulty !== difficulty) continue;
      const list = map.get(stage.parentKey) ?? [];
      list.push(stage);
      map.set(stage.parentKey, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.number - b.number);
    return map;
  }, [bundle, difficulty]);

  /** Which difficulties actually have stages, so an empty tab is disabled not broken. */
  const available = useMemo(() => {
    const set = new Set<string>();
    for (const stage of bundle?.stages ?? []) {
      if (stage.mode === 'campaign') set.add(stage.difficulty);
    }
    return set;
  }, [bundle]);

  /**
   * Where the player is: the first chapter at this difficulty that still has an open stage
   * short of three stars.
   *
   * Two fallbacks, and they point opposite ways on purpose. A difficulty with nothing open
   * at all has not been started — show its first chapter, which is where the door is and
   * where the reason it is shut is written. A difficulty with everything open and starred
   * is finished — show the last, so a completionist lands on the end rather than back at
   * the beginning.
   */
  const current = useMemo(() => {
    let anyOpen = false;
    for (const chapter of chapters) {
      const stages = stagesByChapter.get(chapter.key) ?? [];
      const open = stages.filter((stage) => standings.get(stage.key)?.open ?? true);
      anyOpen ||= open.length > 0;
      if (open.some((stage) => (standings.get(stage.key)?.stars ?? 0) < 3)) return chapter.key;
    }
    return (anyOpen ? chapters.at(-1)?.key : chapters[0]?.key) ?? null;
  }, [chapters, stagesByChapter, standings]);

  /** Stars earned in one chapter at the chosen difficulty. */
  const starsIn = (chapter: CampaignChapterDef): number =>
    (stagesByChapter.get(chapter.key) ?? []).reduce(
      (total, stage) => total + (standings.get(stage.key)?.stars ?? 0),
      0,
    );

  const showing = opened ?? current;
  const chapter = chapters.find((entry) => entry.key === showing) ?? null;

  const nodes = useMemo<MapNode[]>(
    () =>
      chapters.map((entry, index) => {
        const stages = stagesByChapter.get(entry.key) ?? [];
        const earned = stages.reduce(
          (total, stage) => total + (standings.get(stage.key)?.stars ?? 0),
          0,
        );
        const reachable = stages.some((stage) => standings.get(stage.key)?.open ?? true);
        const next = chapters[index + 1];
        return {
          id: entry.key,
          name: `${entry.number}. ${entry.name}`,
          ...mapPosition(index),
          state: !reachable
            ? 'locked'
            : earned >= STARS_PER_CHAPTER_DIFFICULTY
              ? 'cleared'
              : entry.key === showing
                ? 'current'
                : 'open',
          glyph: regionGlyph(entry.region),
          // Out of three, which is the marker's own vocabulary — so a chapter's mark is
          // its *average* clear, and the exact count goes in the note underneath.
          stars: Math.floor(earned / Math.max(stages.length, 1)),
          // A shut chapter says why rather than showing a score nobody could have earned.
          // It is the only place the reason can live: the marker cannot be opened, so the
          // prose under the map — which explains the *open* chapter — never gets to.
          note: reachable
            ? `${entry.region} · ${earned}/${STARS_PER_CHAPTER_DIFFICULTY}★`
            : (stages.map((stage) => standings.get(stage.key)?.lockedReason).find(Boolean) ??
              entry.region),
          // The last chapter only: a bigger, redder marker means "the end of the road",
          // and putting one on all twelve would mean nothing at all.
          ...(index === chapters.length - 1 ? { boss: true } : {}),
          ...(next ? { links: [next.key] } : {}),
        };
      }),
    [chapters, stagesByChapter, standings, showing],
  );

  /**
   * A digest of everything drawn on the map.
   *
   * `WorldMap` takes its nodes once, at construction — it exposes `setState` for a single
   * marker and nothing for the list — so the map has to be remounted when the map changes.
   * Keying it on the difficulty alone was not enough: progress arrives one request after
   * the first paint, and a map built before it showed twelve untouched chapters for the
   * rest of the visit. This changes exactly when a marker would.
   */
  const mapKey = useMemo(
    () =>
      `${difficulty}|${nodes.map((node) => `${node.id}:${node.state}:${node.stars}:${node.note}`).join(',')}`,
    [difficulty, nodes],
  );

  const walked = useMemo(() => {
    const total = chapters.length * STARS_PER_CHAPTER_DIFFICULTY;
    if (total === 0) return 0;
    return chapters.reduce((sum, entry) => sum + starsIn(entry), 0) / total;
    // `starsIn` closes over the same two stores the deps already name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, stagesByChapter, standings]);

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Loading the vale…</p>
      </Panel>
    );
  }

  const stages = chapter ? (stagesByChapter.get(chapter.key) ?? []) : [];
  /**
   * Why the road stops, if it does.
   *
   * A `StageSelect` node is a disc with a number on it and has nowhere to put a sentence,
   * where the old tiles each carried their own "Clear 1-2 first." Only one of those was
   * ever worth reading — the first shut door — so it is said once, here, in prose.
   */
  const shut = stages.find((stage) => standings.get(stage.key)?.open === false);
  const shutReason = shut ? (standings.get(shut.key)?.lockedReason ?? null) : null;
  /**
   * The warlord at the end of the chapter, named.
   *
   * The screen's own tagline has promised "a warlord waiting at the end of each" since P6
   * and never said who — while content has known all along, in the last wave of the last
   * stage. What it does is said in the team chooser, where the energy is about to be spent.
   */
  const warlord = stages.length > 0 ? stageBoss(stages[stages.length - 1]!, bundle.enemies) : null;

  const chest = chapter ? nextChest(chapter, parentStars[chapter.key] ?? 0, claimedChests) : null;

  return (
    <div className={styles.screen}>
      <Heading tagline="Twelve chapters, three difficulties, and a warlord waiting at the end of each.">
        The Campaign
      </Heading>

      <div className={styles.column}>
        <Fui
          of={SegmentedControl}
          className={styles.difficulties}
          attrs={{ 'aria-label': 'Difficulty' }}
          options={{
            value: difficulty,
            segments: DIFFICULTIES.map((entry) => ({
              value: entry,
              label: DIFFICULTY_LABEL[entry],
              disabled: !available.has(entry),
            })),
          }}
          on={{
            'segment:change': (value: string) => {
              setDifficulty(value as Difficulty);
              setOpened(null);
            },
          }}
        />

        {chapters.length === 0 ? (
          <Empty
            glyph="glyph-crossed-swords"
            title="No chapters are published"
            message="The road through the vale is content — it is laid in the Admin Suite."
          />
        ) : (
          <div className={styles.scroller}>
            {/* Remounted whenever a marker would change — see `mapKey`. */}
            <Fui
              key={mapKey}
              of={WorldMap}
              className={styles.map}
              options={{
                nodes,
                art: 'bg-wide',
                title: 'The Vale',
                progress: walked,
                height: MAP_ROW_HEIGHT + (mapRows(chapters.length) - 1) * MAP_ROW_STEP,
                interactive: true,
              }}
              on={{ 'map:enter': (key: string) => setOpened(key) }}
            />

            {chapter && (
              <section className={styles.chapter} {...highlightable('panel:chapter')}>
                <p className={styles.lore}>
                  {chapter.lore}
                  {warlord && (
                    <span className={styles.warlord}> {warlord.name} holds the last stage.</span>
                  )}
                  {shutReason && <span className={styles.shut}> {shutReason}</span>}
                  {chest && (
                    <span className={styles.chest}>
                      {' '}
                      Next chest at {chest.stars}★ — {parentStars[chapter.key] ?? 0} earned across
                      every difficulty.
                    </span>
                  )}
                </p>

                {/* Keyed for the same reason the map is: `StageSelect` offers
                    `setStages` but nothing for its title or subtitle, and both carry
                    numbers that move. Rebuilding a row of seven nodes costs nothing. */}
                {stages.length === 0 ? (
                  <p className={styles.empty}>
                    Nothing here on {DIFFICULTY_LABEL[difficulty]} yet.
                  </p>
                ) : (
                  <Fui
                    key={`${chapter.key}|${difficulty}|${stages
                      .map((stage) => {
                        const standing = standings.get(stage.key);
                        return `${standing?.open ?? true}:${standing?.stars ?? 0}`;
                      })
                      .join(',')}`}
                    of={StageSelect}
                    className={styles.stages}
                    options={{
                      title: `${chapter.number}. ${chapter.name}`,
                      subtitle: `${chapter.region} · ${starsIn(chapter)}/${STARS_PER_CHAPTER_DIFFICULTY}★ on ${DIFFICULTY_LABEL[difficulty]}`,
                      layout: 'path',
                      columns: 7,
                      stages: stages.map((stage, index) => {
                        const standing = standings.get(stage.key);
                        // Default to open: on the first paint, before progress lands, a
                        // hopeful map beats one that flickers everything shut.
                        const unlocked = standing?.open ?? true;
                        const stars = standing?.stars ?? 0;
                        return {
                          id: stage.key,
                          label: `${chapter.number}-${stage.number}`,
                          stars,
                          state: !unlocked
                            ? ('locked' as const)
                            : stars > 0
                              ? ('cleared' as const)
                              : ('current' as const),
                          cost: stage.energyCost,
                          // The warlord waits at the end of every chapter, and the node
                          // this marks is the one a player saves their energy for.
                          ...(index === stages.length - 1 ? { boss: true } : {}),
                        };
                      }),
                    }}
                    on={{
                      // The node, not its id — `StageSelect` emits the whole entry.
                      'stage:select': (node: { id: string }) => {
                        const stage = stages.find((entry) => entry.key === node.id);
                        if (stage) setChosen(stage);
                      },
                    }}
                  />
                )}
              </section>
            )}
          </div>
        )}
      </div>

      <aside className={styles.sidebar}>
        <Panel title="The Campaign">
          <p className={styles.note}>
            Push through the Sskarn invasion chapter by chapter. Clearing a stage pays silver and
            experience; energy comes back on its own over time. You have {energy}.
          </p>
          <p className={styles.note}>
            Each chapter drops one relic set, and each stage number drops one slot — so a chapter is
            a farm for something specific rather than a lottery.
          </p>
          <p className={styles.note}>
            Hard opens once the whole vale has fallen on Normal, and Brutal once it has fallen on
            Hard. Stars carry across all three, and the chapter chests count every one of them.
          </p>
        </Panel>
      </aside>

      {chosen && <TeamSelect stage={chosen} onClose={() => setChosen(null)} />}
    </div>
  );
}

/** The next star-chest tier a chapter still owes, or null once they are all paid. */
function nextChest(
  chapter: CampaignChapterDef,
  stars: number,
  claimed: Record<string, number[]>,
): { stars: number } | null {
  const paid = new Set(claimed[chapter.key] ?? []);
  const pending = [...chapter.starRewards]
    .sort((a, b) => a.stars - b.stars)
    .find((tier) => !paid.has(tier.stars) && tier.stars > stars);
  return pending ? { stars: pending.stars } : null;
}
