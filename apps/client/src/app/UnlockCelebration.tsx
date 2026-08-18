import { Modal } from '@/ui/Modal/Modal';
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

  if (!unlock) return null;

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
