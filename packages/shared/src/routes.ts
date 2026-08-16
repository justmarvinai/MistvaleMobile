/**
 * Route constants shared by the server (registration) and client (calls), so a renamed
 * endpoint is a compile error rather than a 404 at runtime.
 */

export const API_PREFIX = '/api';
export const ADMIN_API_PREFIX = '/admin/api';

export const ROUTES = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    logout: '/auth/logout',
    logoutAll: '/auth/logout-all',
    me: '/auth/me',
    changePassword: '/auth/change-password',
  },
  player: {
    self: '/player',
    settings: '/player/settings',
  },
  health: {
    /** Cheap liveness probe for uptime monitors — no DB round-trip. */
    lite: '/health-lite',
    /** Full health payload (DB pool, memory, event-loop lag). Admin-gated. */
    full: '/health',
  },
} as const;

/** Absolute player-API path for a route constant. */
export function apiPath(route: string): string {
  return `${API_PREFIX}${route}`;
}

/** Absolute Admin-API path for a route constant. */
export function adminApiPath(route: string): string {
  return `${ADMIN_API_PREFIX}${route}`;
}
