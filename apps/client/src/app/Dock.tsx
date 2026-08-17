import { DOCK_SCREENS, isScreenUnlocked, type ScreenId } from './screens';
import { usePlayerStore, type DockBadges } from '@/state/playerStore';
import { highlightable } from './highlight';
import styles from './Dock.module.scss';

/**
 * The bottom navigation dock.
 *
 * Locked destinations stay visible behind a mist shroud rather than disappearing —
 * seeing what is coming is part of the pull forward (docs/UI_UX_DESIGN.md §2).
 * Number keys 1-9 jump straight to a slot.
 *
 * Pips come off the player snapshot rather than a poll: the shell re-fetches it after
 * every action, which is exactly when something becomes claimable (UI_UX §1.3).
 */
export function Dock({
  current,
  onNavigate,
}: {
  current: ScreenId;
  onNavigate: (id: ScreenId) => void;
}) {
  const unlocks = usePlayerStore((state) => state.unlocks);
  const badges = usePlayerStore((state) => state.badges);

  return (
    <nav className={styles.dock} aria-label="Main navigation">
      {DOCK_SCREENS.map((screen, index) => {
        const unlocked = isScreenUnlocked(screen, unlocks);
        const active = current === screen.id;
        const waiting = unlocked ? (badges[screen.id as keyof DockBadges] ?? 0) : 0;

        return (
          <button
            key={screen.id}
            type="button"
            {...highlightable(`dock:${screen.id}`)}
            className={[styles.item, active ? styles.active : '', unlocked ? '' : styles.locked]
              .filter(Boolean)
              .join(' ')}
            onClick={() => unlocked && onNavigate(screen.id)}
            aria-current={active ? 'page' : undefined}
            aria-disabled={!unlocked}
            title={unlocked ? screen.label : (screen.lockedHint ?? 'Still locked')}
          >
            <span className={styles.glyph} aria-hidden="true">
              {unlocked ? screen.glyph : '🔒'}
            </span>
            <span className={styles.label}>{screen.label}</span>
            {waiting > 0 && (
              <span className={styles.pip} aria-label={`${waiting} waiting`}>
                {waiting}
              </span>
            )}
            {index < 9 && (
              <span className={styles.hotkey} aria-hidden="true">
                {index + 1}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
