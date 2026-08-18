import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { idParam, keyParam, numberQuery, uuidQuery } from './params';
import { isAppError } from './errors';

/**
 * The edge checks, without a server.
 *
 * What these are guarding is one line of behaviour that used to be missing everywhere:
 * a request's path and query are as much caller input as its body is, and until P10d only
 * the body was ever parsed. Twenty-nine routes read `request.params as { id: string }`,
 * a cast asserting something nobody had checked, and seven of them answered a plain
 * `GET /api/profiles/not-a-uuid` with 500 "Something went wrong on our end."
 */

const request = (parts: { params?: unknown; query?: unknown }): FastifyRequest =>
  ({ params: parts.params ?? {}, query: parts.query ?? {} }) as FastifyRequest;

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return isAppError(error) ? error.code : 'THREW';
  }
  return 'NO_THROW';
};

const A_UUID = '3f6b0a2e-9c11-4f2b-8a41-6c0b2f7d5e13';

describe('idParam', () => {
  it('returns a well-formed id', () => {
    expect(idParam(request({ params: { id: A_UUID } }))).toBe(A_UUID);
  });

  it('reads whichever parameter it is asked for', () => {
    expect(idParam(request({ params: { battleId: A_UUID } }), 'battleId')).toBe(A_UUID);
  });

  it.each([
    ['a word', 'not-a-uuid'],
    ['an empty string', ''],
    ['a near miss', '3f6b0a2e-9c11-4f2b-8a41-6c0b2f7d5e1'],
    ['an injection attempt', "' OR 1=1 --"],
    ['a number', 42],
    ['nothing at all', undefined],
  ])('refuses %s as not found', (_label, value) => {
    expect(codeOf(() => idParam(request({ params: { id: value } })))).toBe('NOT_FOUND');
  });

  it('answers a malformed id exactly as it answers a missing one', () => {
    // NOT_FOUND rather than VALIDATION on purpose: an id that could never exist must not
    // be distinguishable from one that merely does not, or the shape of our keys is free
    // to anyone who asks twice.
    expect(codeOf(() => idParam(request({ params: { id: 'nonsense' } })))).toBe(
      codeOf(() => idParam(request({ params: {} }))),
    );
  });
});

describe('keyParam', () => {
  it('takes a content key as it is', () => {
    expect(keyParam(request({ params: { key: 'chapter_1_stage_3' } }))).toBe('chapter_1_stage_3');
  });

  it('refuses an empty key', () => {
    expect(codeOf(() => keyParam(request({ params: { key: '' } })))).toBe('NOT_FOUND');
  });

  it('refuses a key long enough to be an attack on a log line', () => {
    expect(codeOf(() => keyParam(request({ params: { key: 'x'.repeat(500) } })))).toBe('NOT_FOUND');
  });
});

describe('uuidQuery', () => {
  it('returns a well-formed id', () => {
    expect(uuidQuery(request({ query: { championId: A_UUID } }), 'championId')).toBe(A_UUID);
  });

  it('names the parameter it wanted', () => {
    try {
      uuidQuery(request({ query: {} }), 'championId');
      expect.unreachable();
    } catch (error) {
      expect(isAppError(error) && error.code).toBe('VALIDATION');
      expect(String(error)).toContain('championId');
    }
  });
});

describe('numberQuery', () => {
  const bounds = { min: 1, max: 200, fallback: 50 };
  const limit = (value: unknown): number =>
    numberQuery(request({ query: { limit: value } }), 'limit', bounds);

  it('takes a sensible value', () => {
    expect(limit('25')).toBe(25);
  });

  it('falls back when the parameter is absent or blank', () => {
    expect(limit(undefined)).toBe(50);
    expect(limit('')).toBe(50);
  });

  it('falls back rather than passing NaN to a query', () => {
    expect(limit('abc')).toBe(50);
  });

  it('clamps rather than rejects, because these are page sizes', () => {
    // `?limit=999999` used to arrive at the database intact.
    expect(limit('999999')).toBe(200);
    // And `?limit=-5` used to become a LIMIT PostgreSQL refuses outright.
    expect(limit('-5')).toBe(1);
  });

  it('truncates a fraction rather than handing one to LIMIT', () => {
    expect(limit('10.7')).toBe(10);
  });
});
