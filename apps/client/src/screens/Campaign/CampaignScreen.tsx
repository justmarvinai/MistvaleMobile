import { useEffect, useMemo, useState } from 'react';
import type { CampaignChapterDef, Difficulty, StageDef } from '@mistvale/shared';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { WorldMap, type MapNode } from '@/fui/components/WorldMap.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { useCampaignStore } from '../../state/campaignStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { regionArt, regionGlyph } from '../../ui/regionArt';
import { TeamSelect } from '../Battle/TeamSelect';
import { ChapterStages } from './ChapterStages';
import { STARS_PER_CHAPTER_DIFFICULTY } from './chapterView';
import styles from './CampaignScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';
import { ScreenInfo } from '../../ui/ScreenInfo/ScreenInfo';

/**
 * The campaign, in three steps.
 *
 * **The map is the whole screen** (the owner's call, 2026-08-21, following the reference
 * game): twelve chapters across the vale and nothing else on it. Opening one is a page of
 * its own — seven stages as rows, with what each drops and what it cost last time
 * (`ChapterStages`) — and opening a stage is the team chooser, which since the same change
 * shows the enemy line-up it is being chosen against.
 *
 * It replaced a map with a seven-disc strip bolted underneath, where the map had 55% of a
 * screen and the strip could say nothing whatever about any stage on it. Splitting them
 * gives both the room to be what they are: a map you read at a glance, and a list you read
 * a line at a time.
 *
 * Where the player is — which chapter is open, which difficulty — lives in
 * `state/campaignStore` rather than in this component, because a fight unmounts the
 * campaign and every victory used to drop the player back on the world map.
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

/** Markers per row before the road turns back on itself. */
const MAP_COLUMNS = 4;

/**
 * The map fills its pane.
 *
 * It used to be a pixel height computed from the row count, because it sat in a scroller
 * whose own height was indefinite, where a percentage resolves against nothing and
 * collapses the map to a strip. The pane is a definite box now — the screen's whole content
 * row, since the chapter dock moved to a page of its own — so `100%` resolves.
 */
const MAP_HEIGHT = '100%';

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
    // The first row starts below the region title rather than beside it. With the map's
    // frame gone the title floats on the same ground the markers do, and at 1440 the
    // progress bar and chapter one's disc were touching. Three rows at 32% apart use the
    // whole pane (C44) — the bottom third used to stand empty — and a 72px marker with
    // its three lines of label is about 140px tall, which fits between rows at every
    // window the game is played on.
    y: 18 + row * 32 + (index % 3) * 3,
  };
}

/**
 * Writes each marker's painting onto the library's own node (C44).
 *
 * `WorldMap` draws a glyph mask in a disc and has no notion of a picture, so the region's
 * painting goes on as a custom property the screen's stylesheet reads, after the map is
 * built. The node carries the chapter key as `data-id`, so the lookup is by key rather
 * than by order.
 */
function paintMarkers(root: HTMLElement, artByKey: ReadonlyMap<string, string>): void {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('.fui-map__node[data-id]'))) {
    const art = artByKey.get(node.dataset.id ?? '');
    if (art) node.style.setProperty('--mv-node-art', `var(--fui-img-${art})`);
  }
}

