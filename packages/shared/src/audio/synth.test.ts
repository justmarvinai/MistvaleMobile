import { describe, expect, it } from 'vitest';
import {
  synthLayerSchema,
  synthPatchSchema,
  type SynthLayer,
  type SynthPatch,
} from '../content/entities';
import {
  Biquad,
  MAX_SECONDS,
  ahdsrAt,
  layerSeconds,
  patchSeconds,
  peakOf,
  renderLayer,
  renderPatch,
  saturate,
  sweep,
  transpose,
  xorshift,
} from './synth';

/**
 * The synth, checked as the arithmetic it is.
 *
 * Rendering a cue into a buffer rather than building a node graph is what makes this
 * testable at all: no `AudioContext`, no timing, no browser — a design goes in and samples
 * come out, and a change in how the game sounds shows up here as a number rather than as
 * somebody noticing on a Tuesday. Each stage is checked for the one property that makes it
 * the stage it is: a low-pass passes low and stops high, a reverb rings after the source
 * has stopped, an echo repeats at the time it was given, a limiter never lets a hot cue clip.
 */

const RATE = 48_000;

const layer = (over: Parameters<typeof synthLayerSchema.parse>[0] = {}): SynthLayer =>
  synthLayerSchema.parse(over);
const patch = (over: Parameters<typeof synthPatchSchema.parse>[0] = {}): SynthPatch =>
  synthPatchSchema.parse(over);

/** Roughly how many times a signal crosses zero going up, which is its frequency times its length. */
function risingCrossings(x: Float32Array, from = 0, to = x.length): number {
  let count = 0;
  for (let i = Math.max(1, from); i < to; i += 1) if (x[i - 1]! < 0 && x[i]! >= 0) count += 1;
  return count;
}

function rms(x: Float32Array, from = 0, to = x.length): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
}

describe('xorshift', () => {
  it('is the same sequence for the same seed and a different one for another', () => {
    const a = xorshift(7);
    const b = xorshift(7);
    const c = xorshift(8);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(first);
  });

  it('stays inside [−1, 1) and is not stuck', () => {
    const next = xorshift(0);
    const values = Array.from({ length: 1000 }, () => next());
    expect(Math.max(...values)).toBeLessThan(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(new Set(values.map((v) => v.toFixed(4))).size).toBeGreaterThan(900);
  });
});

describe('sweep', () => {
  it('is halfway on the line and at the geometric mean on the curve', () => {
    expect(sweep(100, 300, 0.5, 'linear')).toBe(200);
    expect(sweep(100, 400, 0.5, 'exp')).toBeCloseTo(200, 6);
  });

  it('clamps progress to the ends', () => {
    expect(sweep(100, 300, -1, 'exp')).toBe(100);
    expect(sweep(100, 300, 2, 'exp')).toBeCloseTo(300, 6);
  });
});

describe('ahdsrAt', () => {
  const amp = {
    attack: 0.01,
    hold: 0.02,
    decay: 0.1,
    sustain: 0,
    release: 0.05,
    curve: 'exp' as const,
  };

  it('is silent before the start, ramps through the attack and holds at the top', () => {
    expect(ahdsrAt(-0.001, amp)).toBe(0);
    expect(ahdsrAt(0.005, amp)).toBeCloseTo(0.5, 6);
    expect(ahdsrAt(0.02, amp)).toBe(1);
  });

  it('decays to sixty decibels down by the end of the decay when there is no shelf', () => {
    expect(ahdsrAt(0.01 + 0.02 + 0.1, amp)).toBeLessThanOrEqual(0.0011);
    expect(ahdsrAt(0.01 + 0.02 + 0.05, amp)).toBeGreaterThan(0.02);
    expect(ahdsrAt(1, amp)).toBe(0);
  });

  it('rests on the shelf and then releases from it', () => {
    const held = { ...amp, sustain: 0.4 };
    expect(ahdsrAt(0.01 + 0.02 + 0.1, held)).toBeCloseTo(0.4, 2);
    expect(ahdsrAt(0.01 + 0.02 + 0.1 + 0.025, held)).toBeLessThan(0.4);
    expect(ahdsrAt(0.01 + 0.02 + 0.1 + 0.05, held)).toBeLessThanOrEqual(0.0005);
  });

  it('falls in a straight line on the linear curve', () => {
    const line = { ...amp, curve: 'linear' as const };
    expect(ahdsrAt(0.01 + 0.02 + 0.05, line)).toBeCloseTo(0.5, 6);
  });
});

describe('how long a cue lasts', () => {
  it('adds the delay, the envelope and the harmonics’ entries', () => {
    const one = layer({
      amp: { attack: 0.01, decay: 0.2 },
      delayMs: 100,
      harmonics: [7, 12],
      staggerMs: 50,
    });
    expect(layerSeconds(one)).toBeCloseTo(0.1 + 0.21 + 0.1, 6);
  });

  it('counts the release only when there is a shelf to release from', () => {
    const shelf = layer({ amp: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 } });
    const none = layer({ amp: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.3 } });
    expect(layerSeconds(shelf)).toBeCloseTo(0.51, 6);
    expect(layerSeconds(none)).toBeCloseTo(0.21, 6);
  });

  it('lets the room and the echo ring on past the last layer, up to a ceiling', () => {
    const dry = patch({ layers: [{ amp: { decay: 0.2 } }] });
    const wet = patch({
      layers: [{ amp: { decay: 0.2 } }],
      space: { reverb: 0.3, size: 1.5, predelayMs: 20 },
    });
    expect(patchSeconds(wet)).toBeCloseTo(patchSeconds(dry) + 1.52, 6);
    const echoing = patch({
      layers: [{ amp: { decay: 0.2 } }],
      echo: { mix: 0.5, timeMs: 200, feedback: 0.5 },
    });
    expect(patchSeconds(echoing)).toBeGreaterThan(patchSeconds(dry) + 1);
    const absurd = patch({
      layers: [{ amp: { decay: 4, sustain: 0.5, release: 4 } }],
      space: { reverb: 1, size: 4 },
    });
    expect(patchSeconds(absurd)).toBe(MAX_SECONDS);
  });
});

