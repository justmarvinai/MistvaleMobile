/**
 * The database schema, assembled for Drizzle.
 *
 * Phase P0 covers identity and the audit/economy trails. Content tables (`*_defs`) and
 * player-owned game state arrive in P1 and later, following docs/DATA_MODEL.md.
 */
export * from './accounts';
export * from './audit';
export * from './content';
