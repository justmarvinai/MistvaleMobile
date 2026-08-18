import { useEffect } from 'react';
import { Modal } from '@/ui/Modal/Modal';
import { CUE, playCue } from '@/audio';
import { Button } from '@/ui/Button/Button';
import { useUnlockStore } from '@/state/unlockStore';
import { useNavStore } from '@/state/navStore';
import styles from './UnlockCelebration.module.scss';

/**
 * "Something opened."
 *
 * The moment the whole level-gating structure exists to create, and until now it passed in
 * silence: a dock tile that was shrouded yesterday was simply lit today. One card per
 * unlock, queued — level 8 hands over the Arena *and* the Hall of Valor, and merging them
 * into "2 things unlocked" would be worth less than either.
 *
 * A modal on purpose. Everything else the game says arrives as a toast that can be missed
 * while a player is reading their loot, and this is the one announcement that is worth a
 * beat of the player's whole attention.
 */
export function UnlockCelebration(): JSX.Element | null {
  const unlock = useUnlockStore((state) => state.queue[0] ?? null);
  const dismiss = useUnlockStore((state) => state.dismiss);
  const setScreen = useNavStore((state) => state.setScreen);
  const screen = useNavStore((state) => state.screen);

  // The card's own fanfare, over the modal's ordinary open cue. Keyed on the flag so a
  // queue of two — level 8 opens the Arena and the Hall together — sounds twice.
  const showing = unlock !== null && screen !== 'battle';
  const flag = unlock?.key ?? '';
  useEffect(() => {
    if (showing) playCue(CUE.unlock);
  }, [showing, flag]);

  if (!unlock) return null;
  // Never over a fight. A level-up almost always arrives *from* one, and the results are
  // already a modal — stacking a second on top would bury the loot the player is reading
  // under news about a screen they have not asked for yet. The queue waits until they come
  // back out, which is a better moment for it anyway.
  //
  // This is a decision about attention, not a workaround for layering: the overlay stack
  // would put the card on top correctly, and on top is precisely the wrong place for it.
  if (screen === 'battle') return null;

  const goThere = (): void => {
    if (unlock.screen) setScreen(unlock.screen);
    dismiss();
  };

  return (
    <Modal open title="The mist thins" onClose={dismiss}>
      <div className={styles.body}>
        <p className={styles.level}>Level {unlock.level}</p>
        <h3 className={styles.title}>{unlock.title}</h3>
        <p className={styles.blurb}>{unlock.blurb}</p>

        <div className={styles.actions}>
          <Button variant="ghost" onClick={dismiss}>
            Later
          </Button>
          {unlock.screen && (
            <Button variant="primary" onClick={goThere}>
              Have a look
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
