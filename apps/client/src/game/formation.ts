import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './stage';

/**
 * Where the two camps stand.
 *
 * Its own module because four things read it and none of them is the scene: the Pixi
 * renderer, the browser-drawn one, the pointable overlay and the damage floaters. A fight
 * has to look like the same fight whichever renderer is running, so the formation is one
 * function they all ask rather than four copies that drift.
 *
 * Everything here is in the 960×540 *virtual* canvas both renderers compose in. That box is
 * then contained in whatever the window gives them, so a change here moves the fight at
 * every size at once.
 */

/**
 * How far apart two slots stand, along the line each camp forms.
 *
 * The number that mattered. It used to be 34, against a visible champion body of about 65
 * virtual pixels — so a full party of four overlapped by roughly two thirds and read as a
 * single heap with several heads. It is only visible on a fight with more than one champion
 * on a side, which is why it survived: a fresh account fights 1-1 alone, and every browser
 * spec in the suite did too.
 *
 * 86 leaves about twenty virtual pixels of clear air between bodies — apart enough to count
 * them, close enough to still read as one party rather than four people who arrived
 * separately.
 */
const STEP = 86;

/** How much each further slot drops toward the viewer, so the line has depth. */
const DEPTH = 30;

/** Where the nearest-to-the-edge slot stands, measured in from its own side. */
const INSET = 132;

/**
 * Where the front rank's feet are.
 *
 * Low, deliberately. The party used to stand at 300 of 540 with nothing below it but floor,
 * so the bottom two fifths of every fight in the game were empty — and on a tall window the
 * champions sat in the upper middle with a HUD along the bottom and a void between. This
 * puts them in the lower half where the eye already is, and still clears the hotbar at every
 * size the suite measures.
 */
const BASE_Y = 344;

/**
 * Where the floor starts — the horizon both renderers draw, and the top of the plate the
 * champions stand on.
 *
 * Here rather than in either renderer because it is the same class of number as `BASE_Y`:
 * the two draw one field and a disagreement about where the ground is would put one camp's
 * feet in the air. It sat as a literal `230` in the scene and as `230 / 540` in the
 * fallback's stylesheet until C28b needed to touch both.
 */
export const HORIZON = 230;

/** The virtual size of a champion's drawn box: 88px of art at ×2. */
export const UNIT_HEIGHT = 176;

/**
 * How wide a unit's *pointable* footprint is.
 *
 * Narrower than the drawn box, which is mostly transparent padding — a hit target the full
 * width of the frame would swallow the neighbour it is standing beside now that they no
 * longer overlap.
 */
export const UNIT_WIDTH = 64;

/**
 * Where a slot sits, staggered so the back rank reads behind the front.
 *
 * Slot 0 is furthest from the middle and furthest back; each slot after it steps toward the
 * enemy and toward the viewer. Enemies mirror exactly, which is what makes a lunge from one
 * side look like the same gesture from the other.
 */
export function slotPosition(side: 'ally' | 'enemy', slot: number): { x: number; y: number } {
  const y = BASE_Y + slot * DEPTH;
  const inset = INSET + slot * STEP;
  return { x: side === 'ally' ? inset : VIRTUAL_WIDTH - inset, y };
}

/** The whole formation, for a test or a measurement. */
export const MAX_SLOTS = 4;

export { VIRTUAL_HEIGHT, VIRTUAL_WIDTH };
