import { useEffect } from 'react';
import { useUiStore, type Toast as ToastData } from '@/state/uiStore';
import styles from './Toast.module.scss';

/**
 * Transient notifications.
 *
 * Error toasts carry the server's request id so a player can quote it in a bug report,
 * which is the whole reason every response echoes one.
 */
export function ToastHost() {
  const toasts = useUiStore((state) => state.toasts);

  return (
    <div className={styles.host} role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: ToastData }) {
  const dismiss = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (toast.durationMs === 0) return;
    const timer = window.setTimeout(() => dismiss(toast.id), toast.durationMs ?? 5000);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismiss]);

  return (
    <output className={`${styles.toast} ${styles[toast.tone]}`}>
      <div className={styles.content}>
        <p className={styles.message}>{toast.message}</p>
        {toast.requestId && <p className={styles.requestId}>Code {toast.requestId}</p>}
      </div>
      <button
        type="button"
        className={styles.close}
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </output>
  );
}
