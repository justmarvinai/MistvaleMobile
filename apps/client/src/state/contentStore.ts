import { create } from 'zustand';
import { ROUTES, type ChampionDef, type ContentBundle, type SkillDef } from '@mistvale/shared';
import { api, getContentRevision } from '@/api/client';
import { readCachedBundle, writeCachedBundle } from '@/api/bundleCache';

/**
 * Static game content.
 *
 * Fetched once per content revision and cached in IndexedDB, so a returning player pays
 * nothing for it. Every API response carries `rev`; when a publish moves it, the client
 * notices and re-fetches (docs/ARCHITECTURE.md §4.4).
 *
 * Content is presentation only — names, kits, icons, stage layouts. Outcomes are always
 * computed on the server; nothing here lets the client decide anything.
 */

interface ContentState {
  bundle: ContentBundle | null;
  loading: boolean;
  error: string | null;

  /** Fetches the bundle, preferring the cache when the revision still matches. */
  ensureLoaded(): Promise<void>;
  /** Re-fetches if the server has moved past the revision we hold. */
  refreshIfStale(): Promise<void>;

  championByKey(key: string): ChampionDef | undefined;
  skillByKey(key: string): SkillDef | undefined;
  config<T = unknown>(key: string, fallback: T): T;
}

export const useContentStore = create<ContentState>((set, get) => ({
  bundle: null,
  loading: false,
  error: null,

  async ensureLoaded() {
    if (get().bundle || get().loading) return;
    set({ loading: true, error: null });

    try {
      // A cached bundle is only trusted while its revision matches what the server
      // last told us; otherwise it is stale by definition.
      const cached = await readCachedBundle();
      const serverRev = getContentRevision();
      if (cached && (serverRev === 0 || cached.rev === serverRev)) {
        set({ bundle: cached, loading: false });
        return;
      }

      const bundle = await api.get<ContentBundle>(ROUTES.content.bundle);
      await writeCachedBundle(bundle);
      set({ bundle, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load game content.',
      });
      throw error;
    }
  },

  async refreshIfStale() {
    const current = get().bundle;
    const serverRev = getContentRevision();
    if (current && serverRev !== 0 && current.rev === serverRev) return;

    const bundle = await api.get<ContentBundle>(ROUTES.content.bundle);
    await writeCachedBundle(bundle);
    set({ bundle });
  },

  championByKey(key) {
    return get().bundle?.champions.find((champion) => champion.key === key);
  },

  skillByKey(key) {
    return get().bundle?.skills.find((skill) => skill.key === key);
  },

  config<T>(key: string, fallback: T): T {
    const value = get().bundle?.config[key];
    return (value as T | undefined) ?? fallback;
  },
}));
