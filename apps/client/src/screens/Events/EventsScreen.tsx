import { useEffect, useMemo } from 'react';
import type { EventStanding } from '@mistvale/shared';
import { CountdownTimer } from '@/fui/components/CountdownTimer.ts';
import { RewardTrack } from '@/fui/components/RewardTrack.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Panel } from '../../ui/Panel/Panel';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { rewardArt } from '../../ui/Rewards/art';
import { useEventStore } from '../../state/eventStore';
import { toast } from '../../state/uiStore';
import styles from './EventsScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';

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
      <Heading tagline="What is running now, what it pays, and how long it lasts.">Events</Heading>

      {error && <p className={styles.error}>{error}</p>}

      {loading && !events ? (
        <p className={styles.empty}>Looking at what is running…</p>
      ) : (events?.events.length ?? 0) === 0 ? (
        <Empty
          glyph="glyph-hourglass"
          title="Nothing is running"
          message="Events come and go — the Vale will stir again."
        />
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
  const rewardName = useRewardName();

  /** The ladder's rungs, as the library's rail draws them. */
  const nodes = useMemo(
    () =>
      event.milestones.map((rung) => {
        const rewards = Object.entries(rung.rewards).filter(([, amount]) => amount > 0);
        const first = rewards[0];
        return {
          at: rung.points,
          icon: first ? rewardArt(first[0]) : 'rune-bronze-disc',
          label: describeRewards(rung.rewards, rewardName),
          ...(first && first[1] > 1 ? { qty: first[1] } : {}),
          ...(rung.claimed ? { claimed: true } : {}),
        };
      }),
    [event.milestones, rewardName],
  );

  return (
    <Panel
      variant="hero"
      title={event.name}
      actions={
        event.live ? (
          // The server's own end-of-day, anchored — a tab left open overnight stays right.
          <Fui
            key={event.endsOn}
            of={CountdownTimer}
            className={styles.live}
            options={{
              endsAt: new Date(`${event.endsOn}T23:59:59Z`).getTime(),
              label: today === event.endsOn ? 'Last day' : 'Ends',
              glyph: 'glyph-hourglass',
              variant: 'chip',
              doneText: 'Scoring closed',
            }}
          />
        ) : (
          <span className={styles.closed}>Closed — collect by {event.claimsCloseOn}</span>
        )
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

      {/* The ladder is the screen's spine, and the library's rail is exactly it: one line
          with the rungs sitting on it at the score each is worth, so "how far to the next"
          is a distance rather than a subtraction the player has to do.

          Keyed on the milestones *and* on whether a claim is in flight. The rail ticks a
          node the moment it is pressed, which is the one thing this game does not do —
          the server settles a claim — and remounting on `busy` puts the node back where
          the server has it until the server says otherwise. */}
      <Fui
        key={`${event.milestones.map((rung) => `${rung.claimed}`).join('')}|${busy ?? ''}`}
        of={RewardTrack}
        className={styles.track}
        options={{
          nodes,
          progress: event.points,
          unit: 'points',
          subtitle: event.live
            ? today === event.endsOn
              ? 'Last day to score'
              : `Scoring until ${event.endsOn}`
            : `Scoring closed on ${event.endsOn}`,
          title: 'The ladder',
        }}
        on={{
          'track:claim': (node: { at: number }) => {
            const rung = event.milestones.find((entry) => entry.points === node.at);
            if (rung && rung.reached && !rung.claimed && busy === null) onClaim(rung.index);
          },
        }}
      />
    </Panel>
  );
}
