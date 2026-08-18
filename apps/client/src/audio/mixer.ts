import type { SoundCueDef } from '@mistvale/shared';
import { renderVoice } from './synth';

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
 *    server holds, applied at the bus, so changing a slider is heard on the next cue
 *    without anything re-rendering.
 */

export type Bus = SoundCueDef['bus'];

export interface BusLevels {
  music: number;
  sfx: number;
  ui: number;
}

interface Voice {
  buffer: AudioBuffer;
  bus: Bus;
  throttleMs: number;
}

/**
 * Web Audio, wrapped thinly enough to be replaceable.
 *
 * Howler is a dependency of this project and does the same job for *samples*; it has no
 * notion of a cue rendered from parameters, and wrapping it to add one would be more code
 * than this. When the cue catalogue points at real files (USER_QUESTIONS Q4), sample
 * playback belongs here beside the synth path — same `play(key)`, different source.
 */
export class Mixer {
  private context: AudioContext | null = null;
  private readonly rendered = new Map<string, Voice>();
  private readonly lastPlayed = new Map<string, number>();
  private cues: readonly SoundCueDef[] = [];
  private levels: BusLevels = { music: 0.5, sfx: 0.8, ui: 0.8 };
  private unlocked = false;

  /** Adopts a published catalogue. Anything already rendered from the old one is dropped. */
  setCues(cues: readonly SoundCueDef[]): void {
    this.cues = cues.filter((cue) => cue.active);
    this.rendered.clear();
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

    const voice = this.voiceFor(cue, context);
    if (!voice) return;

    const source = context.createBufferSource();
    source.buffer = voice.buffer;
    const gain = context.createGain();
    gain.gain.value = this.levels[voice.bus];
    source.connect(gain).connect(context.destination);
    source.start();
  }

  /** Releases the audio device. Called when the shell tears down. */
  close(): void {
    void this.context?.close();
    this.context = null;
    this.rendered.clear();
    this.lastPlayed.clear();
  }

  /** Rendered once per cue per session; a battle fires the same handful all evening. */
  private voiceFor(cue: SoundCueDef, context: AudioContext): Voice | null {
    const existing = this.rendered.get(cue.key);
    if (existing) return existing;

    // `sample` wins wherever a recording exists — see USER_QUESTIONS Q4. Until a pack is
    // uploaded no cue names one, and a cue that does with nothing behind it stays silent
    // rather than falling back, so a broken asset key is audible as a missing sound
    // instead of hiding behind a beep.
    if (cue.sample) return null;

    const samples = renderVoice(cue.voice, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);

    const voice: Voice = { buffer, bus: cue.bus, throttleMs: cue.throttleMs };
    this.rendered.set(cue.key, voice);
    return voice;
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

/** The instance the game plays through. */
export const mixer = new Mixer();
