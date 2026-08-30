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

// ── The balance sandbox ─────────────────────────────────────────────────────

/**
 * How many times one press of Simulate may fight a stage.
 *
 * Measured on the dev box rather than guessed: an early campaign stage resolves in about
 * 0.2 ms and a chapter-12 Brutal fight a fresh team **loses** takes 2.3 ms, because a loss
 * runs to the turn cap. So two hundred runs is somewhere between a twentieth of a second
 * and half of one — comfortably a press — while giving a win rate with enough resolution to
 * act on. The cap exists because this endpoint is a *loop* an operator controls the length
 * of, and a one-core box has a game to serve at the same time.
 */
export const SIMULATE_MAX_RUNS = 200;
export const SIMULATE_DEFAULT_RUNS = 60;

/** Which content a simulation is run against. */
export const SIMULATE_SOURCES = ['live', 'draft'] as const;
export type SimulateSource = (typeof SIMULATE_SOURCES)[number];

/**
 * The three teams a stage is worth measuring against.
 *
 * The same rungs the CI gates use, named here so the sandbox and the gates cannot mean
 * different things by "a modest team" — comparing the two is the whole reason an operator
 * opens the sandbox after a gate has said something.
 */
export const BENCH_TIER_KEYS = ['fresh', 'modest', 'built'] as const;
export type BenchTierKey = (typeof BENCH_TIER_KEYS)[number];

export const adminSimulateRequestSchema = z.object({
  stageKey: z.string().min(1).max(120),
  /**
   * `draft` layers the pending edits over live content, which is the case this endpoint
   * exists for: an operator retuning a stage wants to know what the *edit* does before it
   * is published, not what the published version already did.
   */
  source: z.enum(SIMULATE_SOURCES).default('live'),
  tier: z.enum(BENCH_TIER_KEYS).default('modest'),
  runs: z.number().int().min(1).max(SIMULATE_MAX_RUNS).default(SIMULATE_DEFAULT_RUNS),
});
export type AdminSimulateRequest = z.infer<typeof adminSimulateRequestSchema>;

export const adminSimulateResultSchema = z.object({
  stageKey: z.string(),
  stageLabel: z.string(),
  source: z.enum(SIMULATE_SOURCES),
  tier: z.enum(BENCH_TIER_KEYS),
  /** What the bench team was, so a number is never reported without its team. */
  team: z.array(
    z.object({
      championKey: z.string(),
      name: z.string(),
      level: z.number().int(),
      rank: z.number().int(),
      ascension: z.number().int(),
    }),
  ),
  runs: z.number().int(),
  wins: z.number().int(),
  winRate: z.number(),
  /**
   * Across **winning** runs only — a loss runs to the turn cap and would drag the mean
   * toward it, reporting a fight as slower than the ones that actually finished.
   * Null when nothing was won, because a mean of no numbers is not zero.
   */
  averageTurns: z.number().nullable(),
  medianTurns: z.number().nullable(),
  /**
   * The stage's own three-star turn limit, and the share of runs that came in under it.
   *
   * The figure an operator is usually really asking about: a stage can be clearable and
   * still be mis-tuned if nobody can three-star it. Null when the stage sets no limit.
   */
  starTurnLimit: z.number().int().nullable(),
  winsWithinStarLimit: z.number().nullable(),
  msPerRun: z.number(),
});
export type AdminSimulateResult = z.infer<typeof adminSimulateResultSchema>;

/**
 * The audit log, searchable (gap G1).
 *
 * ADMIN_SUITE_DESIGN §2.17 asked for this from the start and the suite has only ever had
 * the ten most recent entries, ridden in on `/stats/overview`. Ten is enough to notice
 * that somebody published something; it is not enough to answer "who changed this stage,
 * and when" — which is the question an audit log exists for, and the one that only comes
 * up on a bad day.
 *
 * Filtered by actor, action, entity and date, all optional and all combinable, because an
 * operator arrives at this screen from one of two directions: a name they are suspicious
 * of, or an entity that has gone wrong.
 */
export const AUDIT_MAX_LIMIT = 100;
export const AUDIT_DEFAULT_LIMIT = 50;

