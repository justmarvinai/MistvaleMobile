import { z } from 'zod';
import { accountRankSchema, passwordSchema, profileNameSchema } from './auth';
import { ACCOUNT_STATUSES } from './enums';

/**
 * Player management — the support desk.
 *
 * There is no e-mail address anywhere in Mistvale, which is a deliberate simplification
 * and one binding consequence: **an operator is the only password-reset mechanism there
 * is** (CLAUDE.md hard rules). Everything here exists so that a warden who has forgotten
 * their password, been banned by mistake, or picked a profile name they regret can be
 * helped without anybody touching the database by hand.
 *
 * Every action is audited, and two of them refuse to act on the caller's own account:
 * an admin cannot change their own rank or ban themselves, because the first is how a
 * suite locks itself out and the second is how it locks everyone out.
 */

// ── Reading ─────────────────────────────────────────────────────────────────

/** One row of the search results — enough to recognise an account, nothing more. */
export const adminPlayerSummarySchema = z.object({
  playerId: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  profileName: z.string(),
  rank: accountRankSchema,
  status: z.enum(ACCOUNT_STATUSES),
  level: z.number().int(),
  isBot: z.boolean(),
  /** ISO-8601, or null if the account has never signed in. */
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminPlayerSummary = z.infer<typeof adminPlayerSummarySchema>;

export const adminPlayerSearchSchema = z.object({
  players: z.array(adminPlayerSummarySchema),
  /** Total matches, so the table can say "showing 25 of 340". */
  total: z.number().int(),
});
export type AdminPlayerSearch = z.infer<typeof adminPlayerSearchSchema>;

/** A live session, so an operator can see where an account is signed in. */
export const adminSessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

/** One line of the wallet's history — the answer to "where did that silver come from". */
export const adminEconomyEntrySchema = z.object({
  source: z.string(),
  deltas: z.record(z.string(), z.number()),
  createdAt: z.string(),
});
export type AdminEconomyEntry = z.infer<typeof adminEconomyEntrySchema>;

export const adminPlayerDetailSchema = z.object({
  account: z.object({
    id: z.string(),
    accountName: z.string(),
    rank: accountRankSchema,
    status: z.enum(ACCOUNT_STATUSES),
    banReason: z.string().nullable(),
    forcePasswordChange: z.boolean(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  player: z.object({
    id: z.string(),
    profileName: z.string(),
    level: z.number().int(),
    xp: z.number().int(),
    silver: z.number().int(),
    crystals: z.number().int(),
    valorMedals: z.number().int(),
    /** Derived at read time, exactly as the game client sees it. */
    energy: z.number().int(),
    energyCap: z.number().int(),
    rosterCapacity: z.number().int(),
    isBot: z.boolean(),
    createdAt: z.string(),
  }),
  /** What the account owns, as counts — the drill-in views arrive with A5 proper. */
  holdings: z.object({
    champions: z.number().int(),
    gear: z.number().int(),
    itemStacks: z.number().int(),
  }),
  progress: z.object({
    stagesCleared: z.number().int(),
    stars: z.number().int(),
    totalClears: z.number().int(),
    /** Deepest floor reached per dungeon, keyed by dungeon. */
    deepestFloors: z.record(z.string(), z.number().int()),
  }),
  sessions: z.array(adminSessionSchema),
  /** Newest first. The tail, not the whole ledger. */
  economy: z.array(adminEconomyEntrySchema),
});
export type AdminPlayerDetail = z.infer<typeof adminPlayerDetailSchema>;

// ── Acting ──────────────────────────────────────────────────────────────────

/**
 * A reset produces a temporary password rather than accepting one.
 *
 * The operator reads it out and the warden changes it on their next sign-in — which is
 * enforced, not suggested: `forcePasswordChange` blocks every other endpoint until it is
 * cleared. Letting an operator *choose* the password would make "the admin knows your
 * password" a lasting state rather than a thirty-second one.
 */
export const adminResetPasswordResultSchema = z.object({
  temporaryPassword: z.string(),
  /** Sessions signed out by the reset. */
  sessionsRevoked: z.number().int(),
});
export type AdminResetPasswordResult = z.infer<typeof adminResetPasswordResultSchema>;

export const adminSetRankRequestSchema = z.object({ rank: accountRankSchema });
export type AdminSetRankRequest = z.infer<typeof adminSetRankRequestSchema>;

export const adminBanRequestSchema = z.object({
  banned: z.boolean(),
  /** Required when banning; shown to the account at its next sign-in attempt. */
  reason: z.string().trim().min(3).max(200).optional(),
});
export type AdminBanRequest = z.infer<typeof adminBanRequestSchema>;

export const adminRenameRequestSchema = z.object({ profileName: profileNameSchema });
export type AdminRenameRequest = z.infer<typeof adminRenameRequestSchema>;

/**
 * An operator grant.
 *
 * Goes through `RewardService` like every other grant in the game, so it lands in
 * `economy_log` next to the battle payouts and the summon spends — a hand-out that
 * bypassed the ledger would be invisible in exactly the audit an operator grant most
 * needs to appear in (docs/ARCHITECTURE.md §5.3).
 */
export const adminGrantRequestSchema = z
  .object({
    silver: z.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
    crystals: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    valorMedals: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    playerXp: z.number().int().min(0).max(10_000_000).optional(),
    /** Stackables by item key; negative takes them away. */
    items: z.record(z.string(), z.number().int()).optional(),
    /** Why, in the operator's words. Recorded in the audit entry. */
    note: z.string().trim().min(3).max(200),
  })
  .refine(
    (input) =>
      input.silver !== undefined ||
      input.crystals !== undefined ||
      input.valorMedals !== undefined ||
      input.playerXp !== undefined ||
      (input.items !== undefined && Object.keys(input.items).length > 0),
    { message: 'A grant has to move something.' },
  );
export type AdminGrantRequest = z.infer<typeof adminGrantRequestSchema>;

/**
 * What a full account reset destroyed.
 *
 * Reported back so the operator sees the size of what they just did — "reset" and
 * "reset, and that was 143 relics" are different sentences, and only one of them
 * tells somebody they had the wrong account open.
 */
export const adminResetAccountResultSchema = z.object({
  champions: z.number().int(),
  gear: z.number().int(),
  itemStacks: z.number().int(),
  stagesCleared: z.number().int(),
  battles: z.number().int(),
  summons: z.number().int(),
  /** Currencies taken back, exactly as the ledger line records them. */
  refunded: z.record(z.string(), z.number()),
  sessionsRevoked: z.number().int(),
});
export type AdminResetAccountResult = z.infer<typeof adminResetAccountResultSchema>;

export const adminGrantResultSchema = z.object({
  applied: z.record(z.string(), z.number()),
  levelsGained: z.number().int(),
  newLevel: z.number().int(),
});
export type AdminGrantResult = z.infer<typeof adminGrantResultSchema>;

/** Shared shape for the small acknowledgements the action endpoints return. */
export const adminAccountStateSchema = z.object({
  rank: accountRankSchema,
  status: z.enum(ACCOUNT_STATUSES),
  banReason: z.string().nullable(),
  profileName: z.string(),
});
export type AdminAccountState = z.infer<typeof adminAccountStateSchema>;

export const adminSessionsRevokedSchema = z.object({ revoked: z.number().int() });
export type AdminSessionsRevoked = z.infer<typeof adminSessionsRevokedSchema>;

/**
 * How long a generated temporary password is, in bytes of entropy before encoding.
 *
 * Twelve bytes is 96 bits — far beyond guessable, and short enough to read down a phone
 * line without anybody losing their place.
 */
export const TEMP_PASSWORD_BYTES = 12;

/** Re-exported so the reset endpoint and the change-password form agree on the floor. */
export const adminTemporaryPasswordSchema = passwordSchema;
