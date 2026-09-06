import { CUE, type CueName } from './cues';
import { mixer } from './mixer';

export { CUE, castCue, hitCue, relicCue, summonCue, type CueName } from './cues';
export { mixer, type Bus } from './mixer';
export { mediaUrl, music, narration } from './tracks';

/**
 * Make a noise.
 *
 * The whole surface anything outside this folder needs. Never throws, never awaits, and
 * does nothing at all until the player has interacted with the page — see `mixer.ts` for
 * why that is a rule rather than an accident.
 */
export function playCue(cue: CueName): void {
  mixer.play(cue);
}

/** Convenience for the commonest one, so a button handler is one word. */
export function playPress(): void {
  mixer.play(CUE.press);
}

/**
 * Asks for a family of cues to be rendered ahead of time.
 *
 * The shell warms the whole catalogue after the first gesture; a screen whose sounds are
 * the heavy ones — the Mistgate's five seconds of legendary, a fight's opening drum —
 * calls this on mount so its family goes to the front of the queue.
 */
export function warmCues(cues: readonly CueName[]): void {
  mixer.warm(cues);
}

/** The Mistgate's family, in the order a pull hears them. */
export const SUMMON_CUES: readonly CueName[] = [
  CUE.summonCharge,
  CUE.summonTease,
  CUE.summonBurst,
  CUE.summonDeal,
  CUE.summonCommon,
  CUE.summonRare,
  CUE.summonEpic,
  CUE.summonLegendary,
];

/** What a fight fires in its first seconds. */
export const BATTLE_CUES: readonly CueName[] = [
  CUE.battleStart,
  CUE.cast,
  CUE.castEmber,
  CUE.castTide,
  CUE.castVerdant,
  CUE.castMist,
  CUE.hit,
  CUE.hitStrong,
  CUE.hitWeak,
  CUE.crit,
  CUE.block,
  CUE.heal,
  CUE.shield,
  CUE.buff,
  CUE.debuff,
  CUE.death,
  CUE.wave,
  CUE.turn,
  CUE.victory,
  CUE.defeat,
];
