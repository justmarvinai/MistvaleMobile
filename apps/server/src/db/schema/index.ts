/**
 * The database schema, assembled for Drizzle.
 *
 * Split by concern: identity and the audit/economy trails, the content store every
 * player shares, the game state each player owns, and what they own besides champions
 * (docs/DATA_MODEL.md).
 */
export * from './accounts';
export * from './audit';
export * from './content';
export * from './game';
export * from './inventory';
