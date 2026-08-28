import { z } from 'zod';
import { ACCOUNT_RANKS } from './enums';
import type { XpBoostState } from './xpBoost';

/**
 * Auth contracts: account name + password + profile name. No e-mail anywhere in
 * Mistvale — password resets are performed by admins in the Admin Suite.
 * See docs/API_DESIGN.md §1 and docs/GAME_DESIGN.md.
 */

export const ACCOUNT_NAME_MIN = 3;
export const ACCOUNT_NAME_MAX = 20;
export const PROFILE_NAME_MIN = 3;
export const PROFILE_NAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Account names are the login handle: letters, digits, underscore, hyphen. */
export const accountNameSchema = z
  .string()
  .trim()
  .min(ACCOUNT_NAME_MIN, `Account name must be at least ${ACCOUNT_NAME_MIN} characters.`)
  .max(ACCOUNT_NAME_MAX, `Account name must be at most ${ACCOUNT_NAME_MAX} characters.`)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Account name may only contain letters, numbers, underscores and hyphens.',
  );

/** Profile names are what other players see: adds spaces, forbids leading/trailing ones. */
export const profileNameSchema = z
  .string()
  .trim()
  .min(PROFILE_NAME_MIN, `Profile name must be at least ${PROFILE_NAME_MIN} characters.`)
  .max(PROFILE_NAME_MAX, `Profile name must be at most ${PROFILE_NAME_MAX} characters.`)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 _-]*[A-Za-z0-9]$/,
    'Profile name may use letters, numbers, spaces, underscores and hyphens.',
  )
  .refine((value) => !value.includes('  '), 'Profile name cannot contain double spaces.');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters.`);

export const registerRequestSchema = z.object({
  accountName: accountNameSchema,
  profileName: profileNameSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  accountName: accountNameSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/**
 * The account half of a session — identity and permissions.
 *
 * A schema rather than an interface because the Admin API publishes it: the OpenAPI
 * artifact the Admin Suite generates its types from is derived from this.
 */
export const accountSummarySchema = z.object({
  id: z.string(),
  accountName: z.string(),
  rank: z.enum(ACCOUNT_RANKS),
  forcePasswordChange: z.boolean(),
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

/** The player half — the game profile attached to the account. */
export interface PlayerSummary {
  id: string;
  profileName: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  silver: number;
  crystals: number;
  valorMedals: number;
  energy: EnergyState;
  /** The champion-XP boost: when it runs out, and what it is worth while it does. */
  xpBoost: XpBoostState;
  rosterCapacity: number;
  tutorialStep: number;
  createdAt: string;
  /**
   * The champion whose face this account wears, or null for the plain crest.
   *
   * A key rather than a roster id, so the client draws it from the content bundle it
   * already holds — no second request, and a top bar that is right on the first paint.
   */
  avatarChampionKey: string | null;
}

/**
 * Energy is never counted by the client: the server sends the authoritative value plus
 * the timestamp of the next tick, and the client animates towards it.
 */
export interface EnergyState {
  value: number;
  cap: number;
  regenSeconds: number;
  /** ISO-8601, or null when the bar is full. */
  nextTickAt: string | null;
  /** ISO-8601, or null when the bar is full. */
  fullAt: string | null;
}

/**
 * Energy may sit **above** its cap.
 *
 * The cap governs regeneration and nothing else — the clock stops filling at it, and a
 * reward does not (C24). So `value > cap` is an ordinary state, not a bug, and anything
 * drawing this has to read it as "how many fights are in the bank" rather than as a
 * percentage of something.
 */
/** Response of the auth endpoints and `GET /api/auth/me`. */
export interface SessionResponse {
  account: AccountSummary;
  player: PlayerSummary;
}

export const accountRankSchema = z.enum(ACCOUNT_RANKS);
