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
 * Chapters in order, each with its stages at the chosen difficulty. Everything shown is
 * read from the published content bundle, so adding chapter 4 in Admin puts it here with
 * no client change (CLAUDE.md — content is data).
 */

const DIFFICULTIES: Difficulty[] = ['normal', 'hard', 'brutal'];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
};

export function CampaignScreen(): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const standings = useProgressStore((state) => state.stages);
  const parentStars = useProgressStore((state) => state.parentStars);
  const loadProgress = useProgressStore((state) => state.load);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
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

  if (!bundle) {
    return (
      <Panel>
        <p className={styles.empty}>Loading the vale…</p>
      </Panel>
    );
  }

  return (
    <div className={styles.screen}>
      <div>
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
            return (
              <section key={chapter.key} className={styles.chapter}>
                <header className={styles.chapterHead}>
                  <span className={styles.chapterName}>
                    {chapter.number}. {chapter.name}
                  </span>
                  <span className={styles.chapterRegion}>
                    {chapter.region}
                    {(parentStars[chapter.key] ?? 0) > 0 && (
                      <span className={styles.chapterStars}> ★ {parentStars[chapter.key]}</span>
                    )}
                  </span>
                </header>

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
                      const open = standing?.open ?? true;
                      const stars = standing?.stars ?? 0;

                      return (
                        <button
                          key={stage.key}
                          type="button"
                          className={styles.stage}
                          disabled={!open}
                          data-cleared={stars > 0 ? 'true' : undefined}
                          onClick={() => setChosen(stage)}
                          title={
                            !open
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
                            <span className={styles.stageStars} aria-label={`${stars} of 3 stars`}>
                              {'★'.repeat(stars)}
                              {'☆'.repeat(3 - stars)}
                            </span>
                          </span>
                          {open ? (
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
        </Panel>
      </aside>

      {chosen && <TeamSelect stage={chosen} onClose={() => setChosen(null)} />}
    </div>
  );
}
