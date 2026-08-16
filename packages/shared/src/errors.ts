/**
 * The closed set of API error codes.
 *
 * Every failure the server returns carries one of these codes so the client can react
 * structurally (retry, re-fetch content, force a reload) instead of string-matching
 * messages. See docs/API_DESIGN.md §3.
 */
export const ERROR_CODES = [
  /** No session, or the session expired. */
  'AUTH_REQUIRED',
  /** Authenticated but not allowed (e.g. non-admin hitting the Admin API). */
  'FORBIDDEN',
  /** Request failed schema validation; `details` carries the field issues. */
  'VALIDATION',
  /** Credentials rejected. Deliberately vague — never reveals which half was wrong. */
  'INVALID_CREDENTIALS',
  /** Account name or profile name already taken. */
  'ALREADY_EXISTS',
  'NOT_FOUND',
  'INSUFFICIENT_FUNDS',
  'ENERGY_LOW',
  'ROSTER_FULL',
  'COOLDOWN',
  /** The feature exists but the player has not unlocked it yet. */
  'LOCKED_CONTENT',
  /** This actionId was already processed; the original result is returned. */
  'IDEMPOTENT_REPLAY',
  'RATE_LIMITED',
  /** The client acted on a stale content revision; re-fetch the bundle and retry once. */
  'CONTENT_STALE',
  /** The account is banned. */
  'ACCOUNT_BANNED',
  /** Password change required before anything else is permitted. */
  'PASSWORD_CHANGE_REQUIRED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Default HTTP status for each error code. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  INVALID_CREDENTIALS: 401,
  ALREADY_EXISTS: 409,
  NOT_FOUND: 404,
  INSUFFICIENT_FUNDS: 409,
  ENERGY_LOW: 409,
  ROSTER_FULL: 409,
  COOLDOWN: 429,
  LOCKED_CONTENT: 403,
  IDEMPOTENT_REPLAY: 200,
  RATE_LIMITED: 429,
  CONTENT_STALE: 409,
  ACCOUNT_BANNED: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  INTERNAL: 500,
});

/** Player-facing default messages. Individual throw sites may override. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
  AUTH_REQUIRED: 'You need to be signed in to do that.',
  FORBIDDEN: 'You do not have access to that.',
  VALIDATION: 'Some of that information was not valid.',
  INVALID_CREDENTIALS: 'That account name or password is not right.',
  ALREADY_EXISTS: 'That name is already taken.',
  NOT_FOUND: 'We could not find that.',
  INSUFFICIENT_FUNDS: 'You cannot afford that.',
  ENERGY_LOW: 'Not enough energy.',
  ROSTER_FULL: 'Your roster is full.',
  COOLDOWN: 'That is not ready yet.',
  LOCKED_CONTENT: 'That is still locked.',
  IDEMPOTENT_REPLAY: 'That action was already completed.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment.',
  CONTENT_STALE: 'The game was updated. Refreshing…',
  ACCOUNT_BANNED: 'This account has been suspended.',
  PASSWORD_CHANGE_REQUIRED: 'You must change your password before continuing.',
  INTERNAL: 'Something went wrong on our end.',
});
