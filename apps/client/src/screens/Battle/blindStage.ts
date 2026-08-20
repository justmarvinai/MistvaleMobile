/**
 * Deciding that the battlefield is not being drawn, and saying why.
 *
 * The worst thing the battle screen can do is show a correct fight over an empty rectangle:
 * the HUD is right, the turn order moves, the health bars move, and the field is black. It
 * has happened three times for unrelated reasons — a release shipped without the unit art, a
 * scene rebuilt and never re-synced, and an application left drawing into a canvas that had
 * been removed from the page — and each time the only signal anywhere was a screenshot from
 * the owner.
 *
 * The first version of this told the player *that* it had happened. That was enough to rule
 * the art out, and not enough to say what had gone wrong instead, which cost another round.
 * So it names the cause now: each branch below is a different thing to go and fix, and the
 * sentence a player reads is the sentence that says which.
 *
 * The decision lives here, away from React, because a safety net nobody can test is not a
 * safety net.
 */

export type BlindReason =
  /** No graphics context: `Application.init` failed, or never resolved. */
  | 'no-context'
  /** The stage exists but is showing somebody else's scene. */
  | 'stage-taken'
  /** Drawing the view threw. */
  | 'draw-failed'
  /** Everything is attached and nothing is on the field. */
  | 'nothing-drawn';

export interface BattlefieldState {
  /** How many units the fight currently has, from the playback view. */
  units: number;
  /** Whether the shared Pixi application exists at all. */
  hasStage: boolean;
  /** Whether the stage is showing *this* screen's scene rather than something else's. */
  attached: boolean;
  /** How many bodies the scene has actually put on the field. */
  drawn: number;
  /** Set when the last attempt to draw the view threw. */
  drawError?: string | null;
}

/**
 * Why the battlefield is blank, or null when it is not.
 *
 * Only ever answers while there is something to draw — a fight between waves, or one that
 * has not started, is legitimately empty and must not raise this. Callers are expected to
 * let a beat pass first: a scene is briefly empty between the board arriving and the first
 * sync, and a notice that flickers on every wave transition would teach everyone to ignore
 * it.
 */
export function blindReason(state: BattlefieldState): BlindReason | null {
  if (state.units === 0) return null;
  if (!state.hasStage) return 'no-context';
  if (state.drawError) return 'draw-failed';
  if (!state.attached) return 'stage-taken';
  if (state.drawn === 0) return 'nothing-drawn';
  return null;
}

/**
 * What to put on screen.
 *
 * Every one of these ends by saying the fight is unaffected, because it is: the outcome,
 * the numbers and the rewards are the server's, and the only thing lost is the picture.
 */
export function blindMessage(reason: BlindReason, detail?: string | null): string {
  const tail = 'The fight itself is unaffected — every number and the result are the server’s.';
  switch (reason) {
    case 'no-context':
      return `The battlefield needs graphics acceleration, and this browser could not start it${
        detail ? ` (${detail})` : ''
      }. Turning on hardware acceleration in your browser's settings should bring it back. ${tail}`;
    case 'draw-failed':
      return `The battlefield could not be drawn${detail ? ` — ${detail}` : ''}. ${tail}`;
    case 'stage-taken':
      return `The battlefield was taken over by another scene. ${tail}`;
    case 'nothing-drawn':
      return `The battlefield is empty — the champions' art did not load. ${tail}`;
  }
}
