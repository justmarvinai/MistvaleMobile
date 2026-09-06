import type { SynthLayer, SynthPatch } from '../content/entities';

/**
 * Turning a cue's design into samples (C51).
 *
 * Deliberately arithmetic rather than a graph of `AudioNode`s. A cue rendered once into a
 * buffer and then played costs one allocation however often a battle fires it, and — the
 * reason it is written this way — every stage is a pure function a test can check sample
 * by sample. The mixer owns everything stateful; this owns none of it.
 *
 * What this replaced was one oscillator, one envelope and a one-pole low-pass, and the
 * owner's word for the result was "prototype". What a game sound actually is: several
 * things at once (a click, a thump and a ring), each with its own pitch and envelope; a
 * filter whose corner *moves*, which is where punch comes from; sources that ring the way
 * metal and bells ring rather than the way a tone generator does; and a room. So this is
 * a small synthesiser rather than a beep: nine sources, a one-shot AHDSR, exponential
 * sweeps, a resonant two-pole filter with its own envelope, unison, saturation, and a
 * stereo reverb and echo on the whole cue. Every number in it comes from content.
 *
 * Determinism is kept throughout — noise is a seeded xorshift, never `Math.random` — for
 * the reason everything else in this project is seeded: a cue sounds the same every time
 * it is rendered, and a test can say so.
 */

export interface Rendered {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

/** Nothing a cue can ask for renders longer than this; a fanfare is two seconds. */
export const MAX_SECONDS = 6;

// ── Building blocks ─────────────────────────────────────────────────────────

/** A seeded xorshift32 in [−1, 1). Cheap, even, and the same sequence every render. */
export function xorshift(seed: number): () => number {
  let state = seed >>> 0 || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffff_ffff) * 2 - 1;
  };
}

/** A value between two ends at `progress` ∈ [0, 1], on the named curve. */
export function sweep(from: number, to: number, progress: number, curve: 'linear' | 'exp'): number {
  const p = Math.min(1, Math.max(0, progress));
  if (curve === 'linear' || from <= 0 || to <= 0) return from + (to - from) * p;
  return from * Math.pow(to / from, p);
}

/**
 * The one-shot envelope at `time`, in [0, 1].
 *
 * Up over `attack`, held, down to the `sustain` shelf over `decay`, then out over
 * `release`. The exponential curve is the one a listener hears as natural — a struck
 * thing loses most of its energy first — and the linear one is kept for pads and swells,
 * where a straight ramp reads as a crescendo rather than a fault.
 */
export function ahdsrAt(time: number, amp: SynthLayer['amp']): number {
  if (time < 0) return 0;
  const { attack, hold, decay, sustain, release, curve } = amp;
  if (time < attack) return attack > 0 ? time / attack : 1;
  let t = time - attack;
  if (t < hold) return 1;
  t -= hold;
  if (t < decay) {
    const p = t / decay;
    // From 1 down to the shelf. On the exponential curve the shelf is approached the way
    // a real decay approaches silence: −60 dB at the end of `decay` when the shelf is zero.
    if (curve === 'linear') return 1 - (1 - sustain) * p;
    const floor = Math.max(sustain, 0.001);
    return Math.max(sustain, Math.pow(floor, p));
  }
  t -= decay;
  if (sustain <= 0) return 0;
  if (t < release) {
    const p = t / release;
    if (curve === 'linear') return sustain * (1 - p);
    return sustain * Math.pow(0.001, p);
  }
  return 0;
}

/** How long a layer sounds, from the cue's start. */
export function layerSeconds(layer: SynthLayer): number {
  const { attack, hold, decay, sustain, release } = layer.amp;
  const body = attack + hold + decay + (sustain > 0 ? release : 0);
  const lastEntry = (layer.harmonics.length * layer.staggerMs) / 1000;
  return layer.delayMs / 1000 + body + lastEntry;
}

/** How long a whole cue sounds, including the room's tail. */
export function patchSeconds(patch: SynthPatch): number {
  let longest = 0;
  for (const layer of patch.layers) longest = Math.max(longest, layerSeconds(layer));
  if (patch.space.reverb > 0) longest += patch.space.size + patch.space.predelayMs / 1000;
  if (patch.echo.mix > 0) {
    // Enough repeats for the last one to be 40 dB down.
    const repeats = patch.echo.feedback > 0 ? Math.log(0.01) / Math.log(patch.echo.feedback) : 1;
    longest += (patch.echo.timeMs / 1000) * Math.min(12, Math.max(1, repeats));
  }
  return Math.min(MAX_SECONDS, longest);
}

