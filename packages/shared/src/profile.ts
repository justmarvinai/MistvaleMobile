import { z } from 'zod';
import { ARENA_TIERS } from './arena';
import { ELEMENTS, RARITIES, ROLES } from './enums';

/**
 * The public profile card.
 *
 * What one player may see of another: who they are, how far they have come, and the four
 * champions they chose to be known by. Nothing else — no wallet, no account name, no
 * inventory, and no hint of whether the card belongs to a bot, which is the owner's
 * standing decision about the ladder (GAME_DESIGN §9.3).
 *
 * The card is deliberately *earned facts* rather than a summary of spending: level, arena
 * standing, how much of the roster has been met, how far into the campaign. A card that
 * led with silver would make the game about the wrong number.
 */

export const showcaseChampionSchema = z.object({
  /** `player_champions` id — stable, and what the owner's picker writes back. */
  id: z.string(),
  championKey: z.string(),
  name: z.string(),
  rarity: z.enum(RARITIES),
  element: z.enum(ELEMENTS),
  role: z.enum(ROLES),
  level: z.number().int(),
  rank: z.number().int(),
  ascension: z.number().int(),
  /** Assembled power, the same number the Arena shows on an offer. */
  power: z.number().int(),
  assetKey: z.string(),
});
export type ShowcaseChampion = z.infer<typeof showcaseChampionSchema>;

export const publicProfileSchema = z.object({
  playerId: z.string(),
  profileName: z.string(),
  /** The honorific the Valewarden's Path awards, if this account has finished it. */
  title: z.string().nullable(),
  level: z.number().int(),
  /** Null for an account that has never entered the Arena. */
  arena: z
    .object({
      rating: z.number().int(),
      tier: z.enum(ARENA_TIERS),
      /** Position on the live ladder, or null outside the top of it. */
      position: z.number().int().nullable(),
    })
    .nullable(),
  /** Champions owned, against how many the game holds — food units excluded from both. */
  championsOwned: z.number().int(),
  championsTotal: z.number().int(),
  /** The furthest campaign stage cleared, phrased as a player says it: "7-4 Hard". */
  furthestStage: z.string().nullable(),
  /** Total campaign stars, which is the one number that tracks *thoroughness*. */
  stars: z.number().int(),
  showcase: z.array(showcaseChampionSchema),
  /** ISO-8601 of the day the account was made. */
  joinedAt: z.string(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const setShowcaseRequestSchema = z.object({
  /**
   * `player_champions` ids, in the order they should be shown. Up to four; an empty list
   * hands the choice back to the game, which shows the strongest instead.
   */
  championIds: z.array(z.string().uuid()).max(4),
});
export type SetShowcaseRequest = z.infer<typeof setShowcaseRequestSchema>;
