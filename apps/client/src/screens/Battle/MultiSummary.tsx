import { useMemo } from 'react';
import type { MultiBattleResult, MultiBattleStopReason } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import styles from './MultiSummary.module.scss';

/**
 * What a batch of runs paid.
 *
 * A batch has no playback — that is the whole reason to press the button — so the summary
 * is the entire experience of it, and it has to answer three things at a glance: how many
 * ran, what they paid, and why it was not more (docs/UI_UX_DESIGN.md §3, screen 7).
 *
 * Every number is the server's. The client adds nothing up, here least of all: a total
 * the player could recompute from a per-run list would be two sources for one truth.
 */

const STOP_TEXT: Record<MultiBattleStopReason, string> = {
  defeated: 'Stopped early — a run was lost. The rest of the batch was kept.',
  outOfEnergy: 'Stopped early — that was all the energy would cover.',
  dailyCap: "Stopped early — that was the last of today's allowance.",
  perCallLimit: 'Stopped early — one press can only run so many.',
};

const OUTCOME_MARK: Record<string, string> = {
  victory: '✦',
  defeat: '✕',
  turnLimit: '◷',
};

export function MultiSummary({
  result,
  onClose,
}: {
  result: MultiBattleResult;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const itemNames = useMemo(
    () => new Map((bundle?.items ?? []).map((item) => [item.key, item.name])),
    [bundle],
  );
  const losses = result.runs.length - result.wins;

  return (
    <Modal open title={`${result.runs.length} runs`} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.tally}>
          <span className={styles.wins}>{result.wins} won</span>
          {losses > 0 && <span className={styles.losses}> · {losses} lost</span>}
        </p>

        {result.stoppedReason && (
          <p className={styles.stopped}>{STOP_TEXT[result.stoppedReason]}</p>
        )}

        <ol className={styles.runs}>
          {result.runs.map((run, index) => (
            <li key={index} className={styles.run} data-outcome={run.outcome}>
              <span className={styles.runIndex}>{index + 1}</span>
              <span className={styles.runMark} aria-label={run.outcome}>
                {OUTCOME_MARK[run.outcome] ?? '✕'}
              </span>
              <span className={styles.runStars}>
                {'★'.repeat(run.stars)}
                {'☆'.repeat(Math.max(0, 3 - run.stars))}
              </span>
              <span className={styles.runTurns}>{run.turns} turns</span>
              <span className={styles.runSilver}>{run.silver}</span>
            </li>
          ))}
        </ol>

        <div className={styles.totals}>
          <div className={styles.row}>
            <span className={styles.label}>Silver</span>
            <span>{result.silver}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Experience</span>
            <span>{result.playerXp}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Champion experience</span>
            <span>{result.championXp}</span>
          </div>
          {result.levelsGained > 0 && (
            <div className={styles.row}>
              <span className={styles.label}>Levels gained</span>
              <span className={styles.bonus}>{result.levelsGained}</span>
            </div>
          )}
          {result.gear.length > 0 && (
            <div className={styles.row}>
              <span className={styles.label}>Relics found</span>
              <span className={styles.bonus}>{result.gear.length}</span>
            </div>
          )}
          {Object.entries(result.items).map(([key, quantity]) => (
            <div key={key} className={styles.row}>
              <span className={styles.label}>{itemNames.get(key) ?? key}</span>
              <span className={styles.bonus}>{quantity}</span>
            </div>
          ))}
        </div>

        <p className={styles.remaining}>
          {result.energySpent} energy spent · {result.energyLeft} left · {result.runsLeftToday} runs
          left today
        </p>

        <div className={styles.actions}>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
