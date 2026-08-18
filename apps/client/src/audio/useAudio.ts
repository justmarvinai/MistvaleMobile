import { useEffect } from 'react';
import { mixer } from './mixer';
import { useContentStore } from '@/state/contentStore';
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

  useEffect(() => {
    mixer.setCues(cues ?? []);
  }, [cues]);

  useEffect(() => {
    mixer.setLevels({ musicVolume, sfxVolume });
  }, [musicVolume, sfxVolume]);

  useEffect(() => {
    const unlock = (): void => mixer.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true, once: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);
}
