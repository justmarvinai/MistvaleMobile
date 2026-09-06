import { describe, expect, it } from 'vitest';
import {
  CUE_KEYS,
  MUSIC_KEYS,
  layerSeconds,
  patchSeconds,
  peakOf,
  renderPatch,
  soundCueDefSchema,
  type Rendered,
  type SoundCueDef,
} from '@mistvale/shared';
import { SOUND_CUES } from './sounds';

/**
 * The catalogue, against the contract — and, since C51, against the ear.
 *
 * The mixer treats an unknown cue as silence on purpose — content is data, and a client
 * older than the bundle should make the game quieter rather than throw. The cost of that
 * kindness is that a typo'd key is a button which is silent forever and never complains.
 * This is where it complains.
 *
 * The second half renders every cue and measures it. Sound is the one kind of content in
 * this game nobody can review in a diff, so the properties that make a family what it is
 * are pinned as numbers: a hit arrives inside a dozen milliseconds, a coin is bright, a
 * death is dark, an interface tick is quieter than a blow, and the Mistgate's four landings
 * climb. A retune that turns a hit into a hum, or a legendary into something a rare would
 * drown, fails here rather than on a player.
 */

const RATE = 22_050;

const rendered = new Map<string, Rendered>();
function render(cue: SoundCueDef): Rendered {
  const existing = rendered.get(cue.key);
  if (existing) return existing;
  const out = renderPatch(cue.patch, RATE);
  rendered.set(cue.key, out);
  return out;
}

const synthesised = SOUND_CUES.filter((cue) => !cue.sample);
const byKey = (key: string): SoundCueDef => {
  const cue = SOUND_CUES.find((entry) => entry.key === key);
  if (!cue) throw new Error(`no cue ${key}`);
  return cue;
};

/** Seconds before the left channel first reaches half its peak. */
function arrivalMs(out: Rendered): number {
  const peak = peakOf(out);
  for (let i = 0; i < out.left.length; i += 1) {
    if (Math.abs(out.left[i]!) >= peak * 0.5) return (i / out.sampleRate) * 1000;
  }
  return Number.POSITIVE_INFINITY;
}

/** Where the energy sits, in Hz, over a window around the loudest moment. */
function centroidHz(out: Rendered): number {
  const N = 1024;
  const x = out.left;
  let peakAt = 0;
  let peak = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (Math.abs(x[i]!) > peak) {
      peak = Math.abs(x[i]!);
      peakAt = i;
    }
  }
  const start = Math.max(0, Math.min(x.length - N, peakAt - N / 2));
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < N / 2; k += 2) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n += 1) {
      const v = x[start + n] ?? 0;
      const angle = (2 * Math.PI * k * n) / N;
      re += v * Math.cos(angle);
      im -= v * Math.sin(angle);
    }
    const magnitude = Math.hypot(re, im);
    weighted += magnitude * ((k * out.sampleRate) / N);
    total += magnitude;
  }
  return total > 0 ? weighted / total : 0;
}

const bodySeconds = (cue: SoundCueDef): number =>
  Math.max(0, ...cue.patch.layers.map((layer) => layerSeconds(layer)));

