import { useEffect, useMemo } from 'react';
import type { EventStanding } from '@mistvale/shared';
import { CountdownTimer } from '@/fui/components/CountdownTimer.ts';
import { Fui } from '@/fui/react';
import { Empty } from '../../ui/Empty/Empty';
import { Ladder, type LadderTier } from '../../ui/Ladder/Ladder';
import { Panel } from '../../ui/Panel/Panel';
import { describeRewards, useRewardName } from '../../ui/Rewards/Rewards';
import { useEventStore } from '../../state/eventStore';
import { toast } from '../../state/uiStore';
import styles from './EventsScreen.module.scss';
import { Heading } from '@/ui/Heading/Heading';

/**
 * What is running right now.
 *
 * Each event is one panel: what earns points, how many you have, and the ladder. The
 * ladder is the screen's spine — a rail of rungs, each a tile you can read (`ui/Ladder`,
 * shared with the Vale Pass since C44) — because the question a player actually has is
 * "how far to the next one", and a list of six rows answers that worse than a row of
 * tiles with the score under each does (docs/UI_UX_DESIGN.md §3, screen 21).
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
  /** The ladder's rungs, one tile per milestone. Every state is the server's flag. */
  const tiers = useMemo<LadderTier[]>(
    () =>
      event.milestones.map((rung) => ({
        index: rung.index,
        points: rung.points,
        reached: rung.reached,
        tiles: [{ rewards: rung.rewards, claimed: rung.claimed, barred: false }],
      })),
    [event.milestones],
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

      {/* The score, then the ladder (C44). The library's rail used to draw both — a bar
          with the rungs on it at the score each is worth — and at 36px a rung was an icon
          with a nine-pixel label; the tiles say what each rung pays at a size that can be
          read, and the score above them says how far along the row you are. A tile marks
          nothing on its own: the server settles a claim and the store re-reads. */}
      <div className={styles.score}>
        <strong>{event.points.toLocaleString()}</strong> points
      </div>
      <Ladder
        rows={[
          {
            key: 'ladder',
            title: 'The ladder',
            subtitle: event.live
              ? today === event.endsOn
                ? 'Last day to score'
                : `Scoring until ${event.endsOn}`
              : `Scoring closed on ${event.endsOn}`,
          },
        ]}
        tiers={tiers}
        scrollKey={`${event.eventKey}:${event.occurrence}`}
        busy={busy !== null}
        label={`${event.name} ladder`}
        onClaim={(_, tier) => {
          const rung = event.milestones.find((entry) => entry.index === tier.index);
          if (rung && rung.reached && !rung.claimed && busy === null) onClaim(rung.index);
        }}
      />
    </Panel>
  );
}