describe('the filter', () => {
  /** Runs a steady sine through a filter and reports how much of it came out. */
  const passes = (
    type: SynthLayer['filter']['type'],
    corner: number,
    q: number,
    hz: number,
  ): number => {
    const filter = new Biquad();
    filter.set(type, corner, q, RATE);
    const out = new Float32Array(RATE / 4);
    for (let i = 0; i < out.length; i += 1)
      out[i] = filter.process(Math.sin((2 * Math.PI * hz * i) / RATE));
    // Skip the first fifth so the filter has settled.
    return rms(out, out.length / 5) / Math.SQRT1_2;
  };

  it('is a straight wire when there is none', () => {
    expect(passes('none', 1000, 0.7, 440)).toBeCloseTo(1, 2);
  });

  it('low-pass lets the low through and stops the high', () => {
    expect(passes('lowpass', 1000, 0.7, 100)).toBeGreaterThan(0.95);
    expect(passes('lowpass', 1000, 0.7, 8000)).toBeLessThan(0.05);
  });

  it('high-pass is the mirror', () => {
    expect(passes('highpass', 1000, 0.7, 8000)).toBeGreaterThan(0.95);
    expect(passes('highpass', 1000, 0.7, 100)).toBeLessThan(0.05);
  });

  it('band-pass is loudest at its centre and quiet either side', () => {
    const centre = passes('bandpass', 1000, 4, 1000);
    expect(centre).toBeGreaterThan(passes('bandpass', 1000, 4, 200) * 4);
    expect(centre).toBeGreaterThan(passes('bandpass', 1000, 4, 5000) * 4);
  });

  it('sings at the corner when the resonance is up', () => {
    expect(passes('lowpass', 1000, 8, 1000)).toBeGreaterThan(
      passes('lowpass', 1000, 0.7, 1000) * 3,
    );
  });
});

describe('saturate', () => {
  it('is a straight wire at zero and bounded, monotone and unity at full scale otherwise', () => {
    expect(saturate(0.3, 0)).toBe(0.3);
    expect(saturate(1, 1)).toBeCloseTo(1, 6);
    expect(saturate(-1, 1)).toBeCloseTo(-1, 6);
    expect(saturate(0.2, 0.8)).toBeGreaterThan(saturate(0.1, 0.8));
    expect(Math.abs(saturate(5, 0.5))).toBeLessThanOrEqual(1);
    expect(Math.abs(saturate(-40, 1))).toBeLessThanOrEqual(1);
    // Drive makes a quiet signal louder — that is what "crunch" is — and never quieter.
    expect(saturate(0.2, 0.8)).toBeGreaterThan(0.2);
  });
});

describe('transpose', () => {
  it('doubles at an octave and halves going down one', () => {
    expect(transpose(440, 12)).toBeCloseTo(880, 6);
    expect(transpose(440, -12)).toBeCloseTo(220, 6);
    expect(transpose(523.25, 0)).toBe(523.25);
  });
});

