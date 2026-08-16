import { Button } from '@/ui/Button/Button';
import styles from './BootScreen.module.scss';

/**
 * The loading and connection-failure screen.
 *
 * Shown while the session is being restored, and after a failed boot so the player has
 * a plain explanation and a retry rather than an empty page.
 */
export function BootScreen({
  message = 'Parting the mist…',
  error,
  onRetry,
}: {
  message?: string;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <h1 className={styles.logo}>Mistvale</h1>

      {error ? (
        <div className={styles.error}>
          <p className={styles.errorText}>{error}</p>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.track} aria-hidden="true">
            <div className={styles.fill} />
          </div>
          <p className={styles.message}>{message}</p>
        </>
      )}
    </div>
  );
}
