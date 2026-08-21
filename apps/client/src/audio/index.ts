import { CUE, type CueName } from './cues';
import { mixer } from './mixer';

export { CUE, summonCue, type CueName } from './cues';
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