export const adminAuditQuerySchema = z.object({
  /** Substring, case-insensitive, matched against the recorded actor label. */
  actor: z.string().max(120).optional(),
  /** Exact action, e.g. `player.ban` — the list is small and an operator picks from it. */
  action: z.string().max(120).optional(),
  /** Exact entity type, e.g. `account` or `content`. */
  entity: z.string().max(120).optional(),
  /** Exact entity id, which is how "what happened to *this* thing" is asked. */
  entityId: z.string().max(200).optional(),
  /** ISO instants. Inclusive at both ends, because an operator thinks in whole days. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(AUDIT_MAX_LIMIT).default(AUDIT_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;

export const adminAuditEntrySchema = z.object({
  id: z.string(),
  actor: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  /**
   * What the thing looked like on either side of the change.
   *
   * Carried rather than summarised: "vale-warden was banned" is a fact somebody can act on
   * a year later and "ban" is not, which is why every mutation records both halves.
   */
  before: z.unknown(),
  after: z.unknown(),
  createdAt: z.string(),
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditPageSchema = z.object({
  entries: z.array(adminAuditEntrySchema),
  /**
   * How many rows match the filter, not how many were returned.
   *
   * A count is worth the second query here: the difference between "3 changes to this
   * stage" and "3 of 400" is the whole question, and a page of fifty cannot say which.
   */
  total: z.number().int(),
  /** The distinct actions present in the log, so the filter can offer them. */
  actions: z.array(z.string()),
  /** The distinct entity types present, for the same reason. */
  entities: z.array(z.string()),
});
export type AdminAuditPage = z.infer<typeof adminAuditPageSchema>;

/**
 * The battle inspector (ADMIN_SUITE_DESIGN §2.18).
 *
 * The debugging tool for "that fight felt wrong", and the reason it can exist at all is
 * that a battle *is* its event log: the engine is deterministic given a seed, the server
 * stores the whole log on the row, and the client only ever renders it. So an operator
 * looking at this is looking at exactly what the player saw, rather than at a
 * reconstruction that could differ in the way that matters.
 */
export const ADMIN_BATTLE_MAX_LIMIT = 50;
export const ADMIN_BATTLE_DEFAULT_LIMIT = 20;

export const adminBattleQuerySchema = z.object({
  /** Whose fights. Omitted lists the most recent across the whole server. */
  playerId: z.string().max(64).optional(),
  mode: z.string().max(40).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_BATTLE_MAX_LIMIT)
    .default(ADMIN_BATTLE_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export type AdminBattleQuery = z.infer<typeof adminBattleQuerySchema>;

export const adminBattleSummarySchema = z.object({
  id: z.string(),
  playerId: z.string(),
  profileName: z.string().nullable(),
  mode: z.string(),
  stageKey: z.string(),
  status: z.string(),
  outcome: z.string().nullable(),
  turns: z.number().int(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AdminBattleSummary = z.infer<typeof adminBattleSummarySchema>;

export const adminBattleListSchema = z.object({
  battles: z.array(adminBattleSummarySchema),
  total: z.number().int(),
});
export type AdminBattleList = z.infer<typeof adminBattleListSchema>;

/** One unit as the log's opening snapshot described it. */
export const adminBattleUnitSchema = z.object({
  side: z.string(),
  slot: z.number().int(),
  defKey: z.string(),
  name: z.string(),
});
export type AdminBattleUnit = z.infer<typeof adminBattleUnitSchema>;

export const adminBattleDetailSchema = adminBattleSummarySchema.extend({
  /** The seed the fight was rolled from — with it, the fight is reproducible exactly. */
  seed: z.number(),
  /** The revision the fight was resolved against, since a kit may have changed since. */
  contentRev: z.number().int(),
  energySpent: z.number().int(),
  allies: z.array(adminBattleUnitSchema),
  enemies: z.array(adminBattleUnitSchema),
  /**
   * The engine's own event log, verbatim.
   *
   * Not summarised and not re-derived: this is the record the client rendered, and a
   * paraphrase of it would be a second account of the fight that could differ from the
   * first in exactly the case somebody is asking about.
   */
  events: z.array(z.unknown()),
  /** What the clear paid, when it finished. */
  rewards: z.unknown(),
});
export type AdminBattleDetail = z.infer<typeof adminBattleDetailSchema>;