/**
 * A two-pole filter, the Audio EQ Cookbook's, in transposed direct form II.
 *
 * Coefficients are recomputed as the corner sweeps — every few dozen samples rather than
 * every one, which is inaudible and a fifth of the cost. `q` is the resonance: 0.707 is
 * flat, and past four the corner sings, which on a noise burst is a whistle and on a saw
 * is the classic synth "wow".
 */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  set(type: SynthLayer['filter']['type'], hz: number, q: number, sampleRate: number): void {
    if (type === 'none') {
      this.b0 = 1;
      this.b1 = this.b2 = this.a1 = this.a2 = 0;
      return;
    }
    const corner = Math.min(hz, sampleRate * 0.45);
    const w0 = (2 * Math.PI * corner) / sampleRate;
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    const alpha = sin / (2 * Math.max(0.05, q));
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** Soft saturation. `drive` 0 is a straight wire; 1 is a crunch. Unity at full scale. */
export function saturate(x: number, drive: number): number {
  if (drive <= 0) return x;
  const k = 1 + drive * 9;
  // The normalisation lands a hair over one for anything past full scale; clamp it, because
  // a limiter that lets through 1.00003 is a limiter with an asterisk.
  return Math.min(1, Math.max(-1, Math.tanh(x * k) / Math.tanh(k)));
}

/** Struck metal's partials: inharmonic, and the higher ones die first. */
const METAL_PARTIALS: readonly [ratio: number, weight: number][] = [
  [1, 1],
  [1.4142, 0.72],
  [1.7321, 0.55],
  [2.2361, 0.4],
  [2.6458, 0.3],
];

/** Semitones to a frequency ratio — twelve of them double the pitch. */
export function transpose(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

// ── One layer ───────────────────────────────────────────────────────────────

/** One voice's oscillator state: the phase of the carrier and of whatever modulates it. */
interface Osc {
  phase: number;
  modPhase: number;
  /** Pink noise's three poles. */
  p0: number;
  p1: number;
  p2: number;
}

/**
 * Renders a layer to mono at `sampleRate`, starting at the cue's own zero.
 *
 * The layer's `delayMs` is honoured here as leading silence, so the caller can add the
 * result straight onto the cue's buffer. `seed` keeps two noise layers in one cue from
 * being the same noise.
 */
export function renderLayer(
  layer: SynthLayer,
  sampleRate: number,
  seed = 0x9e37_79b9,
): Float32Array<ArrayBuffer> {
  const total = Math.max(1, Math.ceil(layerSeconds(layer) * sampleRate));
  const out = new Float32Array(new ArrayBuffer(total * Float32Array.BYTES_PER_ELEMENT));

  const random = xorshift(seed);
  const { attack, hold, decay, sustain, release } = layer.amp;
  const body = attack + hold + decay + (sustain > 0 ? release : 0);
  const glide = layer.pitch.glide > 0 ? layer.pitch.glide : body;
  const entries = [0, ...layer.harmonics];
  const stagger = layer.staggerMs / 1000;
  const lead = Math.round((layer.delayMs / 1000) * sampleRate);
  const voices = Math.max(1, layer.unison.voices);
  const filter = new Biquad();
  const filtered = layer.filter.type !== 'none';
  const noisy = layer.source === 'noise' || layer.source === 'pink';

  // Every entry (the root and each harmonic) times every unison voice keeps its own
  // phase, because phase is what a sweep integrates and two copies sharing one would
  // collapse into a single louder copy.
  //
  // The unison voices start *spread* across the cycle rather than all at zero. Started
  // together they are one voice seven times louder for the first few cycles and then
  // beat apart, which is a spike at the onset of every pad in the game; spread, they add
  // the way a section of players adds — never in phase, and never loud by accident.
  const oscs: Osc[][] = entries.map(() =>
    Array.from({ length: voices }, (_, voice) => ({
      phase: voices > 1 ? voice / voices : 0,
      modPhase: 0,
      p0: 0,
      p1: 0,
      p2: 0,
    })),
  );
  const detune = (voice: number): number =>
    voices === 1
      ? 1
      : Math.pow(2, (((voice / (voices - 1)) * 2 - 1) * layer.unison.detuneCents) / 1200);

  const vibrato = layer.pitch.vibratoHz > 0 && layer.pitch.vibratoCents > 0;
  const RECOMPUTE = 32;

  for (let index = lead; index < total; index += 1) {
    const time = (index - lead) / sampleRate;

    if (filtered && (index - lead) % RECOMPUTE === 0) {
      const corner = sweep(
        layer.filter.startHz,
        layer.filter.endHz,
        time / Math.max(body, 1e-6),
        layer.filter.curve,
      );
      filter.set(layer.filter.type, corner, layer.filter.q, sampleRate);
    }

    let mixed = 0;
    for (let entry = 0; entry < entries.length; entry += 1) {
      const local = time - entry * stagger;
      if (local < 0) continue;
      const envelope = ahdsrAt(local, layer.amp);
      if (envelope <= 0) continue;

      if (noisy) {
        // Noise has no pitch, so unison and harmonics mean nothing to it; one voice.
        const osc = oscs[entry]![0]!;
        const white = random();
        let sample = white;
        if (layer.source === 'pink') {
          // Paul Kellet's economy pink filter: three poles, −3 dB an octave near enough.
          osc.p0 = 0.99765 * osc.p0 + white * 0.099046;
          osc.p1 = 0.963 * osc.p1 + white * 0.2965164;
          osc.p2 = 0.57 * osc.p2 + white * 1.0526913;
          sample = (osc.p0 + osc.p1 + osc.p2 + white * 0.1848) * 0.25;
        }
        mixed += sample * envelope;
        continue;
      }

      const semitones = entries[entry] ?? 0;
      let hz = sweep(
        transpose(layer.pitch.startHz, semitones),
        transpose(layer.pitch.endHz, semitones),
        local / glide,
        layer.pitch.curve,
      );
      if (vibrato) {
        hz *= Math.pow(
          2,
          (layer.pitch.vibratoCents / 1200) * Math.sin(2 * Math.PI * layer.pitch.vibratoHz * local),
        );
      }

      let sum = 0;
      const row = oscs[entry]!;
      for (let voice = 0; voice < voices; voice += 1) {
        const osc = row[voice]!;
        const step = (hz * detune(voice)) / sampleRate;
        // Integrating the phase is what keeps a sweep smooth instead of stepping.
        osc.phase = (osc.phase + step) % 1;
        sum += oscillate(layer, osc, step, local);
      }
      mixed += (sum / Math.sqrt(voices)) * envelope;
    }

    // Harmonics share the peak rather than adding to it, so a four-note flourish is not
    // four times louder than a note.
    let sample = mixed / entries.length;
    if (filtered) sample = filter.process(sample);
    sample = saturate(sample, layer.drive);
    out[index] = sample * layer.gain;
  }

  return out;
}

/** One sample of the named source at the oscillator's current phase. */
function oscillate(layer: SynthLayer, osc: Osc, step: number, time: number): number {
  const phase = osc.phase;
  switch (layer.source) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 4 * Math.abs(phase - 0.5) - 1;
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'sawtooth':
      return phase * 2 - 1;
    case 'pulse':
      return phase < Math.min(0.95, Math.max(0.05, layer.shape)) ? 1 : -1;
    case 'fm': {
      // The modulator runs at `shape` times the carrier and its depth follows the
      // envelope, which is what makes an FM bell *ring down* into a sine.
      osc.modPhase = (osc.modPhase + step * layer.shape) % 1;
      const depth = layer.fmIndex * ahdsrAt(time, layer.amp);
      return Math.sin(phase * Math.PI * 2 + depth * Math.sin(osc.modPhase * Math.PI * 2));
    }
    case 'metal': {
      let sum = 0;
      let weight = 0;
      for (const [ratio, amplitude] of METAL_PARTIALS) {
        const spread = 1 + (ratio - 1) * layer.shape;
        // Higher partials of a struck thing die first.
        const fade = Math.exp(-time * (spread - 1) * 2.5);
        sum += Math.sin(phase * spread * Math.PI * 2) * amplitude * fade;
        weight += amplitude;
      }
      return sum / weight;
    }
    case 'noise':
    case 'pink':
      return 0;
  }
}

// ── The room ────────────────────────────────────────────────────────────────

/**
 * A Schroeder reverb: four combs into two all-passes, per channel, with the channels tuned
 * a hair apart so the tail has width.
 *
 * Small, cheap, and enough: what a cue wants from a room is a tail that says "this
 * happened somewhere", not a hall. `size` is roughly the seconds the tail rings for, and
 * `damp` how quickly the top end goes out of it, which is what separates a stone vault
 * from a bathroom.
 */
class Reverb {
  private readonly combs: { buffer: Float32Array; index: number; feedback: number; low: number }[];
  private readonly passes: { buffer: Float32Array; index: number }[];
  private readonly damp: number;

  constructor(sampleRate: number, size: number, damp: number, right: boolean) {
    const offset = right ? 0.0007 : 0;
    this.damp = Math.min(0.95, Math.max(0, damp));
    this.combs = [0.0297, 0.0371, 0.0411, 0.0437].map((seconds) => {
      const length = Math.max(1, Math.round((seconds + offset) * sampleRate));
      // Feedback for a 60 dB decay over `size` seconds, from the comb's own delay.
      const feedback = Math.pow(0.001, (seconds + offset) / Math.max(0.05, size));
      return { buffer: new Float32Array(length), index: 0, feedback, low: 0 };
    });
    this.passes = [0.005, 0.0017].map((seconds) => ({
      buffer: new Float32Array(Math.max(1, Math.round((seconds + offset) * sampleRate))),
      index: 0,
    }));
  }

  process(x: number): number {
    let sum = 0;
    for (const comb of this.combs) {
      const delayed = comb.buffer[comb.index]!;
      // One-pole damping in the feedback path: each pass round the loop loses top end.
      comb.low = delayed * (1 - this.damp) + comb.low * this.damp;
      comb.buffer[comb.index] = x + comb.low * comb.feedback;
      comb.index = (comb.index + 1) % comb.buffer.length;
      sum += delayed;
    }
    let y = sum * 0.25;
    for (const pass of this.passes) {
      const delayed = pass.buffer[pass.index]!;
      const input = y + delayed * 0.5;
      pass.buffer[pass.index] = input;
      pass.index = (pass.index + 1) % pass.buffer.length;
      y = delayed - input * 0.5;
    }
    return y;
  }
}

// ── The whole cue ───────────────────────────────────────────────────────────

/**
 * Renders a cue's patch into stereo samples at `sampleRate`.
 *
 * Layers are summed in place at their own offsets, panned with equal power, run through
 * the echo and the room, scaled by the cue's master and guarded against clipping. The
 * guard is a limiter and not a normaliser: a cue's level is authored, and a stage that
 * quietly made every cue the same loudness would make a whisper and a fanfare the same
 * thing.
 */
export function renderPatch(patch: SynthPatch, sampleRate: number): Rendered {
  const seconds = patchSeconds(patch);
  const total = Math.max(1, Math.ceil(seconds * sampleRate));
  const left = new Float32Array(new ArrayBuffer(total * Float32Array.BYTES_PER_ELEMENT));
  const right = new Float32Array(new ArrayBuffer(total * Float32Array.BYTES_PER_ELEMENT));

  patch.layers.forEach((layer, index) => {
    const mono = renderLayer(layer, sampleRate, 0x9e37_79b9 ^ Math.imul(index + 1, 0x85eb_ca6b));
    const angle = ((layer.pan + 1) / 2) * (Math.PI / 2);
    const gainL = Math.cos(angle);
    const gainR = Math.sin(angle);
    const count = Math.min(mono.length, total);
    for (let i = 0; i < count; i += 1) {
      const s = mono[i]!;
      left[i] = left[i]! + s * gainL;
      right[i] = right[i]! + s * gainR;
    }
  });

  if (patch.echo.mix > 0) {
    const delay = Math.max(1, Math.round((patch.echo.timeMs / 1000) * sampleRate));
    for (const channel of [left, right]) {
      const line = new Float32Array(delay);
      let at = 0;
      for (let i = 0; i < total; i += 1) {
        const delayed = line[at]!;
        line[at] = channel[i]! + delayed * patch.echo.feedback;
        at = (at + 1) % delay;
        channel[i] = channel[i]! + delayed * patch.echo.mix;
      }
    }
  }

  if (patch.space.reverb > 0) {
    const predelay = Math.round((patch.space.predelayMs / 1000) * sampleRate);
    const wet = patch.space.reverb;
    const dry = 1 - wet * 0.5;
    for (const [channel, isRight] of [
      [left, false],
      [right, true],
    ] as const) {
      const room = new Reverb(sampleRate, patch.space.size, patch.space.damp, isRight);
      const source = Float32Array.from(channel);
      for (let i = 0; i < total; i += 1) {
        const fed = i - predelay >= 0 ? source[i - predelay]! : 0;
        channel[i] = source[i]! * dry + room.process(fed) * wet;
      }
    }
  }

  // Master, then the guard.
  let peak = 0;
  for (let i = 0; i < total; i += 1) {
    left[i] = left[i]! * patch.master;
    right[i] = right[i]! * patch.master;
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  if (peak > 0.98) {
    const scale = 0.98 / peak;
    for (let i = 0; i < total; i += 1) {
      left[i] = left[i]! * scale;
      right[i] = right[i]! * scale;
    }
  }

  return { left, right, sampleRate };
}

/** The loudest sample in a render, for tests and for the seed's own guards. */
export function peakOf(rendered: Rendered): number {
  let peak = 0;
  for (let i = 0; i < rendered.left.length; i += 1) {
    peak = Math.max(peak, Math.abs(rendered.left[i]!), Math.abs(rendered.right[i]!));
  }
  return peak;
}
