/**
 * The audio that comes out of files rather than out of arithmetic.
 *
 * `mixer.ts` renders cues: a few hundred milliseconds of shaped tone, built once and fired
 * a thousand times. That is the wrong shape for the two things the owner's audio pack
 * brought in —
 *
 * - **music**, which streams for minutes, loops, and is *replaced* rather than layered;
 * - **the Wardenmaster's lines**, which play once, belong to one step of the tutorial, and
 *   must be cut the instant that step closes.
 *
 * Both are one file at a time on their own channel, which an `HTMLAudioElement` does
 * natively and an `AudioContext` graph would only re-implement. So they live here, beside
 * the mixer rather than inside it, sharing its three rules: nothing before the player has
 * touched the page, a missing file is silence, and the volume is the player's.
 *
 * Volume is deliberately the *only* thing that reaches in from outside. A channel that read
 * the settings store itself could not be tested, and would play during a test run nobody
 * asked it to.
 */

/**
 * The URL behind a published media path.
 *
 * Content stores what `pnpm assets` wrote — `audio/music/…`, `portraits/…` — relative to
 * the client's public root, because that is what an operator sees in the tool's own output
 * and retypes into Admin. A leading slash is tolerated rather than rejected: it is the
 * obvious thing to type and it means the same file.
 *
 * Returns null for an empty path, which is how "this step has no recording" arrives.
 */
export function mediaUrl(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Long enough not to be a cut, short enough not to be a wait. */
const FADE_MS = 700;
const FADE_STEP_MS = 50;

/**
 * One file at a time, faded rather than cut.
 *
 * The fade is why this is a class and not four lines: walking out of the Haven into a fight
 * swaps a seven-minute loop for another one, and a hard cut on both ends of that is the
 * single most noticeable thing an audio layer can get wrong.
 */
export class TrackChannel {
  private element: HTMLAudioElement | null = null;
  private fader: ReturnType<typeof setInterval> | null = null;
  /** What was last asked for, so the level and the unlock can act on it later. */
  private wanted: string | null = null;
  private level = 0;
  private unlocked = false;

  constructor(private readonly loop: boolean) {}

  /**
   * Plays `src`, replacing whatever was playing.
   *
   * Asking for what is already playing is a no-op rather than a restart — the shell
   * re-renders for a hundred reasons and none of them should start the music again.
   */
  play(src: string): void {
    if (this.wanted === src) return;
    this.wanted = src;
    this.start();
  }

  /** Silence, faded out. Safe to call when nothing is playing. */
  stop(): void {
    this.wanted = null;
    this.fadeOutAndDrop();
  }

  /**
   * Silence, immediately.
   *
   * What a cancelled narration wants: the step is gone, and a voice fading over the next
   * one for half a second is worse than a cut. Music never uses it.
   */
  cut(): void {
    this.wanted = null;
    this.clearFade();
    this.release(this.element);
    this.element = null;
  }

  /** The player's fader for this channel, 0…1. Zero stops; raising it starts again. */
  setLevel(level: number): void {
    this.level = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
    if (this.level <= 0) {
      // Dropped rather than paused: a muted track that keeps streaming is bandwidth spent
      // on something nobody can hear, and on a phone it is also battery.
      this.clearFade();
      this.release(this.element);
      this.element = null;
      return;
    }
    if (this.element) {
      this.clearFade();
      this.element.volume = this.level;
    } else {
      this.start();
    }
  }

  /**
   * The page has been interacted with, so a browser will now let audio start.
   *
   * Music is the one thing that genuinely wants to begin before any gesture and cannot, so
   * unlike a cue — which is dropped when it arrives early, because a click the player never
   * made should not be heard late — a track asked for early is *remembered* and starts here.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.start();
  }

  /** True while a file is actually attached. For tests and for the shell's own checks. */
  get playing(): boolean {
    return this.element !== null;
  }

  /** What is on the channel right now, or null. */
  get source(): string | null {
    return this.wanted;
  }

  private start(): void {
    if (!this.unlocked || !this.wanted || this.level <= 0) return;
    if (typeof Audio === 'undefined') return;

    const previous = this.element;
    const next = new Audio(this.wanted);
    next.loop = this.loop;
    next.preload = 'auto';
    next.volume = previous ? 0 : this.level;
    // A file that is not there is silence, exactly like a cue that is not defined. Three
    // tutorial steps have no recording on purpose, so this is not a warning.
    next.addEventListener('error', () => {
      if (this.element === next) this.element = null;
    });
    void next.play().catch(() => {
      if (this.element === next) this.element = null;
    });
    this.element = next;

    this.clearFade();
    if (previous) this.crossfade(previous, next);
  }

  /** Down on the old, up on the new, on one timer so they cannot drift apart. */
  private crossfade(from: HTMLAudioElement, to: HTMLAudioElement): void {
    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    let step = 0;
    this.fader = setInterval(() => {
      step += 1;
      const ratio = Math.min(1, step / steps);
      from.volume = this.level * (1 - ratio);
      to.volume = this.level * ratio;
      if (ratio >= 1) {
        this.clearFade();
        this.release(from);
      }
    }, FADE_STEP_MS);
  }

  private fadeOutAndDrop(): void {
    const going = this.element;
    this.element = null;
    this.clearFade();
    if (!going) return;

    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    let step = 0;
    const from = going.volume;
    this.fader = setInterval(() => {
      step += 1;
      const ratio = Math.min(1, step / steps);
      going.volume = from * (1 - ratio);
      if (ratio >= 1) {
        this.clearFade();
        this.release(going);
      }
    }, FADE_STEP_MS);
  }

  private clearFade(): void {
    if (this.fader !== null) clearInterval(this.fader);
    this.fader = null;
  }

  /**
   * Lets an element go.
   *
   * `src = ''` matters: pausing alone leaves the browser holding the connection and the
   * decoded buffer, and a session that walks in and out of twenty fights would accumulate
   * twenty of them — at eight megabytes a track.
   */
  private release(element: HTMLAudioElement | null): void {
    if (!element) return;
    element.pause();
    element.src = '';
  }
}

/** The soundtrack. One loop, swapped when the game moves between the world and a fight. */
export const music = new TrackChannel(true);

/** The Wardenmaster. One line, cut when its step closes. */
export const narration = new TrackChannel(false);
