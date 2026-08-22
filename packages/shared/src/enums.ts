/**
 * Game-wide enumerations.
 *
 * These are the closed vocabularies every layer agrees on (engine, server, client,
 * Admin Suite). Content rows reference these values by string; the DB stores them as
 * text with CHECK constraints, so adding a member is a migration + a release, never a
 * silent divergence. See docs/GAME_DESIGN.md and docs/DATA_MODEL.md.
 */

/** The four Breaths. Wheel: Ember > Verdant > Tide > Ember. Mist sits outside it. */
export const ELEMENTS = ['ember', 'tide', 'verdant', 'mist'] as const;
export type Element = (typeof ELEMENTS)[number];

/** What each element is strong against (`null` = outside the wheel). */
export const ELEMENT_BEATS: Readonly<Record<Element, Element | null>> = Object.freeze({
  ember: 'verdant',
  verdant: 'tide',
  tide: 'ember',
  mist: null,
});

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ROLES = ['attack', 'defense', 'hp', 'support'] as const;
export type Role = (typeof ROLES)[number];

/** Champion/relic star rank, 1–6. */
export const MIN_RANK = 1;
export const MAX_RANK = 6;

/**
 * Max champion level for each star rank (index 0 unused).
 *
 * Ten levels a star from ★3 up, and **★1 and ★2 share a cap of 20** (the owner's call,
 * 2026-08-22). The source game gives ★1 ten levels, which in practice is a rank nobody
 * spends anything on: a ★1 is food, and food that caps at 10 is food you rank up
 * immediately. Sharing the cap makes a ★1 worth levelling as food in its own right, which
 * is the only thing a ★1 is for here — Common champions never leave ★1–★2.
 */
export const LEVEL_CAP_BY_RANK: readonly number[] = [0, 20, 20, 30, 40, 50, 60];

/** The highest level any champion can reach, at ★6. */
export const MAX_CHAMPION_LEVEL = 60;

/** Relic slots: six armour slots plus three ascension-gated accessories. */
export const GEAR_SLOTS = [
  'weapon',
  'helm',
  'shield',
  'gauntlets',
  'cuirass',
  'boots',
  'ring',
  'amulet',
  'banner',
] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export const ACCESSORY_SLOTS: readonly GearSlot[] = ['ring', 'amulet', 'banner'];

/** Ascension level required before each accessory slot may be used. */
export const ACCESSORY_ASCENSION_REQUIREMENT: Readonly<Partial<Record<GearSlot, number>>> =
  Object.freeze({ ring: 2, amulet: 4, banner: 6 });

/** Combat stats. Percentage stats are stored as whole numbers (e.g. critRate 15 = 15%). */
export const STATS = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg', 'res', 'acc'] as const;
export type Stat = (typeof STATS)[number];

/** Account rank. Only `admin` may authenticate against the Admin API. */
export const ACCOUNT_RANKS = ['player', 'gamemaster', 'admin'] as const;
export type AccountRank = (typeof ACCOUNT_RANKS)[number];

export const ACCOUNT_STATUSES = ['active', 'banned'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Battle modes; `stageKey` semantics differ per mode (see docs/API_DESIGN.md). */
export const BATTLE_MODES = [
  'campaign',
  'dungeon',
  'springs',
  'proving',
  'arena',
  'tutorial',
  'practice',
] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];

export const DIFFICULTIES = ['normal', 'hard', 'brutal'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Wallet currencies held directly on the player row. */
export const CURRENCIES = ['silver', 'crystals', 'valorMedals'] as const;
export type Currency = (typeof CURRENCIES)[number];
