import { z } from 'zod';

/**
 * Player-scoped contracts that are not part of the auth flow.
 * The full snapshot grows across phases (roster, inventory, unlocks); the settings
 * shape below is stable from P0 because the client persists it immediately.
 */

export const playerSettingsSchema = z.object({
  musicVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
  /** Preferred battle playback speed. */
  battleSpeed: z.union([z.literal(1), z.literal(2)]),
  /** Honour the OS "reduce motion" preference, or force it on. */
  reducedMotion: z.boolean(),
  /** Adds shape glyphs to element indicators for colour-blind readability. */
  colorblindGlyphs: z.boolean(),
  /** Skip battle intro/outro flourishes. */
  fastResults: z.boolean(),
  /**
   * Draw the battlefield with the browser instead of with the graphics card.
   *
   * The battlefield is the one part of Mistvale that needs a graphics context, and a
   * machine can fail to give it a working one in more ways than "it has none": hardware
   * acceleration switched off, a driver the browser has blocklisted, a software renderer
   * that draws half the field and not the other half. All of those arrive as the same
   * thing — a correct fight over a black rectangle — and none of them can be told apart
   * from inside the page.
   *
   * So this is a switch rather than a detection. On, the fight is drawn as ordinary DOM:
   * no idle loops and no fog, every champion where they stand and every health bar where
   * it belongs. The client turns it on by itself when there is provably no context at
   * all; this is for the machines where there is one and it does not work.
   */
  simpleBattlefield: z.boolean(),
});
export type PlayerSettings = z.infer<typeof playerSettingsSchema>;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = Object.freeze({
  musicVolume: 0.5,
  sfxVolume: 0.8,
  battleSpeed: 1,
  reducedMotion: false,
  colorblindGlyphs: false,
  fastResults: false,
  simpleBattlefield: false,
});

export const updateSettingsRequestSchema = playerSettingsSchema.partial();
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

/**
 * Feature unlocks, driven by account level (docs/GAME_DESIGN.md §12). The server
 * computes these so the client never has to know the gating rules.
 */
export interface UnlockFlags {
  loginCalendar: boolean;
  relicUpgrading: boolean;
  quests: boolean;
  bazaar: boolean;
  multiBattle: boolean;
  events: boolean;
  arena: boolean;
  hallOfValor: boolean;
  chronicle: boolean;
  springs: boolean;
  dungeons: boolean;
  provingGrounds: boolean;
  masteries: boolean;
}

/** Account level at which each feature unlocks. Mirrored in game_config from P1. */
export const UNLOCK_LEVELS: Readonly<Record<keyof UnlockFlags, number>> = Object.freeze({
  loginCalendar: 2,
  relicUpgrading: 3,
  quests: 4,
  bazaar: 5,
  multiBattle: 6,
  events: 7,
  arena: 8,
  hallOfValor: 8,
  chronicle: 9,
  springs: 10,
  dungeons: 12,
  provingGrounds: 14,
  masteries: 14,
});

export function computeUnlocks(level: number): UnlockFlags {
  const flags = {} as UnlockFlags;
  for (const key of Object.keys(UNLOCK_LEVELS) as (keyof UnlockFlags)[]) {
    flags[key] = level >= UNLOCK_LEVELS[key];
  }
  return flags;
}
