/**
 * The cue names, re-exported where the client reaches for them.
 *
 * They live in `@mistvale/shared` because they are a contract with the seed rather than a
 * client detail: the game asks for `ui_press`, content decides what that sounds like, and
 * a seed missing one fails a test instead of leaving a button silent.
 */
export { CUE, CUE_KEYS, summonCue, type CueName } from '@mistvale/shared';