describe('the sound catalogue', () => {
  it('defines every cue the client knows how to ask for', () => {
    const defined = new Set(SOUND_CUES.map((cue) => cue.key));
    const missing = CUE_KEYS.filter((key) => !defined.has(key));
    expect(missing, 'cues the client asks for and the seed does not define').toEqual([]);
  });

  it('parses cleanly through the published schema', () => {
    for (const cue of SOUND_CUES) {
      const parsed = soundCueDefSchema.safeParse(cue);
      expect(parsed.success, `${cue.key}: ${JSON.stringify(parsed.error?.issues?.[0])}`).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = SOUND_CUES.map((cue) => cue.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every synthesised cue a design, and every track a file', () => {
    for (const cue of synthesised) expect(cue.patch.layers.length, cue.key).toBeGreaterThan(0);
    for (const key of MUSIC_KEYS) {
      const track = byKey(key);
      expect(track.sample, key).not.toBe('');
      expect(track.loop, key).toBe(true);
      expect(track.bus, key).toBe('music');
    }
  });

  it('keeps every cue short enough to be a cue', () => {
    // The body is what the layers play; the room may ring on after it. Two seconds of
    // body is already a fanfare; anything past it is music, and music has a bus of its own.
    for (const cue of synthesised) {
      expect(bodySeconds(cue), `${cue.key} body`).toBeLessThanOrEqual(2);
      expect(patchSeconds(cue.patch), `${cue.key} with its tail`).toBeLessThanOrEqual(6);
    }
  });

  it('throttles the ones a battle fires in bursts', () => {
    // A five-hit skill lands five damage events inside a third of a second.
    for (const key of [
      'battle_hit',
      'battle_hit_strong',
      'battle_hit_weak',
      'battle_crit',
      'battle_debuff',
      'battle_cast',
    ]) {
      expect(byKey(key).throttleMs, key).toBeGreaterThan(0);
    }
  });

  it('lets the moments through every time', () => {
    // Victory, a level-up, a Legendary. None repeats by accident, so a floor under them
    // could only ever swallow one somebody was owed.
    for (const key of [
      'victory',
      'defeat',
      'level_up',
      'unlock',
      'summon_legendary',
      'boss_enrage',
    ]) {
      expect(byKey(key).throttleMs, key).toBe(0);
    }
  });
});

describe('what the catalogue sounds like', () => {
  it('every cue renders, is audible, and never clips', () => {
    for (const cue of synthesised) {
      const out = render(cue);
      const peak = peakOf(out);
      expect(Number.isFinite(peak), `${cue.key} renders numbers`).toBe(true);
      expect(peak, `${cue.key} is audible`).toBeGreaterThan(0.06);
      // Under the limiter rather than on it: a cue the guard has to catch is a cue authored
      // too hot, and the guard is for the four-at-once case, not for the author.
      expect(peak, `${cue.key} stays under the limiter`).toBeLessThanOrEqual(0.975);
    }
  });

  it('keeps the interface quieter and shorter than a blow', () => {
    const blow = peakOf(render(byKey('battle_hit')));
    for (const cue of synthesised.filter((entry) => entry.bus === 'ui')) {
      expect(peakOf(render(cue)), `${cue.key} under a hit`).toBeLessThan(blow);
      expect(bodySeconds(cue), `${cue.key} is a tick, not an event`).toBeLessThanOrEqual(0.6);
    }
  });

  it('lands a hit inside a dozen milliseconds', () => {
    // The transient is the whole of what makes an impact read as contact. A hit that
    // swells in is a pad.
    for (const key of [
      'battle_hit',
      'battle_hit_strong',
      'battle_hit_weak',
      'battle_crit',
      'battle_block',
      'ui_press',
    ]) {
      expect(arrivalMs(render(byKey(key))), key).toBeLessThanOrEqual(12);
    }
  });

  it('makes the coin bright and the weight dark', () => {
    for (const key of ['reward_silver', 'reward_crystals', 'relic_sell']) {
      expect(centroidHz(render(byKey(key))), `${key} glints`).toBeGreaterThan(2500);
    }
    for (const key of ['battle_start', 'defeat', 'battle_death', 'champion_awaken']) {
      expect(centroidHz(render(byKey(key))), `${key} has weight`).toBeLessThan(2600);
    }
  });

  it('gives the moments room to ring', () => {
    for (const key of ['victory', 'defeat', 'level_up', 'champion_awaken', 'summon_legendary']) {
      expect(patchSeconds(byKey(key).patch), key).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('climbs the Mistgate’s ladder', () => {
    // Each landing is louder and longer than the one below it, which is what makes the
    // gap between them the pull's drama rather than four shades of one chime.
    const rungs = ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary'].map(byKey);
    for (let i = 1; i < rungs.length; i += 1) {
      const lower = rungs[i - 1]!;
      const upper = rungs[i]!;
      expect(peakOf(render(upper)), `${upper.key} louder than ${lower.key}`).toBeGreaterThan(
        peakOf(render(lower)),
      );
      expect(patchSeconds(upper.patch), `${upper.key} longer than ${lower.key}`).toBeGreaterThan(
        patchSeconds(lower.patch),
      );
    }
  });

  it('makes a strong hit heavier than a weak one, and a crit heaviest', () => {
    const weak = peakOf(render(byKey('battle_hit_weak')));
    const plain = peakOf(render(byKey('battle_hit')));
    const strong = peakOf(render(byKey('battle_hit_strong')));
    const crit = peakOf(render(byKey('battle_crit')));
    expect(weak).toBeLessThan(plain);
    expect(plain).toBeLessThan(strong);
    expect(strong).toBeLessThanOrEqual(crit);
  });

  it('still sounds for a row published before the redesign', () => {
    // The pre-C51 shape, as an operator-authored row would still carry it.
    const legacy = soundCueDefSchema.parse({
      key: 'old_beep',
      bus: 'ui',
      voice: { wave: 'square', startHz: 620, endHz: 560, decay: 0.05, gain: 0.22, filterHz: 2600 },
    });
    expect(legacy.patch.layers).toHaveLength(1);
    expect(legacy.patch.layers[0]?.source).toBe('square');
    expect('voice' in legacy).toBe(false);
    expect(peakOf(renderPatch(legacy.patch, RATE))).toBeGreaterThan(0.05);

    // The plain seed backfills a missing `patch` with its default — no layers — *beside*
    // the old `voice`, which is what a row looks like after a release that ran the seed
    // and not the replace. Read literally it is silent; lifted, it still sounds.
    const backfilled = soundCueDefSchema.parse({
      key: 'old_beep',
      bus: 'ui',
      voice: { wave: 'square', startHz: 620, endHz: 560, decay: 0.05, gain: 0.22 },
      patch: { layers: [] },
    });
    expect(backfilled.patch.layers).toHaveLength(1);
    expect(peakOf(renderPatch(backfilled.patch, RATE))).toBeGreaterThan(0.05);

    // And a re-voiced row keeps its own design even if a stale `voice` is still on it.
    const revoiced = soundCueDefSchema.parse({
      key: 'new_beep',
      voice: { wave: 'square' },
      patch: { layers: [{ source: 'metal' }] },
    });
    expect(revoiced.patch.layers[0]?.source).toBe('metal');
  });
});
