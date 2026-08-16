import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { GearStatLine } from '@mistvale/shared';
import { players } from './accounts';
import { playerChampions } from './game';

/**
 * What a player owns besides champions: stackable items, relics, and shop stock.
 *
 * The dividing line between these and `content_entries` is the same as everywhere else —
 * an `item_defs` row says what a Lesser Ember Essence *is*, a `player_items` row says how
 * many of them you have (docs/DATA_MODEL.md §4).
 */

/**
 * Stackable items: sigils, essences, tomes, emblems, consumables.
 *
 * One row per player per item key, upserted on grant. `quantity` is a bigint because
 * silver-adjacent stacks in this genre get large, and a cheap `check` keeps a bug from
 * ever leaving a negative balance behind rather than discovering it months later.
 */
export const playerItems = pgTable(
  'player_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `item_defs` key. Not a foreign key: content lives in a JSONB table. */
    itemKey: text('item_key').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('player_items_player_item_key').on(table.playerId, table.itemKey),
    check('player_items_quantity_check', sql`${table.quantity} >= 0`),
  ],
);

/**
 * One owned relic.
 *
 * Unlike a champion, a relic's numbers are *rolled*, not derived: the main stat and each
 * substat are frozen into the row when it drops and only ever change through an upgrade.
 * That is deliberate. If they were recomputed from the stat tables on read, retuning a
 * table would restat every piece every player already owns — the one place in this schema
 * where "content is data" must not mean "content is live".
 *
 * `equipped_champion_id` is the only link to a champion; a partial unique index enforces
 * one relic per slot per champion, which is what makes an equip a single atomic swap
 * rather than a delete-then-insert that could fail halfway.
 */
export const gearInstances = pgTable(
  'gear_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    /** `gear_set_defs` key. */
    setKey: text('set_key').notNull(),
    /** One of GEAR_SLOTS. */
    slot: text('slot').notNull(),
    rank: smallint('rank').notNull(),
    rarity: text('rarity').notNull(),
    level: smallint('level').notNull().default(0),

    mainStat: jsonb('main_stat').notNull().$type<GearStatLine>(),
    substats: jsonb('substats').notNull().default([]).$type<GearStatLine[]>(),

    equippedChampionId: uuid('equipped_champion_id').references(() => playerChampions.id, {
      onDelete: 'set null',
    }),
    /** Locked relics survive a mass sell — the guard against a misclick on a farmed piece. */
    locked: boolean('locked').notNull().default(false),

    /** Where it came from: a stage key, a shop key, `starter`. */
    source: text('source').notNull().default(''),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('gear_instances_player_idx').on(table.playerId),
    index('gear_instances_equipped_idx').on(table.equippedChampionId),
    // A champion holds at most one relic per slot. Partial, because unequipped relics all
    // have a null champion and would otherwise collide with each other.
    uniqueIndex('gear_instances_slot_key')
      .on(table.equippedChampionId, table.slot)
      .where(sql`${table.equippedChampionId} is not null`),
    check('gear_instances_rank_check', sql`${table.rank} >= 1 and ${table.rank} <= 6`),
    check('gear_instances_level_check', sql`${table.level} >= 0 and ${table.level} <= 16`),
  ],
);

/**
 * A player's stock in one shop.
 *
 * Rolled server-side and stored, not derived on read: what a player was offered has to
 * still be there when they tap it, and has to be as auditable afterwards as a drop. The
 * whole slot list is one JSONB document because it is always read and written together.
 */
export const shopStates = pgTable(
  'shop_states',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `shop_defs` key. */
    shopKey: text('shop_key').notNull(),

    /** When the current stock expires. A read past this rolls a new one. */
    restocksAt: timestamp('restocks_at', { withTimezone: true }).notNull(),
    /** Crystal slots opened permanently, beyond the free ones. */
    unlockedSlots: smallint('unlocked_slots').notNull().default(0),
    slots: jsonb('slots').notNull().default([]),
    /** Per-offer purchase counts since the last daily reset, for `dailyLimit`. */
    dailyCounts: jsonb('daily_counts').notNull().default({}),
    dailyCountsOn: text('daily_counts_on').notNull().default(''),

    /** Seed the current stock was rolled from, so a support query can reproduce it. */
    seed: bigint('seed', { mode: 'number' }).notNull().default(0),
    /** The content revision the stock was rolled against. */
    contentRev: integer('content_rev').notNull().default(0),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('shop_states_player_shop_key').on(table.playerId, table.shopKey)],
);

export type PlayerItemRow = typeof playerItems.$inferSelect;
export type GearInstanceRow = typeof gearInstances.$inferSelect;
export type ShopStateRow = typeof shopStates.$inferSelect;

/**
 * Every pull, kept.
 *
 * The pity state is derivable from this table, and the cached counters on
 * `players.summon_pity` are only an optimisation — but the history is what a support
 * question ("I pulled forty times and got nothing") is answered from, and what makes the
 * advertised rates auditable after the fact rather than merely asserted
 * (docs/DATA_MODEL.md §4).
 */
export const summonHistory = pgTable(
  'summon_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    /** `summon_pool_defs` key. */
    poolKey: text('pool_key').notNull(),
    sigilItemKey: text('sigil_item_key').notNull(),
    championKey: text('champion_key').notNull(),
    rarity: text('rarity').notNull(),

    /** True when mercy, not the base rate, produced this rarity. */
    fromMercy: boolean('from_mercy').notNull().default(false),
    /** Counters as they stood immediately after this pull. */
    pityAfter: jsonb('pity_after').notNull().default({}),
    /** The content revision the pool was rolled against. */
    contentRev: integer('content_rev').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('summon_history_player_idx').on(table.playerId, table.createdAt),
    index('summon_history_champion_idx').on(table.championKey),
  ],
);

/**
 * Champions the player has met but may not own.
 *
 * The Chronicle is a record of the world, not a list of receipts, so a champion fought in
 * the campaign or shown on a banner registers as *seen* even if it was never pulled.
 */
export const championSightings = pgTable(
  'champion_sightings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    championKey: text('champion_key').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('champion_sightings_player_champion_key').on(table.playerId, table.championKey),
  ],
);

export type SummonHistoryRow = typeof summonHistory.$inferSelect;
export type ChampionSightingRow = typeof championSightings.$inferSelect;
