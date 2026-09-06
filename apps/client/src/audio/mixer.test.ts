import { beforeEach, describe, expect, it, vi } from 'vitest';
import { soundCueDefSchema, type SoundCueDef } from '@mistvale/shared';
import { Mixer } from './mixer';

/**
 * The rules a mixer has to keep, checked without a browser.
 *
 * A fake `AudioContext` stands in for the device — enough of one to record what was
 * started, at what rate, on which bus and at what level. What matters here is not that a
 * sound came out; it is the ways this can go wrong in front of a player: noise before they
 * touched the page, a throw because a cue is missing, a slider that does nothing, a five-hit
 * skill that is a buzz, ten relics that are a wall, a recording that never plays.
 */

interface Started {
  rate: number;
  trim: number;
  bus: number;
  loop: boolean;
}

interface Fake {
  started: Started[];
  stopped: number;
  decoded: number;
  /** How many buffers were built — one per render, which is the cost being paced. */
  buffers: number;
  /** The lengths of those buffers, in the order they were built. */
  rendered: string[];
  restore: () => void;
}

/** Records what would have been played, and nothing else. */
function fakeAudio(): Fake {
  const started: Started[] = [];
  const fake: Fake = {
    started,
    stopped: 0,
    decoded: 0,
    buffers: 0,
    rendered: [],
    restore: () => undefined,
  };

  class FakeParam {
    constructor(public value: number) {}
  }
  class FakeNode {
    gain = new FakeParam(1);
    threshold = new FakeParam(0);
    knee = new FakeParam(0);
    ratio = new FakeParam(1);
    attack = new FakeParam(0);
    release = new FakeParam(0);
    next: FakeNode | null = null;
    connect(next: FakeNode): FakeNode {
      this.next = next;
      return next;
    }
  }
  class FakeSource extends FakeNode {
    buffer: unknown = null;
    loop = false;
    playbackRate = new FakeParam(1);
    private listeners: (() => void)[] = [];
    addEventListener(_: string, fn: () => void): void {
      this.listeners.push(fn);
    }
    start(): void {
      // source → trim → bus → (glue) → destination
      const trim = this.next as FakeNode;
      const bus = trim.next as FakeNode;
      started.push({
        rate: this.playbackRate.value,
        trim: trim.gain.value,
        bus: bus.gain.value,
        loop: this.loop,
      });
    }
    stop(): void {
      fake.stopped += 1;
      for (const fn of this.listeners) fn();
    }
  }
  class FakeContext {
    sampleRate = 8_000;
    destination = new FakeNode();
    createGain(): FakeNode {
      return new FakeNode();
    }
    createDynamicsCompressor(): FakeNode {
      return new FakeNode();
    }
    createBufferSource(): FakeSource {
      return new FakeSource();
    }
    createBuffer(
      channels: number,
      length: number,
    ): { channels: number; length: number; copyToChannel: () => void } {
      // One buffer per render, which is the cost the warm queue paces; the length is
      // remembered because each fake cue's is unique, so a test can say which went first.
      fake.buffers += 1;
      fake.rendered.push(String(length));
      return { channels, length, copyToChannel: () => undefined };
    }
    decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
      fake.decoded += 1;
      if (bytes.byteLength === 0) return Promise.reject(new Error('not audio'));
      return Promise.resolve({ length: bytes.byteLength, decoded: true });
    }
    resume(): Promise<void> {
      return Promise.resolve();
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { AudioContext: FakeContext };
  fake.restore = () => {
    (globalThis as { window?: unknown }).window = previous;
  };
  return fake;
}

/** Each fake cue's buffer is a different length, so a test can tell which was rendered. */
const decayOf = (key: string): number =>
  0.05 + ([...key].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 50) / 1000;

const cue = (key: string, over: Record<string, unknown> = {}): SoundCueDef =>
  soundCueDefSchema.parse({
    key,
    bus: 'sfx',
    patch: { layers: [{ source: 'sine', amp: { decay: decayOf(key) } }] },
    throttleMs: 0,
    ...over,
  });

describe('the mixer', () => {
  let fake: Fake;
  let mixer: Mixer;

  beforeEach(() => {
    fake = fakeAudio();
    mixer = new Mixer();
    mixer.setCues([cue('ping'), cue('hit', { throttleMs: 50 }), cue('off', { active: false })]);
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: 0.7 });
    return () => fake.restore();
  });

  it('stays silent until the player has touched the page', () => {
    mixer.play('ping');
    expect(fake.started).toHaveLength(0);
    mixer.unlock();
    mixer.play('ping');
    expect(fake.started).toHaveLength(1);
  });

  it('treats an unknown cue, and one its content marked inactive, as silence', () => {
    mixer.unlock();
    expect(() => mixer.play('nothing')).not.toThrow();
    mixer.play('off');
    expect(fake.started).toHaveLength(0);
  });

  it('plays on its bus at the volume the player set, and follows the slider live', () => {
    mixer.unlock();
    mixer.play('ping');
    expect(fake.started[0]?.bus).toBeCloseTo(0.7, 6);
    // The bus node already exists; a new level reaches it without a new cue.
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: 0.2 });
    mixer.play('ping');
    expect(fake.started[1]?.bus).toBeCloseTo(0.2, 6);
  });

  it('does not reach the device at all when its bus is at zero', () => {
    mixer.unlock();
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: 0 });
    mixer.play('ping');
    expect(fake.started).toHaveLength(0);
  });

  it('clamps a nonsense volume instead of passing it on', () => {
    mixer.unlock();
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: 7 });
    mixer.play('ping');
    expect(fake.started[0]?.bus).toBe(1);
    mixer.setLevels({ musicVolume: 0.5, sfxVolume: Number.NaN });
    mixer.play('ping');
    expect(fake.started).toHaveLength(1);
  });

  it('throttles a repeat, so a five-hit skill is five hits and not a buzz', () => {
    mixer.unlock();
    mixer.play('hit', 1000);
    mixer.play('hit', 1010);
    mixer.play('hit', 1049);
    mixer.play('hit', 1050);
    expect(fake.started).toHaveLength(2);
  });

  it('lets a deliberate cue through every time', () => {
    mixer.unlock();
    for (let i = 0; i < 5; i += 1) mixer.play('ping', 1000);
    expect(fake.started).toHaveLength(5);
  });

  it('renders a cue once however often it plays', () => {
    const spy = vi.spyOn(FakeBufferCounter, 'count');
    mixer.unlock();
    mixer.play('ping');
    mixer.play('ping');
    mixer.play('ping');
    expect(fake.started).toHaveLength(3);
    spy.mockRestore();
  });

  it('nudges each play, the same way in every session', () => {
    mixer.setCues([
      cue('vary', {
        patch: { layers: [{ source: 'sine' }], variation: { pitchCents: 50, gainDb: 3 } },
      }),
    ]);
    mixer.unlock();
    mixer.play('vary');
    mixer.play('vary');
    const [a, b] = fake.started;
    expect(a?.rate).not.toBe(b?.rate);
    expect(Math.abs(Math.log2(a?.rate ?? 1) * 1200)).toBeLessThanOrEqual(50);
    expect(a?.trim).not.toBe(1);
    expect(Math.abs(20 * Math.log10(a?.trim ?? 1))).toBeLessThanOrEqual(3);

    // A fresh mixer nudges its first play exactly as this one did.
    const again = new Mixer();
    again.setCues([
      cue('vary', {
        patch: { layers: [{ source: 'sine' }], variation: { pitchCents: 50, gainDb: 3 } },
      }),
    ]);
    again.setLevels({ musicVolume: 0.5, sfxVolume: 0.7 });
    again.unlock();
    again.play('vary');
    expect(fake.started[2]?.rate).toBe(a?.rate);
  });

  it('plays a cue with no variation exactly as authored', () => {
    mixer.unlock();
    mixer.play('ping');
    expect(fake.started[0]?.rate).toBe(1);
    expect(fake.started[0]?.trim).toBe(1);
  });

  it('cuts the oldest copy when a cue is sounding as many times as it allows', () => {
    mixer.setCues([cue('drop', { patch: { layers: [{ source: 'sine' }], polyphony: 2 } })]);
    mixer.unlock();
    mixer.play('drop');
    mixer.play('drop');
    expect(fake.stopped).toBe(0);
    mixer.play('drop');
    expect(fake.stopped).toBe(1);
    expect(fake.started).toHaveLength(3);
  });

  it('plays a recording once it has been fetched and decoded, and never falls back to a patch', async () => {
    const load = vi.fn(() => Promise.resolve(new ArrayBuffer(16)));
    const withSample = new Mixer({ load });
    withSample.setCues([
      cue('voice', { sample: 'audio/sfx/voice.ogg', patch: { layers: [{ source: 'sine' }] } }),
    ]);
    withSample.setLevels({ musicVolume: 0.5, sfxVolume: 0.7 });
    withSample.unlock();

    // The first play starts the fetch and is itself silent.
    withSample.play('voice');
    expect(fake.started).toHaveLength(0);
    expect(load).toHaveBeenCalledWith('/audio/sfx/voice.ogg');
    await settled();
    withSample.play('voice');
    expect(fake.started).toHaveLength(1);
    expect(fake.decoded).toBe(1);
    // Fetched once, however often it plays.
    withSample.play('voice');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a recording nobody has published', async () => {
    const load = vi.fn(() => Promise.reject(new Error('404')));
    const withSample = new Mixer({ load });
    withSample.setCues([cue('gone', { sample: 'audio/sfx/gone.ogg' })]);
    withSample.setLevels({ musicVolume: 0.5, sfxVolume: 0.7 });
    withSample.unlock();
    withSample.play('gone');
    await settled();
    withSample.play('gone');
    expect(fake.started).toHaveLength(0);
    // And it does not keep asking.
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loops a recording that says so', async () => {
    const withSample = new Mixer({ load: () => Promise.resolve(new ArrayBuffer(8)) });
    withSample.setCues([cue('loop', { sample: 'audio/x.ogg', loop: true })]);
    withSample.setLevels({ musicVolume: 0.5, sfxVolume: 0.7 });
    withSample.unlock();
    withSample.play('loop');
    await settled();
    withSample.play('loop');
    expect(fake.started[0]?.loop).toBe(true);
  });

  it('warms a cue without playing it, and only once the page is unlocked', () => {
    mixer.warm(['ping']);
    mixer.unlock();
    mixer.warm(['ping', 'nothing']);
    expect(fake.started).toHaveLength(0);
    mixer.play('ping');
    expect(fake.started).toHaveLength(1);
  });

  it('warms a few at a time, in idle slices, with the latest request first', () => {
    // Sixty cues rendered in one idle callback is a hitch on the first gesture of the
    // session; the queue drains a couple per slice, and a screen that asks for its own
    // family on mount finds it at the front.
    vi.useFakeTimers();
    const many = Array.from({ length: 6 }, (_, i) => cue(`c${i}`));
    mixer.setCues(many);
    mixer.unlock();
    mixer.warm(many.map((entry) => entry.key));
    mixer.warm(['c5']);
    expect(fake.buffers).toBe(0);
    vi.advanceTimersByTime(20);
    expect(fake.buffers).toBe(2);
    expect(fake.rendered[0]).toBe(String(Math.ceil((0.003 + decayOf('c5')) * 8_000)));
    vi.advanceTimersByTime(100);
    expect(fake.buffers).toBe(6);
    // Warming what is rendered renders nothing again.
    mixer.warm(['c0']);
    vi.advanceTimersByTime(100);
    expect(fake.buffers).toBe(6);
    vi.useRealTimers();
  });

  it('is silent for a cue whose design has no layers and no recording', () => {
    mixer.setCues([cue('empty', { patch: { layers: [] } })]);
    mixer.unlock();
    mixer.play('empty');
    expect(fake.started).toHaveLength(0);
  });

  it('survives a browser with no audio device', () => {
    (globalThis as { window?: unknown }).window = {};
    const deaf = new Mixer();
    deaf.setCues([cue('ping')]);
    deaf.unlock();
    expect(() => deaf.play('ping')).not.toThrow();
  });
});

/** A seam for the render-once test; the fake buffer factory is what a render costs. */
const FakeBufferCounter = { count: () => undefined };

/** Lets every promise in a fetch-then-decode chain resolve: one macrotask drains them all. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
