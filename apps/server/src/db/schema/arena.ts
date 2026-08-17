import { sql } from 'drizzle-orm';
import {
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
import type { ArenaTier, Element, HallStat } from '@mistvale/shared';
import { players } from './accounts';

/**
 * The Arena ladder and the Hall of Valor it feeds.
 *
 * Bots hold rows in these tables exactly as players do — they *are* players, with
 * `players.is_bot` set — so matchmaking, the leaderboard and the battle engine need no
 * special case for them (docs/DATA_MODEL.md).
 */

/**
 * One player's standing.
 *
 * Tokens follow energy's pattern: a value and the moment it was written, with everything
 * else derived against the clock. `weekly_high` is the best rating held since the last
 * Monday reset and is what the weekly chest pays against — falling out of Gold on Sunday
 * evening must not cost a week of Gold.
 */
export const arenaState = pgTable(
  'arena_state',
  {
    playerId: uuid('player_id')
      .primaryKey()
      .references(() => players.id, { onDelete: 'cascade' }),

    rating: integer('rating').notNull().default(0),
    /** Denormalised from `rating` so matchmaking and the ladder can band without maths. */
    tier: text('tier').notNull().default('bronze_1').$type<ArenaTier>(),
    weeklyHigh: integer('weekly_high').notNull().default(0),

    tokens: smallint('tokens').notNull().default(10),
    tokensUpdatedAt: timestamp('tokens_updated_at', { withTimezone: true }).notNull().defaultNow(),

    /** `player_champions` ids in formation order; the first is the leader. */
    defenceTeam: jsonb('defence_team').notNull().default([]).$type<string[]>(),

    /**
     * The opponents currently on offer, held server-side.
     *
     * Kept here rather than in their own table because an offer list is small, entirely
     * replaced on every refresh, and meaningless to anyone but its owner — three
     * properties that make a column the right shape and a table the wrong one.
     */
    offers: jsonb('offers').notNull().default([]).$type<ArenaOfferRow[]>(),
    offersRefreshedAt: timestamp('offers_refreshed_at', { withTimezone: true }),
    /** Free refreshes already taken today, against `arena.freeRefreshesPerDay`. */
    refreshesUsed: smallint('refreshes_used').notNull().default(0),
    refreshDay: text('refresh_day'),

    /** ISO week the last chest was claimed for, so a claim cannot repeat inside one. */
    lastWeeklyClaim: text('last_weekly_claim'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Matchmaking reads a rating band and the ladder sorts by rating; one index serves both.
    index('arena_state_rating_idx').on(table.rating),
    check('arena_state_rating_check', sql`${table.rating} >= 0`),
    check('arena_state_tokens_check', sql`${table.tokens} >= 0`),
  ],
);

/** An offer as stored: enough to rebuild the fight without re-reading the defender. */
export interface ArenaOfferRow {
  offerId: string;
  defenderId: string;
  rating: number;
}

/**
 * Every attack, kept.
 *
 * The defender may be a bot — same table, same columns — because the ladder does not
 * distinguish them. Rows outlive the battle session they came from: a session is pruned
 * with its event log, while "who attacked whom, and what it moved" is the ladder's own
 * history and the only thing that can answer a dispute.
 */
export const arenaBattles = pgTable(
  'arena_battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attackerId: uuid('attacker_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    defenderId: uuid('defender_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** The `battle_sessions` row that was fought, while it is still kept. */
    battleId: uuid('battle_id'),

    /** From the attacker's side, which is the only side that chose to be here. */
    won: boolean('won').notNull(),
    attackerRatingDelta: integer('attacker_rating_delta').notNull().default(0),
    defenderRatingDelta: integer('defender_rating_delta').notNull().default(0),
    medals: smallint('medals').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('arena_battles_attacker_idx').on(table.attackerId, table.createdAt),
    // A defender wants "who hit me while I was away", which is the other direction.
    index('arena_battles_defender_idx').on(table.defenderId, table.createdAt),
  ],
);

/**
 * The Hall of Valor: one row per element × stat track.
 *
 * A row per track rather than a jsonb map because a track is a *ledger* — it only ever
 * goes up, one level at a time, each level bought with medals — and rows make that a
 * constraint rather than a convention.
 */
export const hallOfValor = pgTable(
  'hall_of_valor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    element: text('element').notNull().$type<Element>(),
    stat: text('stat').notNull().$type<HallStat>(),
    level: smallint('level').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('hall_of_valor_track_key').on(table.playerId, table.element, table.stat),
    check('hall_of_valor_level_check', sql`${table.level} >= 0 and ${table.level} <= 10`),
  ],
);

export type ArenaStateRow = typeof arenaState.$inferSelect;
export type HallOfValorRow = typeof hallOfValor.$inferSelect;
