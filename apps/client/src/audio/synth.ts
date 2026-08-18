import type { SynthVoice } from '@mistvale/shared';

/**
 * Turning a cue's numbers into samples.
 *
 * Deliberately arithmetic rather than a graph of `OscillatorNode`s. Rendering a cue into
 * a buffer once and then playing that buffer means a cue fired forty times in a battle
 * costs one allocation instead of forty node graphs, and — the reason it is written this
 * way — it makes the whole thing a pure function that a test can check sample by sample.
 * The mixer owns everything stateful; this owns none of it.
 *
 * Every sound in the game is a short shaped tone or a filtered noise burst, because that
 * is what a pixel game's interface has always been made of. See the `soundCue` content
 * type for the parameters and `db/seed/data/sounds.ts` for the catalogue.
 */

/** Semitones to a frequency ratio — twelve of them double the pitch. */
export function transpose(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

/**
 * The envelope at a moment, in [0, 1].
 *
 * Linear attack into exponential decay: the attack is short enough that its shape does
 * not matter, and the decay is the part a listener hears as "a sound" rather than "a
 * click followed by silence". `exp(-5t/decay)` lands at about 0.7% of peak at `decay`,
 * which is inaudible without being an abrupt cut.
 */
export function envelopeAt(time: number, attack: number, decay: number): number {
  if (time < 0) return 0;
  if (attack > 0 && time < attack) return time / attack;
  const since = time - attack;
  if (since > decay) return 0;
  return Math.exp((-5 * since) / decay);
}

/** One period of the named wave, given a phase in [0, 1). */
export function waveAt(wave: SynthVoice['wave'], phase: number): number {
  const turn = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(turn * Math.PI * 2);
    case 'square':
      return turn < 0.5 ? 1 : -1;
    case 'sawtooth':
      return turn * 2 - 1;
    case 'triangle':
      return 4 * Math.abs(turn - 0.5) - 1;
  }
}

/** How long a voice lasts, including the tail of its last overtone. */
export function voiceSeconds(voice: SynthVoice): number {
  // Overtones enter staggered so a chord arrives as a flourish rather than a block; the
  // last one to start is the last one to finish.
  const lastEntry = voice.overtones.length * OVERTONE_STAGGER;
  return voice.attack + voice.decay + lastEntry;
}

/** Seconds between stacked voices. Long enough to hear as separate, short enough to be one gesture. */
const OVERTONE_STAGGER = 0.045;

/**
 * Renders a cue into mono samples at `sampleRate`.
 *
 * Noise is a deterministic PRNG rather than `Math.random`, for the same reason everything
 * else in this project is seeded: a cue should sound the same every time it plays, and a
 * test should be able to say so.
 */
export function renderVoice(voice: SynthVoice, sampleRate: number): Float32Array<ArrayBuffer> {
  const length = Math.max(1, Math.ceil(voiceSeconds(voice) * sampleRate));
  const out = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));

  const entries = [0, ...voice.overtones];
  let noiseState = 0x9e37_79b9;
  const noise = (): number => {
    // xorshift32 — cheap, even, and the same sequence for every render of every cue.
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    return ((noiseState >>> 0) / 0xffff_ffff) * 2 - 1;
  };

  // A one-pole low-pass, the single knob between a bright click and a dull knock. Applied
  // across the whole mix rather than per voice: it is the cue's timbre, not one tone's.
  const rc = 1 / (2 * Math.PI * voice.filterHz);
  const alpha = 1 / sampleRate / (rc + 1 / sampleRate);
  let filtered = 0;

  for (let index = 0; index < length; index += 1) {
    const time = index / sampleRate;
    let sample = 0;

    for (let entry = 0; entry < entries.length; entry += 1) {
      const start = entry * OVERTONE_STAGGER;
      const local = time - start;
      if (local < 0) continue;
      const envelope = envelopeAt(local, voice.attack, voice.decay);
      if (envelope <= 0) continue;

      if (voice.source === 'noise') {
        sample += noise() * envelope;
        continue;
      }

      const semitones = entries[entry] ?? 0;
      const from = transpose(voice.startHz, semitones);
      const to = transpose(voice.endHz, semitones);
      // Sweeping the *phase* rather than the frequency: integrating a linear sweep is
      // what keeps a glide smooth instead of stepping at each sample boundary.
      const span = Math.max(voice.attack + voice.decay, 1e-6);
      const progress = Math.min(1, local / span);
      const phase = (from * local + ((to - from) * local * progress) / 2) % 1_000_000;
      sample += waveAt(voice.wave, phase) * envelope;
    }

    // Voices share the peak rather than adding to it, so a four-note flourish is not four
    // times louder than a beep.
    sample = (sample / entries.length) * voice.gain;

    filtered += alpha * (sample - filtered);
    out[index] = filtered;
  }

  return out;
}
