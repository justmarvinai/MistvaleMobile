import type { SoundCueDef } from '@mistvale/shared';
import { mediaUrl } from './tracks';
import { renderPatch, xorshift } from '@mistvale/shared';

/**
 * The one thing that makes a noise.
 *
 * Three rules it exists to keep:
 *
 * 1. **Nothing plays before the player has touched the page.** Browsers refuse audio
 *    started without a gesture, and a refused `AudioContext` stays refused — so the
 *    context is created lazily on the first cue and resumed on the first real interaction.
 *    A cue asked for before then is dropped rather than queued: a click the player never
 *    made should not arrive late.
 * 2. **A missing cue is silence, never an error.** Cues are content. A build whose bundle
 *    predates a cue, or an operator who deactivates one, must make the game quieter and
 *    nothing else.
 * 3. **Volume is the player's, and it is one number per bus.** Read from the settings the
 *    server holds, applied at the bus, so changing a slider is heard on the next cue —
 *    and, since C51, on the ones already sounding.
 *
 * C51 gave it the rest of what a game's mixer has: stereo cues, a compressor across the
 * effects so a hit under a fanfare does not clip, a polyphony cap per cue so a burst of
 * ten does not pile into a wall, a nudge of pitch and level per play so five hits are five
 * hits rather than one hit five times — and the **sample path**, which the catalogue had
 * promised since P10c and the mixer had never actually had: a cue with a `sample` used to
 * come back as `null` here, so the drop-in pack the design leaned on would have been a
 * drop-in silence.
 */

export type Bus = SoundCueDef['bus'];

export interface BusLevels {
  music: number;
  sfx: number;
  ui: number;
}

/** A cue that is ready to play: its samples, on its bus. */
interface Ready {
  buffer: AudioBuffer;
  cue: SoundCueDef;
}

/** Fetches a published file's bytes. Injectable so a test can stand in for the network. */
export type SampleLoader = (url: string) => Promise<ArrayBuffer>;

const defaultLoader: SampleLoader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
};

/** How far a variation may nudge, and a seed so the nth play is the same nth play. */
const VARIATION_SEED = 0x2545_f491;

/** Cues rendered per idle slice while warming. Two ticks or one fanfare, either way under a frame. */
const WARM_PER_SLICE = 2;

/** The next idle moment, or the next tick where a browser has no notion of idle. */
function later(fn: () => void): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => unknown })
    .requestIdleCallback;
  if (typeof idle === 'function') idle(fn);
  else setTimeout(fn, 16);
}

/**
 * Web Audio, wrapped thinly enough to be replaceable.
 *
 * Howler is a dependency of this project and does the same job for *samples*; it has no
 * notion of a cue rendered from parameters, and wrapping it to add one would be more code
 * than this.
 */
export class Mixer {
  private context: AudioContext | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private readonly rendered = new Map<string, Ready>();
  /** A decoded recording, a decode in flight, or a file that could not be had. */
  private readonly samples = new Map<string, Ready | 'loading' | 'missing'>();
  private readonly lastPlayed = new Map<string, number>();
  /** What is sounding right now, per cue, oldest first — for the polyphony cap. */
  private readonly sounding = new Map<string, AudioBufferSourceNode[]>();
  private cues: readonly SoundCueDef[] = [];
  private levels: BusLevels = { music: 0.5, sfx: 0.8, ui: 0.8 };
  private unlocked = false;
  private readonly vary = xorshift(VARIATION_SEED);
  private readonly load: SampleLoader;

  constructor(options: { load?: SampleLoader } = {}) {
    this.load = options.load ?? defaultLoader;
  }

  /** Adopts a published catalogue. Anything already rendered from the old one is dropped. */
  setCues(cues: readonly SoundCueDef[]): void {
    this.cues = cues.filter((cue) => cue.active);
    this.rendered.clear();
    this.samples.clear();
  }

