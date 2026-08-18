import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { AppError } from './errors';

/**
 * Path parameters and query strings, checked before they reach a query.
 *
 * Bodies have always been parsed through Zod; the other two halves of a request were not,
 * and every id route read `request.params as { id: string }` — a cast that asserts
 * something nobody had checked. `GET /api/profiles/not-a-uuid` therefore carried a
 * malformed id all the way to a `uuid` column, where PostgreSQL raised 22P02 and the
 * error handler, correctly refusing to guess, answered **500 "Something went wrong on our
 * end."** Seven routes did it, on paths reachable from every player name in the game.
 *
 * A mistyped id is the caller's mistake and a 500 is a claim about ours: it pages whoever
 * is on call, and it tells the player the game is broken when it is not.
 */

const uuid = z.uuid();

/**
 * A path parameter that must be a UUID, or nothing was found.
 *
 * `NOT_FOUND` rather than `VALIDATION` on purpose: a well-formed id for something that
 * does not exist already answers 404, and an id that could never exist should not be
 * distinguishable from it. The alternative tells an unauthenticated prober the shape of
 * our keys for free.
 */
export function idParam(request: FastifyRequest, name = 'id'): string {
  const params = request.params as Record<string, unknown>;
  const parsed = uuid.safeParse(params[name]);
  if (!parsed.success) throw AppError.notFound();
  return parsed.data;
}

/**
 * A path parameter that names a piece of content.
 *
 * Content keys are not UUIDs — they are `chapter_1_stage_3`-shaped and compared against
 * the published bundle, so an unknown one is already a clean miss. The only thing worth
 * refusing here is a value long enough to be an attack on a log line rather than a key.
 */
export function keyParam(request: FastifyRequest, name = 'key'): string {
  const params = request.params as Record<string, unknown>;
  const parsed = z.string().min(1).max(120).safeParse(params[name]);
  if (!parsed.success) throw AppError.notFound();
  return parsed.data;
}

/**
 * A query parameter that must be a UUID.
 *
 * Same failure as `idParam` and the same answer, one step further along the request: the
 * relic preview takes the champion to compare against as `?championId=`, which reached a
 * `uuid` column with whatever the caller sent.
 */
export function uuidQuery(request: FastifyRequest, name: string): string {
  const query = request.query as Record<string, unknown>;
  const parsed = uuid.safeParse(query[name]);
  if (!parsed.success) {
    throw new AppError('VALIDATION', `Pass ?${name}= as the id of the thing to compare against.`);
  }
  return parsed.data;
}

export interface NumberQueryOptions {
  min: number;
  max: number;
  fallback: number;
}

/**
 * A numeric query parameter, clamped rather than rejected.
 *
 * Clamped because these are all page sizes, and a caller asking for a million rows wants
 * "as many as you will give me" rather than an error — but the ceiling has to be ours.
 * `Number(limit) || 50` was the previous idiom and it let `?limit=999999` through intact
 * while quietly turning `?limit=-5` into a query PostgreSQL refuses.
 */
export function numberQuery(
  request: FastifyRequest,
  name: string,
  { min, max, fallback }: NumberQueryOptions,
): number {
  const query = request.query as Record<string, unknown>;
  const raw = query[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
