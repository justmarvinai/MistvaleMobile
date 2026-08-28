import type { XpBoostState } from '@mistvale/shared';
import { useClockMs } from '@/ui/useClock';
import { useContentStore } from '@/state/contentStore';
import { useTip } from '@/ui/Tooltip/useTooltip';
import { boostReading } from './boost';
import styles from './BoostBadge.module.scss';

/**
 * The XP-boost badge on the player frame.
 *
 * The owner's reference (2026-08-28) is the small lit tile this genre puts under the
 * player's name: bright while the boost runs, grey while it does not. Both states are on
 * screen on purpose — a badge that only appeared when active would teach nobody that the
 * boost exists, and "what is that grey square" is a question with an answer one hover away.
 *
 * It counts down against the shared clock rather than one of its own, so the countdown and
 * the energy bar beside it never disagree about the instant. What the boost is *worth*
 * comes from the content bundle, which is the same `progression.xpBoostMultiplier` the
 * server pays by — so the badge cannot promise a percentage the payout does not honour.
 */
export function BoostBadge({ boost }: { boost: XpBoostState | undefined }): JSX.Element {
  const now = useClockMs();
  const multiplier = useContentStore((state) =>
    state.config('progression.xpBoostMultiplier', 1.25),
  );
  const reading = boostReading(boost, now);
  const percent = Math.round((Math.max(1, multiplier) - 1) * 100);

  const ref = useTip({
    title: 'XP Boost',
    subtitle: reading.active ? 'Running' : 'Not running',
    stats: [
      {
        label: 'Champion XP',
        value: `+${percent}%`,
        tone: reading.active ? ('good' as const) : ('plain' as const),
      },
      ...(reading.countdown
        ? [{ label: 'Time left', value: reading.countdown, tone: 'good' as const }]
        : []),
    ],
    flavor: reading.active
      ? 'Every fight that pays champion experience pays more of it while this runs.'
      : 'Won from errands, the Path, events and the calendar. It runs on the clock, so spend it on a long evening.',
  });

  return (
    <span
      ref={ref}
      className={styles.badge}
      data-active={reading.active}
      // One element, one sentence. The countdown is inside the accessible name rather than
      // beside it, so a screen reader is told the state and the time in one go instead of
      // reading "XP" and then a bare "2h 14m" with nothing to attach it to.
      role="img"
      aria-label={
        reading.active
          ? `XP boost running, +${percent}% champion experience, ${reading.countdown} left`
          : 'XP boost not running'
      }
    >
      <span className={styles.mark} aria-hidden="true">
        XP
      </span>
      {reading.countdown && (
        <span className={styles.clock} aria-hidden="true">
          {reading.countdown}
        </span>
      )}
    </span>
  );
}