describe('a layer', () => {
  it('plays the pitch it was given', () => {
    const out = renderLayer(
      layer({
        source: 'sine',
        pitch: { startHz: 440, endHz: 440 },
        amp: { attack: 0, hold: 1, decay: 0.01 },
      }),
      RATE,
    );
    // A second of 440 Hz crosses upward about 440 times.
    expect(risingCrossings(out, 0, RATE)).toBeGreaterThanOrEqual(438);
    expect(risingCrossings(out, 0, RATE)).toBeLessThanOrEqual(442);
  });

  it('sweeps smoothly rather than stepping', () => {
    const out = renderLayer(
      layer({
        source: 'sine',
        pitch: { startHz: 200, endHz: 800, curve: 'exp' },
        amp: { attack: 0, hold: 1, decay: 0.01 },
      }),
      RATE,
    );
    // The first half of a sweep from 200 to 800 is lower than the second half.
    expect(risingCrossings(out, 0, RATE / 2)).toBeLessThan(risingCrossings(out, RATE / 2, RATE));
    // And nothing in it jumps: the biggest step between samples is what a sine allows.
    let biggest = 0;
    for (let i = 1; i < RATE; i += 1) biggest = Math.max(biggest, Math.abs(out[i]! - out[i - 1]!));
    expect(biggest).toBeLessThan((2 * Math.PI * 800) / RATE + 0.001);
  });

  it('makes the same noise every time, and a different one from a different seed', () => {
    const noisy = layer({ source: 'noise', amp: { decay: 0.05 } });
    const a = renderLayer(noisy, RATE, 1);
    const b = renderLayer(noisy, RATE, 1);
    const c = renderLayer(noisy, RATE, 2);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('leads with silence for its delay', () => {
    const out = renderLayer(layer({ source: 'noise', amp: { decay: 0.05 }, delayMs: 100 }), RATE);
    expect(rms(out, 0, (RATE * 0.1) | 0)).toBe(0);
    expect(rms(out, (RATE * 0.1) | 0)).toBeGreaterThan(0);
  });

  it('never gets louder for having more voices or more harmonics', () => {
    const one = peakOf(renderPatch(patch({ layers: [{ source: 'sawtooth', gain: 1 }] }), RATE));
    const wide = peakOf(
      renderPatch(
        patch({
          layers: [{ source: 'sawtooth', gain: 1, unison: { voices: 7, detuneCents: 30 } }],
        }),
        RATE,
      ),
    );
    const chord = peakOf(
      renderPatch(
        patch({ layers: [{ source: 'sawtooth', gain: 1, harmonics: [4, 7, 12], staggerMs: 0 }] }),
        RATE,
      ),
    );
    expect(wide).toBeLessThanOrEqual(one * 1.2);
    expect(chord).toBeLessThanOrEqual(one * 1.05);
  });

  it('is a plain sine when there is nothing to modulate it, and something else when there is', () => {
    const flat = renderLayer(
      layer({
        source: 'fm',
        fmIndex: 0,
        pitch: { startHz: 440, endHz: 440 },
        amp: { attack: 0, hold: 0.1, decay: 0.01 },
      }),
      RATE,
    );
    const sine = renderLayer(
      layer({
        source: 'sine',
        pitch: { startHz: 440, endHz: 440 },
        amp: { attack: 0, hold: 0.1, decay: 0.01 },
      }),
      RATE,
    );
    const rung = renderLayer(
      layer({
        source: 'fm',
        fmIndex: 4,
        shape: 1.41,
        pitch: { startHz: 440, endHz: 440 },
        amp: { attack: 0, hold: 0.1, decay: 0.01 },
      }),
      RATE,
    );
    let same = 0;
    let different = 0;
    for (let i = 0; i < 2000; i += 1) {
      same = Math.max(same, Math.abs(flat[i]! - sine[i]!));
      different = Math.max(different, Math.abs(rung[i]! - sine[i]!));
    }
    expect(same).toBeLessThan(1e-6);
    expect(different).toBeGreaterThan(0.2);
  });

  it('gives a pulse its width', () => {
    const narrow = renderLayer(
      layer({
        source: 'pulse',
        shape: 0.1,
        pitch: { startHz: 100, endHz: 100 },
        amp: { attack: 0, hold: 0.1, decay: 0.01 },
      }),
      RATE,
    );
    let high = 0;
    for (let i = 0; i < RATE / 10; i += 1) if (narrow[i]! > 0) high += 1;
    expect(high / (RATE / 10)).toBeCloseTo(0.1, 1);
  });

  it('rings metal with more than one partial', () => {
    const struck = {
      pitch: { startHz: 500, endHz: 500 },
      amp: { attack: 0, hold: 0.2, decay: 0.01 },
    };
    const out = renderLayer(layer({ source: 'metal', ...struck }), RATE);
    const sine = renderLayer(layer({ source: 'sine', ...struck }), RATE);
    // It is not a sine at the fundamental — the partials are there — and it is not quiet.
    let different = 0;
    for (let i = 0; i < RATE / 5; i += 1)
      different = Math.max(different, Math.abs(out[i]! - sine[i]!));
    expect(different).toBeGreaterThan(0.3);
    expect(peakOf({ left: out, right: out, sampleRate: RATE })).toBeGreaterThan(0.2);
    // And the higher partials die first: late in the note it is closer to the fundamental.
    let late = 0;
    for (let i = (RATE * 0.18) | 0; i < RATE / 5; i += 1)
      late = Math.max(late, Math.abs(out[i]! - sine[i]!));
    expect(late).toBeLessThan(different);
  });
});

describe('a whole cue', () => {
  const tone = {
    source: 'sine' as const,
    pitch: { startHz: 440, endHz: 440 },
    amp: { attack: 0.001, decay: 0.1 },
    gain: 0.8,
  };

  it('is stereo of one length, and silent with nothing in it', () => {
    const out = renderPatch(patch({ layers: [tone] }), RATE);
    expect(out.left.length).toBe(out.right.length);
    expect(out.sampleRate).toBe(RATE);
    const empty = renderPatch(patch(), RATE);
    expect(peakOf(empty)).toBe(0);
    expect(empty.left.length).toBeGreaterThanOrEqual(1);
  });

  it('pans with equal power', () => {
    const left = renderPatch(patch({ layers: [{ ...tone, pan: -1 }] }), RATE);
    const centre = renderPatch(patch({ layers: [{ ...tone, pan: 0 }] }), RATE);
    expect(rms(left.right)).toBeLessThan(1e-6);
    expect(rms(left.left)).toBeGreaterThan(0.05);
    expect(rms(centre.left)).toBeCloseTo(rms(centre.right), 6);
    expect(rms(centre.left)).toBeCloseTo(rms(left.left) * Math.SQRT1_2, 3);
  });

  it('rings on in a room after the source has stopped, and wider on one side than the other', () => {
    const dry = renderPatch(patch({ layers: [tone] }), RATE);
    const wet = renderPatch(
      patch({ layers: [tone], space: { reverb: 0.5, size: 1, damp: 0.3 } }),
      RATE,
    );
    const after = Math.ceil(0.3 * RATE);
    expect(dry.left.length).toBeLessThanOrEqual(after);
    expect(rms(wet.left, after, after + RATE / 4)).toBeGreaterThan(0.001);
    // The two channels of a stereo room are not the same signal.
    let difference = 0;
    for (let i = after; i < after + RATE / 4; i += 1)
      difference = Math.max(difference, Math.abs(wet.left[i]! - wet.right[i]!));
    expect(difference).toBeGreaterThan(0.0005);
  });

  it('repeats at the echo’s time', () => {
    const blip = { source: 'noise' as const, amp: { attack: 0, decay: 0.01 }, gain: 1 };
    const out = renderPatch(
      patch({ layers: [blip], echo: { mix: 0.6, timeMs: 250, feedback: 0.4 } }),
      RATE,
    );
    const at = Math.round(0.25 * RATE);
    const before = rms(out.left, at - RATE / 50, at - 100);
    const repeat = rms(out.left, at, at + RATE / 100);
    expect(repeat).toBeGreaterThan(before * 20);
  });

  it('scales with its master and never clips however hot it is authored', () => {
    const soft = renderPatch(patch({ layers: [tone], master: 0.25 }), RATE);
    const loud = renderPatch(patch({ layers: [tone], master: 1 }), RATE);
    expect(peakOf(soft)).toBeCloseTo(peakOf(loud) * 0.25, 4);
    const hot = renderPatch(
      patch({
        layers: [
          { ...tone, gain: 1 },
          { ...tone, gain: 1 },
          { ...tone, gain: 1 },
          { ...tone, gain: 1 },
        ],
        master: 1,
      }),
      RATE,
    );
    // Float32 lands a rounding step over the ceiling; the ear does not.
    expect(peakOf(hot)).toBeLessThanOrEqual(0.9801);
    expect(peakOf(hot)).toBeGreaterThan(0.9);
  });

  it('renders the same samples every time', () => {
    const design = patch({
      layers: [tone, { source: 'noise', amp: { decay: 0.1 } }],
      space: { reverb: 0.3 },
    });
    const a = renderPatch(design, RATE);
    const b = renderPatch(design, RATE);
    expect(Array.from(a.left)).toEqual(Array.from(b.left));
    expect(Array.from(a.right)).toEqual(Array.from(b.right));
  });
});
