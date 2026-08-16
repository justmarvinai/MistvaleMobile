import { create } from 'zustand';

/**
 * Ephemeral interface state: toasts now, modals and screen transitions as they arrive.
 * Nothing here is persisted or authoritative.
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Milliseconds before auto-dismissal; 0 keeps it until dismissed. */
  durationMs?: number;
  /** Server request id, shown on errors so players can quote it. */
  requestId?: string;
}

interface UiState {
  toasts: Toast[];
  pushToast(toast: Omit<Toast, 'id'>): number;
  dismissToast(id: number): void;
  clearToasts(): void;
}

let nextToastId = 1;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],

  pushToast(toast) {
    const id = nextToastId++;
    set((state) => ({
      // Cap the stack so a burst of failures cannot bury the screen.
      toasts: [...state.toasts, { ...toast, id }].slice(-4),
    }));
    return id;
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  clearToasts() {
    set({ toasts: [] });
  },
}));

/** Convenience helpers so call sites do not need the store shape. */
export const toast = {
  info: (message: string) => useUiStore.getState().pushToast({ message, tone: 'info' }),
  success: (message: string) => useUiStore.getState().pushToast({ message, tone: 'success' }),
  warning: (message: string) => useUiStore.getState().pushToast({ message, tone: 'warning' }),
  error: (message: string, requestId?: string) =>
    useUiStore.getState().pushToast({ message, tone: 'error', requestId, durationMs: 8000 }),
};
