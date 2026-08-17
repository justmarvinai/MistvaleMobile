import { useEffect } from 'react';
import type { EventStanding } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Button } from '../../ui/Button/Button';
import { Rewards, describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useEventStore } from '../../state/eventStore';
import { toast } from '../../state/uiStore';
import styles from './EventsScreen.module.scss';

/**
 * What is running right now.
 *
 * Each event is one panel: what earns points, how many you have, and the ladder. The
 * ladder is the screen's spine — a horizontal track with the rungs on it — because the
 * question a player actually has is "how far to the next one", and a list of six rows
 * answers that worse than a bar does (docs/UI_UX_DESIGN.md §3, screen 21).
 *
 * An event that has ended but still owes a milestone stays on the page, marked closed.
 * Hiding it would be quietly taking back something the player earned.
 */
export function EventsScreen(): JSX.Element {
  const events = useEventStore((state) => state.events);
  const loading = useEventStore((state) => state.loading);
  const busy = useEventStore((state) => state.busy);
  const error = useEventStore((state) => state.error);
  const load = useEventStore((state) => state.load);
  const claim = useEventStore((state) => state.claim);
  const lastPaid = useEventStore((state) => state.lastPaid);
  const clearPaid = useEventStore((state) => state.clearPaid);
  const rewardName = useRewardName();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastPaid) return;
    const line = describeRewards(lastPaid, rewardName);
    if (line) toast.success(`Claimed — ${line}.`);
    clearPaid();
  }, [lastPaid, clearPaid, rewardName]);

  return (
    <div className={styles.screen}>
      {error && <p className={styles.error}>{error}</p>}

      {loading && !events ? (
        <p className={styles.empty}>Looking at what is running…</p>
      ) : (events?.events.length ?? 0) === 0 ? (
        <p className={styles.empty}>
          Nothing is running just now. Events come and go — the Vale will stir again.
        </p>
      ) : (
        events?.events.map((event) => (
          <EventPanel
            key={`${event.eventKey}:${event.occurrence}`}
            event={event}
            today={events.today}
            busy={busy}
            onClaim={(milestone) => void claim(event.eventKey, milestone)}
          />
        ))
      )}
    </div>
  );
}

function EventPanel({
  event,
  today,
  busy,
  onClaim,
}: {
  event: EventStanding;
  today: string;
  busy: string | null;
  onClaim: (milestone: number) => void;
}): JSX.Element {
  const top = event.milestones.at(-1)?.points ?? 1;
  const filled = Math.min(100, (event.points / top) * 100);

  return (
    <Panel
      variant="hero"
      title={event.name}
      actions={
        <span className={event.live ? styles.live : styles.closed}>
          {event.live ? `Until ${event.endsOn}` : `Closed — collect by ${event.claimsCloseOn}`}
        </span>
      }
    >
      <p className={styles.blurb}>{event.description}</p>

      <div className={styles.rules}>
        {event.rules.map((rule, index) => (
          <span key={index} className={styles.rule}>
            <span className={styles.rulePoints}>{rule.points.toLocaleString()}</span>
            {rule.label}
          </span>
        ))}
      </div>

      <div className={styles.score}>
        <span className={styles.scoreValue}>{event.points.toLocaleString()}</span>
        <span className={styles.scoreLabel}>points</span>
        {!event.live && <span className={styles.scoreNote}>Scoring closed on {event.endsOn}</span>}
        {event.live && today === event.endsOn && <span className={styles.scoreNote}>Last day</span>}
      </div>

      {/* The track: one bar with the rungs sitting on it, so "how far to the next" is a
          distance rather than a subtraction the player has to do. */}
      <div className={styles.track}>
        <div className={styles.trackBar}>
          <span className={styles.trackFill} style={{ width: `${filled}%` }} />
        </div>
        <ol className={styles.rungs}>
          {event.milestones.map((rung) => {
            const ready = rung.reached && !rung.claimed;
            return (
              <li
                key={rung.index}
                className={[
                  styles.rung,
                  rung.claimed ? styles.rungDone : '',
                  ready ? styles.rungReady : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.rungPoints}>{rung.points.toLocaleString()}</span>
                <Rewards rewards={rung.rewards} signed />
                <Button
                  size="sm"
                  variant={ready ? 'primary' : 'ghost'}
                  disabled={!ready || busy !== null}
                  onClick={() => onClaim(rung.index)}
                >
                  {rung.claimed
                    ? 'Claimed'
                    : busy === `${event.eventKey}:${rung.index}`
                      ? 'Claiming…'
                      : ready
                        ? 'Claim'
                        : 'Locked'}
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
