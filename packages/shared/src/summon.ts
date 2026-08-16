import { z } from 'zod';
import { RARITIES } from './enums';
import { rosterChampionSchema } from './champion';

/**
 * Summoning: the Mistgate.
 *
 * The one system where a player's trust is the whole product, so everything here is built
 * to be *checkable*: the odds panel renders the published rates verbatim, the mercy
 * counters the client shows are the ones the server rolled against, and every pull is
 * written to a history a support query can read back.
 */

/** How close a rarity's mercy is to paying out, as the player is shown it. */
export const pityStateSchema = z.object({
  rarity: z.enum(RARITIES),
  /** Summons since this rarity last landed, on this pool. */
  since: z.number().int(),
  /** Pulls without it before the bonus starts accruing. */
  after: z.number().int(),
  /** Added to the base chance per pull past the threshold. */
  step: z.number(),
  /** What the bonus is worth right now — 0 until the threshold is passed. */
  currentBonus: z.number(),
  /** The chance the next pull will actually roll against, base plus bonus. */
  effectiveChance: z.number(),
});
export type PityState = z.infer<typeof pityStateSchema>;

/** A pool as the Mistgate shows it: what it costs, what it gives, where mercy stands. */
export const summonBannerSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  sigilKey: z.string(),
  /** How many sigils the player holds for this pool. */
  sigilsHeld: z.number().int(),
  rates: z.record(z.string(), z.number()),
  pity: z.array(pityStateSchema),
  /** Champion keys flagged as rate-up, for the featured strip. */
  featured: z.array(z.string()),
  /** Which rarity a ×10 guarantees at least once, if any. */
  tenPullFloor: z.enum(RARITIES).nullable(),
  /** Every champion that can appear, by rarity, for the full-odds disclosure. */
  contents: z.record(z.string(), z.array(z.string())),
});
export type SummonBanner = z.infer<typeof summonBannerSchema>;

/** One champion out of the mist. */
export const summonResultSchema = z.object({
  championKey: z.string(),
  rarity: z.enum(RARITIES),
  /** First time this champion has ever been owned — the NEW badge. */
  isNew: z.boolean(),
  /** True when mercy, not the base rate, is what produced this rarity. */
  fromMercy: z.boolean(),
  /** The roster row, or null when the roster was full and it went to the mailbox. */
  champion: rosterChampionSchema.nullable(),
});
export type SummonResult = z.infer<typeof summonResultSchema>;

export const summonRequestSchema = z.object({
  /** 1 or 10. A ×10 spends ten sigils and honours the pool's floor. */
  count: z.union([z.literal(1), z.literal(10)]),
  actionId: z.string().min(8).max(64),
});
export type SummonRequest = z.infer<typeof summonRequestSchema>;

export const summonResponseSchema = z.object({
  results: z.array(summonResultSchema),
  /** The banner after the pull, so the odds panel updates without a second call. */
  banner: summonBannerSchema,
  /** Sigils remaining of this pool's type. */
  sigilsHeld: z.number().int(),
});
export type SummonResponse = z.infer<typeof summonResponseSchema>;

/** One line of the summon history. */
export const summonHistoryEntrySchema = z.object({
  id: z.string(),
  poolKey: z.string(),
  championKey: z.string(),
  rarity: z.enum(RARITIES),
  fromMercy: z.boolean(),
  createdAt: z.string(),
});
export type SummonHistoryEntry = z.infer<typeof summonHistoryEntrySchema>;

// ── The Chronicle ───────────────────────────────────────────────────────────

/**
 * A champion's standing in the collection.
 *
 * `seen` covers anything the player has met — summoned, fought or been shown — so the
 * Chronicle reads as a record of the world rather than a list of receipts. Food units are
 * excluded from the completion count (GAME_DESIGN §10).
 */
export const chronicleEntrySchema = z.object({
  championKey: z.string(),
  owned: z.boolean(),
  /** How many copies are held, including ones reserved as food. */
  copies: z.number().int(),
  /** The highest star rank reached on any copy. */
  bestRank: z.number().int(),
  seen: z.boolean(),
});
export type ChronicleEntry = z.infer<typeof chronicleEntrySchema>;

export const chronicleSchema = z.object({
  entries: z.array(chronicleEntrySchema),
  /** Collectable champions owned, and how many there are — food excluded. */
  owned: z.number().int(),
  total: z.number().int(),
});
export type Chronicle = z.infer<typeof chronicleSchema>;
