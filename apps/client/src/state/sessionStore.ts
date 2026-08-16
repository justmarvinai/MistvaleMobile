import { create } from 'zustand';
import {
  ROUTES,
  type AccountSummary,
  type LoginRequest,
  type PlayerSummary,
  type RegisterRequest,
  type SessionResponse,
} from '@mistvale/shared';
import { api, ApiRequestError } from '@/api/client';

/**
 * Authentication state.
 *
 * The session lives in an httpOnly cookie the page cannot read, so "am I signed in?" is
 * answered by asking the server once at boot and remembering the answer here.
 */

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  account: AccountSummary | null;
  player: PlayerSummary | null;
  /** True while a sign-in/registration request is in flight. */
  submitting: boolean;

  restore(): Promise<void>;
  register(input: RegisterRequest): Promise<void>;
  login(input: LoginRequest): Promise<void>;
  logout(): Promise<void>;
  /** Applies a fresher player snapshot from any endpoint that returns one. */
  setPlayer(player: PlayerSummary): void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  account: null,
  player: null,
  submitting: false,

  async restore() {
    try {
      const session = await api.get<SessionResponse>(ROUTES.auth.me);
      set({ status: 'authenticated', account: session.account, player: session.player });
    } catch (error) {
      // A missing or expired session is the normal path for a first visit.
      if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED') {
        set({ status: 'anonymous', account: null, player: null });
        return;
      }
      // Anything else (server down, network) also leaves us signed out, but the boot
      // screen surfaces the failure separately.
      set({ status: 'anonymous', account: null, player: null });
      throw error;
    }
  },

  async register(input) {
    set({ submitting: true });
    try {
      const session = await api.post<SessionResponse>(ROUTES.auth.register, input);
      set({ status: 'authenticated', account: session.account, player: session.player });
    } finally {
      set({ submitting: false });
    }
  },

  async login(input) {
    set({ submitting: true });
    try {
      const session = await api.post<SessionResponse>(ROUTES.auth.login, input);
      set({ status: 'authenticated', account: session.account, player: session.player });
    } finally {
      set({ submitting: false });
    }
  },

  async logout() {
    try {
      await api.post(ROUTES.auth.logout);
    } finally {
      // Even if the call fails, drop local state — the player asked to leave.
      set({ status: 'anonymous', account: null, player: null });
    }
  },

  setPlayer(player) {
    set({ player });
  },
}));