  /**
   * The player's sliders. `ui` follows the effects slider until there is a control of its
   * own — one fader nobody asked for is worse than a bus that behaves predictably.
   */
  setLevels(levels: { musicVolume: number; sfxVolume: number }): void {
    this.levels = {
      music: clampVolume(levels.musicVolume),
      sfx: clampVolume(levels.sfxVolume),
      ui: clampVolume(levels.sfxVolume),
    };
    for (const bus of ['sfx', 'ui'] as const) {
      const node = this.buses[bus];
      if (node) node.gain.value = this.levels[bus];
    }
  }

  /**
   * Marks the page as having been interacted with.
   *
   * Called from a real event handler, which is the only place a browser will let an
   * `AudioContext` start. Idempotent, because it is wired to every pointer and key.
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    void this.context?.resume();
  }

  /**
   * Renders or decodes the named cues ahead of their first play, a couple at a time.
   *
   * A render is milliseconds for a tick and a quarter of a second for the Legendary's
   * five seconds of room; neither belongs on the frame a player presses the button, and
   * the whole catalogue at once is two and a half seconds of main thread — which, done in
   * one idle callback, is a hitch on the first gesture of the session. So the keys go on
   * a queue and the queue drains a few per idle slice, first asked first served: the shell
   * queues everything after the first gesture, and a screen with a heavy family queues its
   * own on mount, which moves those to the front.
   */
  warm(keys: readonly string[]): void {
    if (!this.unlocked) return;
    // To the front, in the order asked, ahead of anything already waiting — *moved* there
    // if it was already in the queue, which is the whole point of a screen asking: the
    // shell queued everything, and the Mistgate wants its eight before the other fifty.
    const wanted = new Set(keys);
    const rest = this.queue.filter((key) => !wanted.has(key));
    this.queue.length = 0;
    this.queue.push(...keys, ...rest);
    this.drain();
  }

  private readonly queue: string[] = [];
  private draining = false;

  private drain(): void {
    if (this.draining || this.queue.length === 0) return;
    this.draining = true;
    const step = (): void => {
      const context = this.ensureContext();
      if (!context) {
        this.queue.length = 0;
        this.draining = false;
        return;
      }
      for (let done = 0; done < WARM_PER_SLICE && this.queue.length > 0; done += 1) {
        const key = this.queue.shift()!;
        const cue = this.cues.find((entry) => entry.key === key);
        if (cue) void this.readyFor(cue, context);
      }
      if (this.queue.length > 0) later(step);
      else this.draining = false;
    };
    later(step);
  }

  /** Plays a cue by key. Unknown, inactive, throttled, silent or locked — all no-ops. */
  play(key: string, now = Date.now()): void {
    if (!this.unlocked) return;

    const cue = this.cues.find((entry) => entry.key === key);
    if (!cue) return;
    if (this.levels[cue.bus] <= 0) return;

    if (cue.throttleMs > 0) {
      const previous = this.lastPlayed.get(key) ?? -Infinity;
      if (now - previous < cue.throttleMs) return;
    }
    this.lastPlayed.set(key, now);

    const context = this.ensureContext();
    if (!context) return;

    const ready = this.readyFor(cue, context);
    if (!ready) return;
    this.start(ready, context);
  }

  /** Releases the audio device. Called when the shell tears down. */
  close(): void {
    void this.context?.close();
    this.context = null;
    this.buses = {};
    this.rendered.clear();
    this.samples.clear();
    this.lastPlayed.clear();
    this.sounding.clear();
    this.queue.length = 0;
  }

  // ── Inside ──────────────────────────────────────────────────────────────

