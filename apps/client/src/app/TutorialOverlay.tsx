import { useEffect, useState } from 'react';
import { Button } from '@/ui/Button/Button';
import { Prose } from '@/ui/Prose/Prose';
import { Rewards } from '@/ui/Rewards/Rewards';
import { useTutorialStore, currentStep } from '@/state/tutorialStore';
import { useNavStore } from '@/state/navStore';
import { useHighlightRect } from './highlight';
import { goalLabel, waitingLabel } from './tutorialText';
import type { ScreenId } from './screens';
import styles from './TutorialOverlay.module.scss';

/**
 * The Wardenmaster, over the top of everything.
 *
 * Three jobs, and it is worth being strict about which is which:
 *
 * 1. **Say the line.** A parchment card, out of the way of whatever is being pointed at.
 * 2. **Point.** The named element keeps its normal appearance and everything around it is
 *    dimmed — a hole cut in a scrim rather than a badge stuck on the target, so the thing
 *    the player is being sent to looks exactly like itself.
 * 3. **Take the player there.** A step names a screen; if they are somewhere else, the
 *    overlay navigates once. It never navigates *away* from where they went afterwards —
 *    a player who wanders off mid-step is exploring, which is the thing the tutorial is
 *    trying to teach.
 *
 * What it deliberately does **not** do is block input. The cut-out is not a click-through
 * gate: everything outside it stays usable, because a tutorial that traps somebody in a
 * modal until they press the right button is a tutorial nobody remembers fondly. The
 * server is the thing enforcing order — a step closes when its goal is met and not before
 * — so the overlay can afford to be a signpost rather than a fence.
 */
export function TutorialOverlay() {
  const step = useTutorialStore(currentStep);
  const busy = useTutorialStore((state) => state.busy);
  const error = useTutorialStore((state) => state.error);
  const payout = useTutorialStore((state) => state.lastPayout);
  const advance = useTutorialStore((state) => state.advance);
  const skip = useTutorialStore((state) => state.skip);
  const clearPayout = useTutorialStore((state) => state.clearPayout);
  const refresh = useTutorialStore((state) => state.refresh);

  const screen = useNavStore((state) => state.screen);
  const setScreen = useNavStore((state) => state.setScreen);

  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const rect = useHighlightRect(step?.highlight ?? '');

  /**
   * While a step is open and unfinished, ask again every few seconds.
   *
   * The shell re-reads on every screen change, which covers most of the script — but not
   * the steps that are *completed where they are opened*. The cold open is exactly that:
   * the fight starts and finishes on the battle screen, so nothing navigates, so nothing
   * would have told the overlay the step was done, and Continue would stay dark in front
   * of somebody who had just won. A poll bounded to "the tutorial is open and waiting" is
   * a few requests across the first hour and none ever again.
   */
  const waiting = step !== null && !step.ready;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [waiting, refresh]);

  // Take the player to the step's screen the first time it opens, and only then. Keyed on
  // the step number rather than on `screen`, so wandering off does not drag them back.
  const stepNumber = step?.step ?? 0;
  // The payout belongs to the card it is shown on; two steps later it is somebody else's
  // news. Cleared when the step it arrived with is completed.
  useEffect(() => {
    if (stepNumber === 0) return;
    return () => clearPayout();
  }, [stepNumber, clearPayout]);

  const destination = step?.screen as ScreenId | undefined;
  useEffect(() => {
    if (!destination || stepNumber === 0) return;
    setScreen(destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per step
  }, [stepNumber]);

  if (!step) return null;

  const goal = step.goal;
  const target = goal?.target ?? 0;

  return (
    <div className={styles.overlay} role="region" aria-label="Tutorial">
      {/* The dim, cut around whatever is being pointed at. Four panes rather than a
          box-shadow so the hole is genuinely transparent and the target's own colours
          come through unaltered. */}
      {rect ? (
        <>
          <div className={styles.scrim} style={{ inset: `0 0 auto 0`, height: rect.top }} />
          <div
            className={styles.scrim}
            style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className={styles.scrim}
            style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
          />
          <div
            className={styles.scrim}
            style={{
              top: rect.top,
              left: rect.left + rect.width,
              right: 0,
              height: rect.height,
            }}
          />
          <div
            className={styles.ring}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className={styles.scrim} style={{ inset: 0 }} />
      )}

      <div
        className={[styles.card, rect && rect.top > window.innerHeight / 2 ? styles.high : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.speaker}>
          <span className={styles.lantern} aria-hidden="true">
            ✦
          </span>
          <span className={styles.who}>The Wardenmaster</span>
          <span className={styles.count}>
            {step.step} / {step.total}
          </span>
        </div>

        <h2 className={styles.title}>{step.title}</h2>
        <Prose className={styles.body} text={step.body} />

        {goal && (
          <p className={styles.goal}>
            <span className={styles.goalLabel}>{goalLabel(goal.type)}</span>
            {target > 1 && (
              <span className={styles.goalCount}>
                {Math.min(step.progress, target)} / {target}
              </span>
            )}
            {step.ready && <span className={styles.goalDone}>done</span>}
          </p>
        )}

        {/* What the *previous* step paid, carried onto this one's card rather than held
            behind an acknowledge button. The second click was a stage the player could not
            always reach: a step that opens a modal — the starter choice does — puts it on
            top of the parchment, and a reward card nobody can dismiss is worse than one
            nobody was asked to. */}
        {payout && (
          <div className={styles.payout}>
            <span className={styles.payoutLabel}>For the last one</span>
            <Rewards rewards={payout.paid} signed />
            {payout.relics.length > 0 && (
              <span className={styles.payoutRelics}>
                and {payout.relics.length === 1 ? 'a relic' : `${payout.relics.length} relics`}
              </span>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          {confirmingSkip ? (
            <>
              <span className={styles.confirm}>
                Skipping is final — the Wardenmaster does not come back.
              </span>
              <Button variant="ghost" onClick={() => setConfirmingSkip(false)} disabled={busy}>
                Keep going
              </Button>
              <Button variant="danger" onClick={() => void skip()} disabled={busy}>
                Skip anyway
              </Button>
            </>
          ) : (
            <>
              {/* "Skip tutorial", not "Skip": a battle has a Skip of its own for jumping
                  past playback, and the two can be on screen together — during the cold
                  open they always are. */}
              <Button variant="ghost" onClick={() => setConfirmingSkip(true)} disabled={busy}>
                Skip tutorial
              </Button>
              <Button
                variant="primary"
                onClick={() => void advance()}
                disabled={busy || !step.ready}
                title={step.ready ? undefined : 'Finish the step first'}
              >
                {step.ready ? 'Continue' : waitingLabel(step.screen as ScreenId, screen)}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
