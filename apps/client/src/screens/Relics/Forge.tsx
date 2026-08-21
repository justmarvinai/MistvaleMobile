import { useEffect, useRef, useState } from 'react';
import type { GearInstance, GearUpgradeAttempt } from '@mistvale/shared';
import { SegmentedControl } from '@/fui/components/SegmentedControl.ts';
import { Fui } from '@/fui/react';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { gameApi, newActionId } from '../../api/game';
import { usePlayerStore } from '../../state/playerStore';
import { RelicCard } from './RelicCard';
import styles from './Forge.module.scss';
import { highlightable } from '../../app/highlight';
import { statLabel } from '../../ui/statLabels';

/**
 * The upgrade forge.
 *
 * The server resolves the whole run at once and returns every attempt; this plays them
 * back one at a time so a failure lands with the weight it should. That is the same
 * "player piano" split the battle screen uses — the animation is presentation, and the
 * outcome was decided before it started.
 *
 * A bulk run is one request rather than N, which matters on a phone: a dropped response
 * mid-run would otherwise leave the player unsure how much silver they had spent.
 */

const BEAT_MS = 420;

export function Forge({
  relic,
  onClose,
  onChanged,
}: {
  relic: GearInstance;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}): JSX.Element {
  const silver = usePlayerStore((state) => state.player?.silver ?? 0);

  const [current, setCurrent] = useState(relic);
  const [times, setTimes] = useState(1);
  const [queue, setQueue] = useState<GearUpgradeAttempt[]>([]);
  const [shown, setShown] = useState<GearUpgradeAttempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Play the attempts back one beat at a time.
  useEffect(() => {
    if (queue.length === 0) return;
    timer.current = window.setTimeout(() => {
      setShown((seen) => [...seen, queue[0]!]);
      setQueue((rest) => rest.slice(1));
    }, BEAT_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [queue]);

  const playing = queue.length > 0;
  const atMax = current.level >= 16;
  const affordable = silver >= current.upgradeCost;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setShown([]);
    try {
      const result = await gameApi.upgradeGear(current.id, times, newActionId());
      setQueue(result.attempts);
      setCurrent(result.gear);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The forge refused.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="The forge" onClose={playing ? () => undefined : onClose} size="work">
      <div className={styles.body}>
        <RelicCard relic={current} />

        <div className={styles.odds}>
          {atMax ? (
            <span className={styles.maxed}>Fully upgraded.</span>
          ) : (
            <>
              <span>
                Next: <strong>+{current.level + 1}</strong>
              </span>
              <span>
                Chance <strong>{Math.round(current.upgradeChance * 100)}%</strong>
              </span>
              <span className={affordable ? undefined : styles.short}>
                Cost <strong>{current.upgradeCost.toLocaleString()}</strong> silver
              </span>
            </>
          )}
        </div>

        {!atMax && (
          <div className={styles.times}>
            <Fui
              of={SegmentedControl}
              attrs={{ 'aria-label': 'Attempts' }}
              options={{
                value: String(times),
                segments: [1, 5, 10].map((count) => ({
                  value: String(count),
                  label: `×${count}`,
                  disabled: playing || busy,
                })),
              }}
              on={{ 'segment:change': (value) => setTimes(Number(value)) }}
            />
            <span className={styles.hint}>
              A run stops at the first success, or when the silver runs out.
            </span>
          </div>
        )}

        {shown.length > 0 && (
          <ol className={styles.attempts}>
            {shown.map((attempt, index) => (
              <li key={index} data-success={attempt.success}>
                <span className={styles.attemptLevel}>
                  +{attempt.fromLevel} → +{attempt.toLevel}
                </span>
                <span className={styles.attemptResult}>
                  {attempt.success ? 'Held' : 'Failed'}
                  {attempt.rolled && (
                    <span className={styles.rolled}>
                      {' '}
                      {statLabel(attempt.rolled.stat)} +{attempt.rolled.value}
                      {attempt.rolled.percent ? '%' : ''}
                    </span>
                  )}
                </span>
                <span className={styles.attemptCost}>−{attempt.cost.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="ghost" disabled={playing} onClick={onClose}>
            Done
          </Button>
          <Button
            {...highlightable('button:relic-upgrade')}
            disabled={atMax || busy || playing || !affordable}
            onClick={() => void run()}
          >
            {playing ? 'Working…' : atMax ? 'Maxed' : `Attempt ×${times}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