  private start(ready: Ready, context: AudioContext): void {
    const { cue } = ready;
    const bus = this.busFor(cue.bus, context);
    if (!bus) return;

    // The oldest copy goes when the cap is reached: ten relics landing in a second is ten
    // presses of the same cue, and the cap is what keeps that from piling into a wall.
    const live = (this.sounding.get(cue.key) ?? []).filter((node) => !isEnded(node));
    while (live.length >= cue.patch.polyphony) {
      const oldest = live.shift();
      try {
        oldest?.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }

    const source = context.createBufferSource();
    source.buffer = ready.buffer;
    source.loop = cue.loop;

    // The nudge. Seeded, so the fourth hit of a session is the same fourth hit next time,
    // and a test can say what it did.
    const { pitchCents, gainDb } = cue.patch.variation;
    const cents = pitchCents > 0 ? this.vary() * pitchCents : 0;
    const db = gainDb > 0 ? this.vary() * gainDb : 0;
    source.playbackRate.value = Math.pow(2, cents / 1200);

    const trim = context.createGain();
    trim.gain.value = Math.pow(10, db / 20);
    source.connect(trim).connect(bus);
    source.start();

    live.push(source);
    this.sounding.set(cue.key, live);
    markEnded(source);
  }

  /** The buffer for a cue — rendered from its patch, or decoded from its recording. */
  private readyFor(cue: SoundCueDef, context: AudioContext): Ready | null {
    // A recording wins wherever one is named. A cue that names one nothing published stays
    // silent rather than falling back to its patch, so a broken path is audible as a
    // missing sound instead of hiding behind a synthesised one.
    if (cue.sample) return this.sampleFor(cue, context);

    const existing = this.rendered.get(cue.key);
    if (existing) return existing;
    if (cue.patch.layers.length === 0) return null;

    const samples = renderPatch(cue.patch, context.sampleRate);
    const buffer = context.createBuffer(2, samples.left.length, context.sampleRate);
    buffer.copyToChannel(samples.left, 0);
    buffer.copyToChannel(samples.right, 1);

    const ready: Ready = { buffer, cue };
    this.rendered.set(cue.key, ready);
    return ready;
  }

  /**
   * A decoded recording, or null while it is still on its way.
   *
   * The first play of a sample cue starts the fetch and is itself silent — a sound that
   * arrives half a second after the press is worse than one that does not arrive — which
   * is what `warm` is for.
   */
  private sampleFor(cue: SoundCueDef, context: AudioContext): Ready | null {
    const state = this.samples.get(cue.key);
    if (state && state !== 'loading' && state !== 'missing') return state;
    if (state) return null;

    const url = mediaUrl(cue.sample);
    if (!url) {
      this.samples.set(cue.key, 'missing');
      return null;
    }
    this.samples.set(cue.key, 'loading');
    void this.load(url)
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        // The catalogue may have moved on while the bytes were in flight.
        if (this.samples.get(cue.key) === 'loading') this.samples.set(cue.key, { buffer, cue });
      })
      .catch(() => {
        this.samples.set(cue.key, 'missing');
      });
    return null;
  }

  /**
   * The bus for a cue: one gain per bus, all into one compressor, into the device.
   *
   * The compressor is the glue. A crit under a victory fanfare is two loud things at
   * once; without it they clip, and clipping is the one sound a synthesised cue must never
   * make, because it is the sound of the prototype this replaced.
   */
  private busFor(bus: Bus, context: AudioContext): GainNode | null {
    if (bus === 'music') return null;
    const existing = this.buses[bus];
    if (existing) return existing;

    const gain = context.createGain();
    gain.gain.value = this.levels[bus];
    const glue =
      typeof context.createDynamicsCompressor === 'function' ? this.glueFor(context) : null;
    gain.connect(glue ?? context.destination);
    this.buses[bus] = gain;
    return gain;
  }

  private glue: DynamicsCompressorNode | null = null;

  private glueFor(context: AudioContext): DynamicsCompressorNode {
    if (this.glue) return this.glue;
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.knee.value = 12;
    glue.ratio.value = 3;
    glue.attack.value = 0.003;
    glue.release.value = 0.16;
    glue.connect(context.destination);
    this.glue = glue;
    return glue;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Constructor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Constructor) return null;

    try {
      this.context = new Constructor();
      void this.context.resume();
      return this.context;
    } catch {
      // A browser that refuses an audio device is a browser that plays a quiet game.
      return null;
    }
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** `ended` is an event rather than a property, so it is remembered on the node itself. */
const ENDED = new WeakSet<AudioBufferSourceNode>();

function markEnded(node: AudioBufferSourceNode): void {
  if (typeof node.addEventListener !== 'function') return;
  node.addEventListener('ended', () => ENDED.add(node), { once: true });
}

function isEnded(node: AudioBufferSourceNode): boolean {
  return ENDED.has(node);
}

/** The instance the game plays through. */
export const mixer = new Mixer();
