import { useEffect, useMemo, useState } from 'react';
import type { CampaignChapterDef, Difficulty, StageDef } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import { TeamSelect } from '../Battle/TeamSelect';
import styles from './CampaignScreen.module.scss';

/**
 * The campaign map.
 *
 * Twelve chapters on three difficulties is 252 stages, which is far too many to lay flat:
 * a player wants the chapter they are *in*, not an inventory of everywhere they have been.
 * So chapters collapse, and the one that opens on arrival is the first with something left
 * to do — the map answers "where was I" before it is asked (docs/UI_UX_DESIGN.md §3).
 *
 * Everything shown is read from the published content bundle and the server's progress
 * payload, so adding chapter 13 in Admin puts it here with no client change, and a stage
 * greyed out here is a stage the battle route will refuse (CLAUDE.md — content is data).
 */

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'brutal'];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

/** Three stars on seven stages: what a chapter is worth on one difficulty. */
const STARS_PER_CHAPTER_DIFFICULTY = 21;

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
   * Chapters the player has explicitly opened or shut, overriding the default.
   *
   * Keyed by difficulty *and* chapter, so switching tabs shows each difficulty's own
   * default rather than carrying the last one's folds across — and switching back restores
   * what was open before.
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

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

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Loading the vale…</p>
      </Panel>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        <div className={styles.difficulties} role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.difficulty}
              aria-pressed={difficulty === entry}
              disabled={!available.has(entry)}
              onClick={() => setDifficulty(entry)}
            >
              {DIFFICULTY_LABEL[entry]}
            </button>
          ))}
        </div>

        <div className={styles.list}>
          {chapters.length === 0 && <p className={styles.empty}>No chapters are published yet.</p>}

          {chapters.map((chapter) => {
            const stages = stagesByChapter.get(chapter.key) ?? [];
            const earned = stages.reduce(
              (total, stage) => total + (standings.get(stage.key)?.stars ?? 0),
              0,
            );
            const reachable = stages.some((stage) => standings.get(stage.key)?.open ?? true);
            const fold = `${difficulty}:${chapter.key}`;
            const open = toggled[fold] ?? chapter.key === current;
            const chest = nextChest(chapter, parentStars[chapter.key] ?? 0, claimedChests);

            return (
              <section key={chapter.key} className={styles.chapter} data-open={open}>
                <button
                  type="button"
                  className={styles.chapterHead}
                  aria-expanded={open}
                  onClick={() => setToggled((folds) => ({ ...folds, [fold]: !open }))}
                >
                  <span className={styles.chapterName}>
                    <span className={styles.caret} aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    {chapter.number}. {chapter.name}
                  </span>
                  <span className={styles.chapterMeta}>
                    {!reachable && <span className={styles.chapterLocked}>Locked</span>}
                    <span className={styles.chapterStars}>
                      ★ {earned}/{STARS_PER_CHAPTER_DIFFICULTY}
                    </span>
                    <span className={styles.chapterRegion}>{chapter.region}</span>
                  </span>
                </button>

                {open && (
                  <>
                    <p className={styles.chapterLore}>
                      {chapter.lore}
                      {chest && (
                        <span className={styles.chest}>
                          {' '}
                          Next chest at {chest.stars}★ — {parentStars[chapter.key] ?? 0} earned
                          across every difficulty.
                        </span>
                      )}
                    </p>

                    {stages.length === 0 ? (
                      <p className={styles.empty}>
                        Nothing here on {DIFFICULTY_LABEL[difficulty]} yet.
                      </p>
                    ) : (
                      <div className={styles.stages}>
                        {stages.map((stage) => {
                          const affordable = energy >= stage.energyCost;
                          const standing = standings.get(stage.key);
                          // Default to open: on the first paint, before progress lands, a
                          // hopeful map beats one that flickers everything shut.
                          const unlocked = standing?.open ?? true;
                          const stars = standing?.stars ?? 0;

                          return (
                            <button
                              key={stage.key}
                              type="button"
                              className={styles.stage}
                              disabled={!unlocked}
                              data-cleared={stars > 0 ? 'true' : undefined}
                              onClick={() => setChosen(stage)}
                              title={
                                !unlocked
                                  ? (standing?.lockedReason ?? 'Not open yet.')
                                  : affordable
                                    ? `${stage.waves.length} waves · ${stage.energyCost} energy`
                                    : `Needs ${stage.energyCost} energy — you have ${energy}`
                              }
                            >
                              <span className={styles.stageHead}>
                                <span className={styles.stageName}>
                                  {chapter.number}-{stage.number}
                                </span>
                                <span
                                  className={styles.stageStars}
                                  aria-label={`${stars} of 3 stars`}
                                >
                                  {'★'.repeat(stars)}
                                  {'☆'.repeat(3 - stars)}
                                </span>
                              </span>
                              {unlocked ? (
                                <>
                                  <span className={styles.stageMeta}>
                                    {stage.waves.length} waves · {stage.energyCost} energy
                                  </span>
                                  <span className={styles.stageMeta}>
                                    {stage.rewards.silverMin}–{stage.rewards.silverMax} silver
                                  </span>
                                </>
                              ) : (
                                <span className={styles.stageLocked}>
                                  {standing?.lockedReason ?? 'Not open yet.'}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <aside className={styles.sidebar}>
        <Panel title="The Campaign">
          <p className={styles.empty}>
            Push through the Sskarn invasion chapter by chapter. Clearing a stage pays silver and
            experience; energy comes back on its own over time.
          </p>
          <p className={styles.empty}>
            Each chapter drops one relic set, and each stage number drops one slot — so a chapter is
            a farm for something specific rather than a lottery.
          </p>
          <p className={styles.empty}>
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
