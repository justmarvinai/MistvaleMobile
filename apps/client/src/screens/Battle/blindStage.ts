/**
 * Deciding that the battlefield is not being drawn.
 *
 * The worst thing the battle screen can do is show a correct fight over an empty rectangle:
 * the HUD is right, the turn order moves, the health bars move, and the field is black. It
 * has happened twice for unrelated reasons — a release that shipped without the unit art,
 * and a scene that was rebuilt and then never re-synced — and both times the only signal
 * anywhere was a screenshot from the owner. Neither the console, nor the tests, nor the
 * screen itself said a word.
 *
 * So the screen checks its own work and says so. This is the decision on its own, away from
 * React, because a safety net nobody can test is not a safety net.
 */

export interface BattlefieldState {
  /** How many units the fight currently has, from the playback view. */
  units: number;
  /** Whether the shared Pixi application exists at all. */
  hasStage: boolean;
  /** Whether the stage is showing *this* screen's scene rather than something else's. */
  attached: boolean;
  /** How many bodies the scene has actually put on the field. */
  drawn: number;
}

/**
 * Whether to tell the player the battlefield could not be drawn.
 *
 * Only ever true while there is something to draw — a fight between waves, or one that has
 * not started, is legitimately empty and must not raise this. Callers are expected to let a
 * beat pass first: a scene is briefly empty between the board arriving and the first sync,
 * and a notice that flickers on every wave transition would teach everyone to ignore it.
 */
export function battlefieldIsBlind(state: BattlefieldState): boolean {
  if (state.units === 0) return false;
  return !state.hasStage || !state.attached || state.drawn === 0;
}
