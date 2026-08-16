import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from './errors';

/**
 * The response envelope every endpoint returns.
 *
 * `rev` is the content revision the response was produced against; the client compares
 * it against its cached bundle and re-fetches when it moves. See docs/API_DESIGN.md.
 */
export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  rev: number;
}

export interface ApiFailure {
  ok: false;
  error: ApiError;
  rev: number;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.ok;
}

/** Builds the success envelope. Server-side helper, exported for tests. */
export function apiSuccess<T>(data: T, rev: number): ApiSuccess<T> {
  return { ok: true, data, rev };
}

/** Builds the failure envelope. */
export function apiFailure(
  code: ErrorCode,
  message: string,
  rev: number,
  extra?: { details?: unknown; requestId?: string },
): ApiFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(extra?.details === undefined ? {} : { details: extra.details }),
      ...(extra?.requestId === undefined ? {} : { requestId: extra.requestId }),
    },
    rev,
  };
}

/** Header the client sends with its build hash; a mismatch can force a reload. */
export const CLIENT_REV_HEADER = 'x-client-rev';

/** Header carrying the per-request id, echoed on every response for bug reports. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Name of the session cookie. */
export const SESSION_COOKIE = 'mv_session';
