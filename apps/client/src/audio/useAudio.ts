import { useEffect } from 'react';
import { MUSIC } from '@mistvale/shared';
import { mixer } from './mixer';
import { mediaUrl, music, narration } from './tracks';
import { useContentStore } from '@/state/contentStore';
import { useNavStore } from '@/state/navStore';
import { usePlayerStore } from '@/state/playerStore';

/**
 * Keeps the mixer fed, and lets it start.
 *
 * Mounted once by the shell. Three jobs, all of them about handing the mixer things it
 * must not go and fetch for itself — an audio device that reaches into stores is one that
 * cannot be tested, and one that plays during a test run nobody asked it to.
 *
 * The unlock deserves its own note. Browsers refuse an `AudioContext` that was not started
 * from a real user gesture, and a refused one *stays* refused for the life of the page —
 * so the listeners below are the difference between a game with sound and a game that is
 * silent until reload. They are capture-phase and passive, they run once, and they are on
 * `pointerdown` and `keydown` because those are the two ways anybody reaches this game.
 */
export function useAudio(): void {
  const cues = useContentStore((state) => state.bundle?.soundCues);
  const musicVolume = usePlayerStore((state) => state.settings.musicVolume);
  const sfxVolume = usePlayerStore((state) => state.settings.sfxVolume);
  const voiceVolume = usePlayerStore((state) => state.settings.voiceVolume);

  useEffect(() => {
    mixer.setCues(cues ?? []);
  }, [cues]);

  useEffect(() => {
    mixer.setLevels({ musicVolume, sfxVolume });
    music.setLevel(musicVolume);
    // A spoken line answers to its own fader. It rode the effects one at first, which is
    // wrong in both directions: turning the interface down should not silence the narrator,
    // and turning the narrator up should not make every button click shout.
    narration.setLevel(voiceVolume);
  }, [musicVolume, sfxVolume, voiceVolume]);

  /**
   * Which track is playing, decided by one question: is the player in a fight?
   *
   * Every fighting mode in the game — campaign, the Depths, the Arena, the practice sandbox,
   * the tutorial's cold open — runs on the battle screen, so the screen *is* the answer and
   * there is nothing to keep in step. The two tracks are ordinary content, so an operator
   * swaps either in Admin without a deploy, and a cue with no file behind it leaves the game
   * quiet exactly as it was.
   */
  const inBattle = useNavStore((state) => state.screen) === 'battle';
  useEffect(() => {
    const key = inBattle ? MUSIC.combat : MUSIC.field;
    const track = mediaUrl(cues?.find((cue) => cue.key === key && cue.active)?.sample ?? '');
    if (track) music.play(track);
    else music.stop();
  }, [inBattle, cues]);

  useEffect(() => {
    const unlock = (): void => {
      mixer.unlock();
      music.unlock();
      narration.unlock();
    };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);
}
