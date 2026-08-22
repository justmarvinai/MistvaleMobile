import type { BattleSpeed } from '@mistvale/shared';
import { useTip } from '../Tooltip/useTooltip';
import { speedRungs, type SpeedRung } from './speedLadder';
import styles from './SpeedLadder.module.scss';

/**
 * How fast the fight plays, drawn as a ladder rather than a number that cycles.
 *
 * Mistvale's rather than the library's, and for the reason that decides every one of these
 * calls: `BattleControls` draws speed as one button stepping to the next *unlocked* rung,
 * so a rung an account has not earned is not merely unpressable — it is invisible. ×4 and
 * ×6 existed with nothing in the game to say so. A control that cannot express the state
 * React owns is a control React has to own.
 *
 * The library still paints the row it sits in; only its speed button is hidden, which is
 * chrome giving way to behaviour rather than a fork of it.
 */
export function SpeedLadder({
  open,
  current,
  unlocks,
  onPick,
}: {
  open: readonly number[];
  current: number;
  unlocks: Readonly<Record<string, string>>;
  onPick: (speed: BattleSpeed) => void;
}): JSX.Element {
  return (
    <div className={styles.ladder} role="group" aria-label="Battle speed">
      {speedRungs({ open, current, unlocks }).map((rung) => (
        <Rung key={rung.speed} rung={rung} onPick={() => onPick(rung.speed)} />
      ))}
    </div>
  );
}

/** One rung. Its own component so it can carry a tooltip, which is a hook. */
function Rung({ rung, onPick }: { rung: SpeedRung; onPick: () => void }): JSX.Element {
  const locked = rung.state === 'locked';
  const ref = useTip({
    title: `×${rung.speed} speed`,
    ...(locked
      ? {
          subtitle: 'Not yet earned',
          ...(rung.requires ? { requires: [rung.requires] } : {}),
        }
      : { hint: rung.state === 'current' ? 'Playing at this speed' : 'Play at this speed' }),
  });

  return (
    <button
      ref={ref}
      type="button"
      className={styles.rung}
      data-state={rung.state}
      disabled={locked}
      // The lock is the whole point of drawing it, so it is said rather than only shown.
      aria-label={locked ? `×${rung.speed} speed — not yet earned` : `×${rung.speed} speed`}
      aria-pressed={rung.state === 'current'}
      onClick={onPick}
    >
      ×{rung.speed}
    </button>
  );
}
