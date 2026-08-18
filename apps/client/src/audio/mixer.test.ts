import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundCueDef } from '@mistvale/shared';
import { Mixer } from './mixer';

/**
 * The rules a mixer has to keep, checked without a browser.
 *
 * A fake `AudioContext` stands in for the device — enough of one to count what was
 * started and at what gain. What matters here is not that a sound came out; it is the
 * four ways this can go wrong in front of a player: making noise before they touched the
 * page, throwing because a cue is missing, ignoring the volume they set, and turning a
 * five-hit skill into a buzz.
 */

interface Started {
  gain: number;
}

/** Records what would have been played, and nothing else. */
function fakeAudio(): { started: Started[]; restore: () => void } {
  const started: Started[] = [];

  class FakeGain {
    gain = { value: 1 };
    connect(next: unknown): unknown {
      return next;
    }
  }
  class FakeSource {
    buffer: unknown = null;
    private gain: FakeGain | null = null;
    connect(next: FakeGain): FakeGain {
      this.gain = next;
      return next;
    }
    start(): void {
      started.push({ gain: this.gain?.gain.value ?? 1 });
    }
  }
  class FakeContext {
    sampleRate = 48_000;
    destination = {};
    createGain(): FakeGain {
      return new FakeGain();
    }
    createBufferSource(): FakeSource {
      return new FakeSource();
    }
    createBuffer(_channels: number, length: number): { copyToChannel: () => void; length: number } {
      return { copyToChannel: () => undefined, length };
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
  return {
    started,
    restore: () => {
      (globalThis as { window?: unknown }).window = original;
    },
  };
}

const cue = (over: Partial<SoundCueDef> = {}): SoundCueDef => ({
  key: 'ui_press',
  sortOrder: 0,
  bus: 'ui',
  sample: '',
  voice: {
    source: 'tone',
    wave: 'square',
    startHz: 620,
    endHz: 560,
    attack: 0.004,
    decay: 0.05,
    gain: 0.22,
    filterHz: 2600,
    overtones: [],
  },
  throttleMs: 40,
  active: true,
  ...over,
});

describe('the mixer', () => {
  let audio: ReturnType<typeof fakeAudio>;
  let mixer: Mixer;

  beforeEach(() => {
    audio?.restore();
    audio = fakeAudio();
    mixer = new Mixer();
    mixer.setCues([cue()]);
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: 0.8 });
  });

  it('stays silent until the player has touched the page', () => {
    // Browsers refuse an AudioContext started without a gesture, and a refused one stays
    // refused — so a cue asked for too early is dropped rather than queued. A click the
    // player never made must not arrive late.
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(0);

    mixer.unlock();
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(1);
  });

  it('treats an unknown cue as silence rather than an error', () => {
    // Cues are content. A client older than the bundle, or a cue an operator switched
    // off, makes the game quieter and nothing else.
    mixer.unlock();
    expect(() => mixer.play('no_such_cue')).not.toThrow();
    expect(audio.started).toHaveLength(0);
  });

  it('ignores a cue its content marked inactive', () => {
    mixer.setCues([cue({ active: false })]);
    mixer.unlock();
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(0);
  });

  it('plays at the volume of the cue’s own bus', () => {
    mixer.unlock();
    mixer.play('ui_press');
    // `ui` follows the effects slider until it has a control of its own.
    expect(audio.started[0]?.gain).toBeCloseTo(0.8, 6);
  });

  it('does not reach the device at all when its bus is at zero', () => {
    mixer.setLevels({ musicVolume: 0, sfxVolume: 0 });
    mixer.unlock();
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(0);
  });

  it('clamps a nonsense volume instead of passing it on', () => {
    mixer.setLevels({ musicVolume: 4, sfxVolume: Number.NaN });
    mixer.unlock();
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(0);
  });

  it('throttles a repeat, so a five-hit skill is five hits and not a buzz', () => {
    mixer.unlock();
    mixer.play('battle_hit');
    mixer.setCues([cue({ key: 'battle_hit', bus: 'sfx', throttleMs: 55 })]);

    mixer.play('battle_hit', 1_000);
    mixer.play('battle_hit', 1_020);
    mixer.play('battle_hit', 1_054);
    expect(audio.started).toHaveLength(1);

    mixer.play('battle_hit', 1_056);
    expect(audio.started).toHaveLength(2);
  });

  it('lets a deliberate cue through every time', () => {
    // Victory, a level-up, a Legendary — none of those repeat by accident, so a floor
    // under them would only ever swallow one somebody was owed.
    mixer.setCues([cue({ key: 'victory', bus: 'sfx', throttleMs: 0 })]);
    mixer.unlock();
    mixer.play('victory', 1_000);
    mixer.play('victory', 1_001);
    expect(audio.started).toHaveLength(2);
  });

  it('stays silent for a cue pointing at a recording nobody has uploaded', () => {
    // Deliberately not falling back to the synth: a broken asset key should be audible as
    // a missing sound rather than hidden behind a beep.
    mixer.setCues([cue({ sample: 'audio/press.ogg' })]);
    mixer.unlock();
    mixer.play('ui_press');
    expect(audio.started).toHaveLength(0);
  });

  it('renders a cue once however often it plays', () => {
    const spy = vi.spyOn(Math, 'exp');
    mixer.unlock();
    mixer.play('ui_press', 1_000);
    const afterFirst = spy.mock.calls.length;
    mixer.play('ui_press', 5_000);
    mixer.play('ui_press', 9_000);
    // Three plays, one render: a battle fires the same handful of cues all evening.
    expect(spy.mock.calls.length).toBe(afterFirst);
    spy.mockRestore();
  });

  it('survives a browser with no audio device', () => {
    audio.restore();
    (globalThis as { window?: unknown }).window = {};
    const quiet = new Mixer();
    quiet.setCues([cue()]);
    quiet.unlock();
    expect(() => quiet.play('ui_press')).not.toThrow();
  });
});
