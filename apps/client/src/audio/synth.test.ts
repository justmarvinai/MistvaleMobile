import { describe, expect, it } from 'vitest';
import type { SynthVoice } from '@mistvale/shared';
import { envelopeAt, renderVoice, transpose, voiceSeconds, waveAt } from './synth';

/**
 * The synth, checked as the arithmetic it is.
 *
 * Rendering a cue into a buffer rather than building a node graph is what makes this
 * testable at all: no `AudioContext`, no timing, no browser — a voice goes in and samples
 * come out, and a change in how the game sounds shows up here as a number rather than as
 * somebody noticing on a Tuesday.
 */

const voice = (over: Partial<SynthVoice> = {}): SynthVoice => ({
  source: 'tone',
  wave: 'square',
  startHz: 660,
  endHz: 660,
  attack: 0.004,
  decay: 0.12,
  gain: 0.5,
  filterHz: 20_000,
  overtones: [],
  ...over,
});

const RATE = 48_000;

describe('transpose', () => {
  it('doubles at an octave and halves going down one', () => {
    expect(transpose(440, 12)).toBeCloseTo(880, 6);
    expect(transpose(440, -12)).toBeCloseTo(220, 6);
  });

  it('leaves a voice alone at zero', () => {
    expect(transpose(523.25, 0)).toBe(523.25);
  });
});

describe('envelopeAt', () => {
  it('is silent before the sound starts', () => {
    expect(envelopeAt(-0.01, 0.004, 0.12)).toBe(0);
  });

  it('climbs linearly through the attack and peaks at its end', () => {
    expect(envelopeAt(0.002, 0.004, 0.12)).toBeCloseTo(0.5, 6);
    expect(envelopeAt(0.004, 0.004, 0.12)).toBeCloseTo(1, 6);
  });

  it('decays to near-silence by the end of the decay, without cutting', () => {
    const nearEnd = envelopeAt(0.004 + 0.119, 0.004, 0.12);
    expect(nearEnd).toBeGreaterThan(0);
    expect(nearEnd).toBeLessThan(0.01);
  });

  it('is exactly silent past the decay, so a buffer has no dead tail', () => {
    expect(envelopeAt(0.004 + 0.2, 0.004, 0.12)).toBe(0);
  });

  it('peaks immediately when there is no attack', () => {
    expect(envelopeAt(0, 0, 0.1)).toBe(1);
  });
});

describe('waveAt', () => {
  it('gives every wave a range of [-1, 1]', () => {
    for (const wave of ['sine', 'square', 'sawtooth', 'triangle'] as const) {
      for (let step = 0; step < 64; step += 1) {
        const value = waveAt(wave, step / 64);
        expect(Math.abs(value), `${wave} at ${step}/64`).toBeLessThanOrEqual(1.000001);
      }
    }
  });

  it('repeats every period, so a long sweep cannot wander', () => {
    expect(waveAt('sine', 0.25)).toBeCloseTo(waveAt('sine', 3.25), 10);
    expect(waveAt('sawtooth', 0.1)).toBeCloseTo(waveAt('sawtooth', 8.1), 10);
  });

  it('switches the square wave halfway through', () => {
    expect(waveAt('square', 0.25)).toBe(1);
    expect(waveAt('square', 0.75)).toBe(-1);
  });
});

describe('voiceSeconds', () => {
  it('is the attack plus the decay for a single voice', () => {
    expect(voiceSeconds(voice())).toBeCloseTo(0.124, 6);
  });

  it('makes room for the tail of the last overtone', () => {
    // Overtones enter staggered; the buffer has to outlast the one that started latest.
    expect(voiceSeconds(voice({ overtones: [7, 12] }))).toBeGreaterThan(voiceSeconds(voice()));
  });
});

describe('renderVoice', () => {
  it('produces a buffer as long as the voice lasts', () => {
    const samples = renderVoice(voice(), RATE);
    expect(samples.length).toBe(Math.ceil(0.124 * RATE));
  });

  it('never clips, which is what would turn a cue into a crackle', () => {
    for (const wave of ['sine', 'square', 'sawtooth', 'triangle'] as const) {
      const samples = renderVoice(voice({ wave, gain: 1, filterHz: 20_000 }), RATE);
      for (const sample of samples) expect(Math.abs(sample), wave).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic, noise included', () => {
    // Seeded rather than Math.random for the same reason everything else here is: a cue
    // must sound the same every time, and a test must be able to say so.
    const first = renderVoice(voice({ source: 'noise' }), RATE);
    const second = renderVoice(voice({ source: 'noise' }), RATE);
    expect(Array.from(first.slice(0, 200))).toEqual(Array.from(second.slice(0, 200)));
  });

  it('actually makes a sound', () => {
    const samples = renderVoice(voice(), RATE);
    const peak = samples.reduce((carry, value) => Math.max(carry, Math.abs(value)), 0);
    expect(peak).toBeGreaterThan(0.05);
  });

  it('is quieter at a lower gain', () => {
    const peakOf = (g: number): number =>
      renderVoice(voice({ gain: g }), RATE).reduce((c, v) => Math.max(c, Math.abs(v)), 0);
    expect(peakOf(0.2)).toBeLessThan(peakOf(0.8));
  });

  it('shares the peak between stacked voices rather than adding to it', () => {
    // Four notes must not be four times louder than one; a flourish is a chord, not a
    // volume increase.
    const single = renderVoice(voice(), RATE);
    const chord = renderVoice(voice({ overtones: [4, 7, 12] }), RATE);
    const peak = (s: Float32Array): number => s.reduce((c, v) => Math.max(c, Math.abs(v)), 0);
    expect(peak(chord)).toBeLessThanOrEqual(peak(single) * 1.2);
  });

  it('takes the edge off when the filter closes', () => {
    // The single knob between a bright click and a dull knock: a low corner must remove
    // energy from a square wave rather than leave it untouched.
    const energy = (s: Float32Array): number => s.reduce((c, v) => c + v * v, 0);
    const bright = renderVoice(voice({ wave: 'square', filterHz: 18_000 }), RATE);
    const dull = renderVoice(voice({ wave: 'square', filterHz: 300 }), RATE);
    expect(energy(dull)).toBeLessThan(energy(bright));
  });

  it('renders a sweep differently from a flat tone', () => {
    const flat = renderVoice(voice({ startHz: 440, endHz: 440 }), RATE);
    const swept = renderVoice(voice({ startHz: 440, endHz: 1320 }), RATE);
    expect(Array.from(flat.slice(0, 400))).not.toEqual(Array.from(swept.slice(0, 400)));
  });

  it('survives a one-sample voice without dividing by zero', () => {
    const samples = renderVoice(voice({ attack: 0, decay: 0.01 }), 100);
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) expect(Number.isFinite(sample)).toBe(true);
  });
});
