import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackChannel, mediaUrl } from './tracks';

/**
 * The streamed side of the audio layer, against a fake `Audio`.
 *
 * There is no audio device in a Node test run and there does not need to be: everything
 * worth pinning is about *which file is attached and when* — a track that restarts on every
 * render, a voice that keeps talking over the next tutorial step, a muted channel still
 * streaming eight megabytes nobody can hear. Those are all bugs a player would report, and
 * none of them needs a speaker to catch.
 */

interface FakeAudio {
  src: string;
  loop: boolean;
  volume: number;
  played: number;
  paused: boolean;
}

const built: FakeAudio[] = [];

function installFakeAudio(): void {
  built.length = 0;
  class Fake {
    src: string;
    loop = false;
    volume = 1;
    preload = '';
    played = 0;
    paused = false;
    constructor(src: string) {
      this.src = src;
      built.push(this as unknown as FakeAudio);
    }
    play(): Promise<void> {
      this.played += 1;
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
    addEventListener(): void {}
  }
  vi.stubGlobal('Audio', Fake);
}

/** The channel as a player would have it: unlocked, with the fader up. */
function ready(loop: boolean): TrackChannel {
  const channel = new TrackChannel(loop);
  channel.setLevel(0.8);
  channel.unlock();
  return channel;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a streamed channel', () => {
  it('plays nothing until the page has been interacted with', () => {
    installFakeAudio();
    const channel = new TrackChannel(true);
    channel.setLevel(0.8);
    channel.play('/audio/music/field.mp3');
    expect(built).toHaveLength(0);

    // …and starts what was asked for once it is allowed to. A track differs from a cue here
    // on purpose: a cue asked for early is dropped, because a click the player never made
    // must not be heard late. Music was always meant to be playing.
    channel.unlock();
    expect(built).toHaveLength(1);
    expect(built[0]?.src).toBe('/audio/music/field.mp3');
    expect(built[0]?.played).toBe(1);
  });

  it('loops when it is music and does not when it is a voice', () => {
    installFakeAudio();
    ready(true).play('/a.mp3');
    ready(false).play('/b.mp3');
    expect(built[0]?.loop).toBe(true);
    expect(built[1]?.loop).toBe(false);
  });

  it('ignores a repeat of what is already playing', () => {
    installFakeAudio();
    const channel = ready(true);
    channel.play('/audio/music/field.mp3');
    channel.play('/audio/music/field.mp3');
    channel.play('/audio/music/field.mp3');
    // The shell re-renders for a hundred reasons and none should restart the music.
    expect(built).toHaveLength(1);
  });

  it('crossfades to a different track rather than cutting', () => {
    vi.useFakeTimers();
    installFakeAudio();
    const channel = ready(true);
    channel.play('/field.mp3');
    channel.play('/battle.mp3');

    expect(built).toHaveLength(2);
    // The new one starts silent and the old one is still going: that is the fade.
    expect(built[1]?.volume).toBe(0);
    expect(built[0]?.paused).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(built[1]?.volume).toBeCloseTo(0.8, 5);
    expect(built[0]?.paused).toBe(true);
    expect(built[0]?.src).toBe('');
  });

  it('cuts instantly when asked to, which is what a cancelled line needs', () => {
    installFakeAudio();
    const channel = ready(false);
    channel.play('/line.mp3');
    channel.cut();
    // No fade: the step is gone, and half a second of the Wardenmaster still explaining
    // relics over the next beat is worse than a hard stop.
    expect(built[0]?.paused).toBe(true);
    expect(channel.playing).toBe(false);
    expect(channel.source).toBeNull();
  });

  it('drops the file when the fader reaches zero, rather than streaming it inaudibly', () => {
    installFakeAudio();
    const channel = ready(true);
    channel.play('/field.mp3');
    channel.setLevel(0);
    expect(built[0]?.paused).toBe(true);
    expect(channel.playing).toBe(false);
  });

  it('starts again when the fader comes back up', () => {
    installFakeAudio();
    const channel = ready(true);
    channel.play('/field.mp3');
    channel.setLevel(0);
    channel.setLevel(0.6);
    expect(built).toHaveLength(2);
    expect(built[1]?.src).toBe('/field.mp3');
    expect(built[1]?.volume).toBeCloseTo(0.6, 5);
  });

  it('follows the fader while it is playing', () => {
    installFakeAudio();
    const channel = ready(true);
    channel.play('/field.mp3');
    channel.setLevel(0.25);
    expect(built[0]?.volume).toBeCloseTo(0.25, 5);
  });
});

describe('the path a published file is served from', () => {
  it('turns what the asset tool wrote into a URL', () => {
    expect(mediaUrl('audio/music/background_music_outside_combat.mp3')).toBe(
      '/audio/music/background_music_outside_combat.mp3',
    );
  });

  it('accepts a leading slash, which is the obvious thing to type', () => {
    expect(mediaUrl('/portraits/wardenmaster_avatar.jpg')).toBe(
      '/portraits/wardenmaster_avatar.jpg',
    );
  });

  it('answers null for nothing, which is how "this step has no recording" arrives', () => {
    expect(mediaUrl('')).toBeNull();
    expect(mediaUrl('   ')).toBeNull();
  });
});
