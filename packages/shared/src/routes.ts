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
  content: {
    /** The full content bundle for the live revision (ETag-cached). */
    bundle: '/content',
  },
  roster: {
    /** The champions the player owns. */
    list: '/player/champions',
    /** The starter champions a new account may choose between. */
    starters: '/player/starters',
    /** One-time starter grant; idempotent once the roster is non-empty. */
    chooseStarter: '/player/starter',
    /** `/player/champions/:id` — one champion with its assembled stats and gear. */
    detail: (id: string) => `/player/champions/${encodeURIComponent(id)}`,
    /** `/player/champions/:id/level` — feed food champions for experience. */
    levelUp: (id: string) => `/player/champions/${encodeURIComponent(id)}/level`,
    /** `/player/champions/:id/rank-up` — spend same-rank food for a star. */
    rankUp: (id: string) => `/player/champions/${encodeURIComponent(id)}/rank-up`,
    /** `/player/champions/:id/ascend` — spend essences for an ascension level. */
    ascend: (id: string) => `/player/champions/${encodeURIComponent(id)}/ascend`,
    /** `/player/champions/:id/skill-upgrade` — spend a tome on a chosen skill. */
    skillUpgrade: (id: string) => `/player/champions/${encodeURIComponent(id)}/skill-upgrade`,
    /** `/player/champions/:id/flags` — lock and favourite toggles. */
    flags: (id: string) => `/player/champions/${encodeURIComponent(id)}/flags`,
    /** Release champions for silver. Locked ones are refused. */
    release: '/player/champions/release',
  },
  inventory: {
    /** Stackable items the player holds. */
    items: '/player/items',
  },
  gear: {
    /** Every relic the player owns, equipped or not. */
    list: '/player/gear',
    /** `/player/gear/:id/equip` — move a relic onto a champion, swapping the slot. */
    equip: (id: string) => `/player/gear/${encodeURIComponent(id)}/equip`,
    /** `/player/gear/:id/unequip` — always free (GAME_DESIGN §8). */
    unequip: (id: string) => `/player/gear/${encodeURIComponent(id)}/unequip`,
    /** `/player/gear/:id/upgrade` — one attempt, or a bulk-continue run. */
    upgrade: (id: string) => `/player/gear/${encodeURIComponent(id)}/upgrade`,
    /** Sell relics for silver. Equipped or locked ones are refused. */
    sell: '/player/gear/sell',
    /** `/player/gear/:id/lock` — protect a relic from a mass sell. */
    lock: (id: string) => `/player/gear/${encodeURIComponent(id)}/lock`,
    /** `/player/gear/:id/preview` — what equipping it would do, server-computed. */
    preview: (id: string) => `/player/gear/${encodeURIComponent(id)}/preview`,
  },
  summon: {
    /** Every published pool, with the player's sigils and mercy state folded in. */
    banners: '/summon/banners',
    /** `/summon/:key` — pull ×1 or ×10. */
    pull: (key: string) => `/summon/${encodeURIComponent(key)}`,
    /** The player's recent pulls. */
    history: '/summon/history',
    /** Owned/seen across the whole roster. */
    chronicle: '/chronicle',
  },
  shop: {
    /** `/shops/:key` — the player's current stock and its restock time. */
    stock: (key: string) => `/shops/${encodeURIComponent(key)}`,
    /** `/shops/:key/buy` — purchase one slot. */
    buy: (key: string) => `/shops/${encodeURIComponent(key)}/buy`,
    /** `/shops/:key/refresh` — pay crystals to re-roll the stock now. */
    refresh: (key: string) => `/shops/${encodeURIComponent(key)}/refresh`,
    /** `/shops/:key/unlock-slot` — permanently open a crystal slot. */
    unlockSlot: (key: string) => `/shops/${encodeURIComponent(key)}/unlock-slot`,
  },
  battle: {
    start: '/battles/start',
    /** The battle in progress, or null. Resume support after a refresh or crash. */
    active: '/battles/active',
    /** `/battles/:id` — the full session, including its event log. */
    byId: (id: string) => `/battles/${encodeURIComponent(id)}`,
    /** `/battles/:id/action` — take one turn, or run the rest out on auto. */
    action: (id: string) => `/battles/${encodeURIComponent(id)}/action`,
    retreat: (id: string) => `/battles/${encodeURIComponent(id)}/retreat`,
  },
} as const;

/** Admin API routes, consumed by the Admin Suite in the sibling repo. */
export const ADMIN_ROUTES = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  content: {
    /** `/content/:type` — list and create; `/content/:type/:key` — read, update, delete. */
    collection: (type: string) => `/content/${type}`,
    item: (type: string, key: string) => `/content/${type}/${encodeURIComponent(key)}`,
    validate: '/content/validate',
    diff: '/content/diff',
    publish: '/content/publish',
    revert: '/content/revert',
    revisions: '/content/revisions',
    discard: '/content/discard',
  },
  stats: {
    overview: '/stats/overview',
  },
} as const;

/**
 * The Fastify pattern for a parameterised route.
 *
 * The builders above percent-encode their argument, which is right for a caller and
 * wrong for a registration — `encodeURIComponent(':id')` is `%3Aid`, and the server ends
 * up serving a route nothing can reach. This runs the same builder with a sentinel and
 * puts the parameter back, so a registration and the call that hits it still come from
 * one definition and a rename is still a compile error.
 */
export function routePattern(build: (value: string) => string, name = 'id'): string {
  // A NUL cannot occur in a real path segment, so substituting it back is unambiguous.
  // Written as an escape rather than a literal: an invisible byte in source is a trap.
  const sentinel = '\u0000';
  return build(sentinel).replace(encodeURIComponent(sentinel), `:${name}`);
}

/** Absolute player-API path for a route constant. */
export function apiPath(route: string): string {
  return `${API_PREFIX}${route}`;
}

/** Absolute Admin-API path for a route constant. */
export function adminApiPath(route: string): string {
  return `${ADMIN_API_PREFIX}${route}`;
}
