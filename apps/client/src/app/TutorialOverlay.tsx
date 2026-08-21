import { useEffect, useState } from 'react';
import { mediaUrl, narration } from '@/audio';
import { Button } from '@/ui/Button/Button';
import { useDraggable } from '@/ui/useDraggable';
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
 * 1. **Say the line** — in text, and in the Wardenmaster's own voice on the twelve steps
 *    that have a recording. A parchment card with his face beside it, out of the way of
 *    whatever is being pointed at, and draggable for when "out of the way" turns out wrong.
 * 2. **Point.** A lantern-light ring around the named element and *nothing else*. It used
 *    to dim everything around it instead — a hole cut in a scrim — which is a good way to
 *    show one small target and a bad way to live on top of a game: half the screen goes
 *    grey, the art the player came for goes with it, and a fight being narrated is watched
 *    through a filter. The owner asked for the highlight without the shadow, and he is
 *    right: a ring that breathes is easier to find on a lit screen than a hole is on a dark
 *    one.
 * 3. **Take the player there.** A step names a screen; if they are somewhere else, the
 *    overlay navigates once. It never navigates *away* from where they went afterwards —
 *    a player who wanders off mid-step is exploring, which is the thing the tutorial is
 *    trying to teach.
 *
 * What it deliberately does **not** do is block input. Nothing here is a gate: everything
 * stays usable, because a tutorial that traps somebody in a modal until they press the
 * right button is a tutorial nobody remembers fondly. The server is the thing enforcing
 * order — a step closes when its goal is met and not before — so the overlay can afford to
 * be a signpost rather than a fence.
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
  const {
    at: cardAt,
    dragging,
    panelRef,
    handleProps,
    resetPosition,
  } = useDraggable('Move the Wardenmaster');

  /**
   * The speaker's face, once we know the file is actually there.
   *
   * A portrait is content pointing at a published image, and content can point at one that
   * has not been drawn yet. A broken-image glyph in the corner of the tutorial card is
   * worse than no portrait at all, so a load failure falls back to the lantern mark the
   * overlay used before there was art. Remembered by URL, so moving to another step re-asks
   * for a *different* face but never re-asks for one already known to be missing.
   */
  const [missingArt, setMissingArt] = useState<string[]>([]);
  const portraitSrc = mediaUrl(step?.portrait ?? '');
  const portrait = portraitSrc && !missingArt.includes(portraitSrc) ? portraitSrc : null;

  /**
   * The line, spoken, while the step it belongs to is open.
   *
   * Keyed on the step number and not on the audio path, so re-reading the tutorial — which
   * the poll below does every three seconds — never restarts a line half-way through. The
   * cleanup is the point of the whole effect: the moment the step closes, whether the player
   * pressed Continue, skipped the script or signed out, the Wardenmaster stops mid-sentence.
   * He is talking *about this step*, and a voice still explaining relics over the top of the
   * next beat is worse than no voice at all.
   *
   * Cut rather than faded, for the same reason. Three of the fifteen steps have no recording
   * and simply stay quiet.
   */
  const line = mediaUrl(step?.sound ?? '');
  useEffect(() => {
    if (!line) return;
    narration.play(line);
    return () => narration.cut();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the step owns the line, not the path
  }, [step?.step]);

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
      {/* The pointer, and nothing else.

          Four dimming panes used to surround this ring, cut around the target so the thing
          being pointed at kept its own colours. That works on a form and fails on a game: it
          greyed out the art, the map and — worst — the fight a step was asking the player to
          win, and it made the tutorial read as a modal while being click-through the whole
          time. What is left is what was doing the work anyway: a lantern-light ring on an
          otherwise untouched screen.

          Only when there is something to point at. A step with no target — the cold open,
          the welcome, or any step whose element is not on the screen the player wandered to
          — simply says its line. */}
      {rect && (
        <div
          className={styles.ring}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      )}

      <div
        ref={panelRef}
        className={[
          styles.card,
          // The stylesheet's own placement only applies until the player has an opinion:
          // once the card has been moved it is positioned outright, and `high` — which lifts
          // it off a target in the bottom half — would fight that.
          cardAt ? styles.placed : rect && rect.top > window.innerHeight / 2 ? styles.high : '',
          dragging ? styles.dragging : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={cardAt ? { left: cardAt.x, top: cardAt.y } : undefined}
      >
        {/* The title row is the grab handle, which is where anybody would try first. It is
            focusable and takes the arrow keys, because a card only a mouse can move is a
            card some players cannot move at all. */}
        <div
          className={styles.speaker}
          {...handleProps}
          onDoubleClick={resetPosition}
          title="Drag to move · arrow keys to nudge · double-click to put it back"
        >
          {portrait ? (
            <img
              className={styles.face}
              src={portrait}
              alt=""
              aria-hidden="true"
              draggable={false}
              onError={() =>
                setMissingArt((seen) => (seen.includes(portrait) ? seen : [...seen, portrait]))
              }
            />
          ) : (
            <span className={styles.lantern} aria-hidden="true">
              ✦
            </span>
          )}
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
