import { describe, expect, it } from 'vitest';
import { CUE_KEYS, MUSIC_KEYS, soundCueDefSchema } from '@mistvale/shared';
import { SOUND_CUES } from './sounds';

/**
 * The catalogue, against the contract.
 *
 * The mixer treats an unknown cue as silence on purpose — content is data, and a client
 * older than the bundle should make the game quieter rather than throw. The cost of that
 * kindness is that a typo'd key is a button which is silent forever and never complains.
 * This is where it complains.
 */

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

  it('keeps every cue short enough to be a cue', () => {
    // Interface sounds. A second and a half is already a fanfare; anything past two is
    // music, and music belongs on its own bus with a track behind it.
    for (const cue of SOUND_CUES) {
      const parsed = soundCueDefSchema.parse(cue);
      expect(parsed.voice.attack + parsed.voice.decay, cue.key).toBeLessThanOrEqual(2);
    }
  });

  it('throttles the ones a battle fires in bursts', () => {
    // A five-hit skill lands five damage events inside a third of a second.
    for (const key of ['battle_hit', 'battle_crit', 'battle_debuff']) {
      const cue = SOUND_CUES.find((entry) => entry.key === key);
      expect(cue?.throttleMs, key).toBeGreaterThan(0);
    }
  });

  it('lets the moments through every time', () => {
    // Victory, a level-up, a Legendary. None repeats by accident, so a floor under them
    // could only ever swallow one somebody was owed.
    for (const key of ['victory', 'defeat', 'level_up', 'unlock', 'summon_legendary']) {
      const cue = SOUND_CUES.find((entry) => entry.key === key);
      expect(cue?.throttleMs, key).toBe(0);
    }
  });

  it('defines both music tracks', () => {
    const defined = new Set(SOUND_CUES.map((cue) => cue.key));
    expect(MUSIC_KEYS.filter((key) => !defined.has(key))).toEqual([]);
  });

  it('gives the music a file, a loop and the music bus — and nothing else any of them', () => {
    // The split the catalogue rests on. A cue is synthesised and fires and forgets; a track
    // is a recording that streams and repeats. Mixing the two up is how a four-minute loop
    // ends up firing on every button press.
    for (const key of MUSIC_KEYS) {
      const track = SOUND_CUES.find((entry) => entry.key === key);
      expect(track?.bus, key).toBe('music');
      expect(track?.sample, key).not.toBe('');
      expect(track?.loop, key).toBe(true);
    }
    const music: readonly string[] = MUSIC_KEYS;
    for (const cue of SOUND_CUES.filter((entry) => !music.includes(entry.key))) {
      // Everything else stands on its synth voice — the owner's pack is music and voice
      // lines, not interface sounds, and a cue naming a sample nobody published is silent
      // by design (see mixer.ts).
      expect(cue.sample, cue.key).toBe('');
      expect(cue.loop, cue.key).toBe(false);
    }
  });
});