export function CampaignScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const standings = useProgressStore((state) => state.stages);
  const loadProgress = useProgressStore((state) => state.load);
  const difficulty = useCampaignStore((state) => state.difficulty);
  const setDifficulty = useCampaignStore((state) => state.setDifficulty);
  const openedKey = useCampaignStore((state) => state.chapterKey);
  const openChapter = useCampaignStore((state) => state.openChapter);
  const [chosen, setChosen] = useState<StageDef | null>(null);

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
              : entry.key === current
                ? 'current'
                : 'open',
          glyph: regionGlyph(entry.region),
          // Out of three, which is the marker's own vocabulary — so a chapter's mark is
          // its *average* clear, and the exact count goes in the note underneath.
          stars: Math.floor(earned / Math.max(stages.length, 1)),
          // A shut chapter says why rather than showing a score nobody could have earned.
          // It is the only place the reason can live: the marker cannot be opened, so
          // nothing else ever gets to say it.
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
    [chapters, stagesByChapter, standings, current],
  );

  /**
   * The painting on each marker, by chapter key (C44). Two chapters in one region get two
   * paintings, in chapter order, so the road reads as twelve places rather than six
   * repeated twice.
   */
  const artByKey = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(
      chapters.map((entry) => {
        const ordinal = seen.get(entry.region) ?? 0;
        seen.set(entry.region, ordinal + 1);
        return [entry.key, regionArt(entry.region, ordinal)] as const;
      }),
    );
  }, [chapters]);

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
    const earned = chapters.reduce(
      (sum, entry) =>
        sum +
        (stagesByChapter.get(entry.key) ?? []).reduce(
          (chapterStars, stage) => chapterStars + (standings.get(stage.key)?.stars ?? 0),
          0,
        ),
      0,
    );
    return earned / total;
  }, [chapters, stagesByChapter, standings]);

  /**
   * The difficulty strip, built once and handed to whichever view is drawing.
   *
   * It belongs to the screen rather than to either page: the difficulty is a mode the whole
   * campaign is in, and a chapter page that dropped it would make comparing Normal with
   * Hard a trip back to the map and in again.
   */
  const difficulties = (
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
      on={{ 'segment:change': (value: string) => setDifficulty(value as Difficulty) }}
    />
  );

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Loading the vale…</p>
      </Panel>
    );
  }

  const opened = chapters.find((entry) => entry.key === openedKey) ?? null;

  /**
   * The dialog's title, as a player says the stage: "Stage 1-4", not "Stage 4".
   *
   * Read off the stage's own parent rather than off whatever chapter happens to be open,
   * so it stays right no matter where the stage was picked from.
   */
  const chosenChapter = chosen
    ? (chapters.find((entry) => entry.key === chosen.parentKey) ?? null)
    : null;
  const team = chosen ? (
    <TeamSelect
      stage={chosen}
      {...(chosenChapter ? { title: `Stage ${chosenChapter.number}-${chosen.number}` } : {})}
      onClose={() => setChosen(null)}
    />
  ) : null;

  if (opened) {
    return (
      <>
        <ChapterStages
          chapter={opened}
          difficulty={difficulty}
          stages={stagesByChapter.get(opened.key) ?? []}
          onBack={() => openChapter(null)}
          onPick={setChosen}
          actions={difficulties}
        />
        {team}
      </>
    );
  }

  return (
    <div className={styles.screen}>
      <Heading
        tagline={`Twelve chapters, three difficulties, and a warlord at the end of each. You have ${energy} energy.`}
        actions={
          <>
            {/* In the title bar rather than over the map: difficulty is a mode the whole
                screen is in, the row is already there, and a strip of its own would cost
                the map thirty pixels on every visit. */}
            {difficulties}
            <ScreenInfo title="The Campaign">
              <Panel title="The Campaign">
                <p className={styles.note}>
                  Push through the Sskarn invasion chapter by chapter. Open a chapter to see its
                  seven stages, what each of them drops and what it costs.
                </p>
                <p className={styles.note}>
                  Each chapter drops one relic set, and each stage number drops one slot — so a
                  chapter is a farm for something specific rather than a lottery.
                </p>
                <p className={styles.note}>
                  Hard opens once the whole vale has fallen on Normal, and Brutal once it has fallen
                  on Hard. Stars carry across all three, and the chapter chests count every one of
                  them.
                </p>
              </Panel>
            </ScreenInfo>
          </>
        }
      >
        The Campaign
      </Heading>

      <div className={styles.column}>
        {chapters.length === 0 ? (
          <Empty
            glyph="glyph-crossed-swords"
            title="No chapters are published"
            message="The road through the vale is content — it is laid in the Admin Suite."
          />
        ) : (
          // The map *is* the screen now: it takes the whole content row rather than 55% of
          // it. Remounted whenever a marker would change — see `mapKey`.
          <div className={styles.mapPane}>
            <Fui
              key={mapKey}
              of={WorldMap}
              className={styles.map}
              options={{
                nodes,
                art: 'bg-wide',
                title: 'The Vale',
                progress: walked,
                height: MAP_HEIGHT,
                interactive: true,
              }}
              on={{ 'map:enter': (key: string) => openChapter(key) }}
              // The bridge calls `apply` on mount, and the map is remounted whenever a
              // marker would change (see `mapKey`) — so this runs exactly when there are
              // fresh nodes to paint.
              apply={(map) => paintMarkers(map.el, artByKey)}
            />
          </div>
        )}
      </div>

      {team}
    </div>
  );
}
