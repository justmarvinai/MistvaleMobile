import { describe, expect, it } from 'vitest';
import { accountNameSchema, profileNameSchema, registerRequestSchema } from './auth';
import { computeUnlocks, UNLOCK_LEVELS } from './player';
import { ELEMENT_BEATS, ELEMENTS, LEVEL_CAP_BY_RANK, MAX_RANK } from './enums';
import { apiFailure, apiSuccess, isApiSuccess } from './api';
import { ERROR_CODES, ERROR_HTTP_STATUS, ERROR_MESSAGES } from './errors';

describe('account and profile names', () => {
  it.each(['warden', 'Marvin_01', 'a-b-c'])('accepts %s as an account name', (name) => {
    expect(accountNameSchema.safeParse(name).success).toBe(true);
  });

  it.each([
    ['ab', 'too short'],
    ['has space', 'spaces are not allowed in account names'],
    ['bad!char', 'punctuation'],
    ['x'.repeat(21), 'too long'],
  ])('rejects %s (%s)', (name) => {
    expect(accountNameSchema.safeParse(name).success).toBe(false);
  });

  it('allows single interior spaces in profile names but not doubles or edges', () => {
    expect(profileNameSchema.safeParse('Old Maddoc').success).toBe(true);
    expect(profileNameSchema.safeParse('Old  Maddoc').success).toBe(false);
    // Leading/trailing whitespace is trimmed before the pattern check.
    expect(profileNameSchema.parse('  Warden  ')).toBe('Warden');
  });

  it('requires all three fields to register', () => {
    const result = registerRequestSchema.safeParse({
      accountName: 'warden',
      profileName: 'Warden',
      password: 'correct horse battery',
    });
    expect(result.success).toBe(true);
    expect(registerRequestSchema.safeParse({ accountName: 'warden' }).success).toBe(false);
  });

  it('rejects passwords shorter than eight characters', () => {
    const result = registerRequestSchema.safeParse({
      accountName: 'warden',
      profileName: 'Warden',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('element wheel', () => {
  it('forms a three-element cycle with mist outside it', () => {
    expect(ELEMENT_BEATS.ember).toBe('verdant');
    expect(ELEMENT_BEATS.verdant).toBe('tide');
    expect(ELEMENT_BEATS.tide).toBe('ember');
    expect(ELEMENT_BEATS.mist).toBeNull();
  });

  it('never lets an element beat itself and covers every element', () => {
    for (const element of ELEMENTS) {
      expect(ELEMENT_BEATS[element]).not.toBe(element);
    }
    expect(Object.keys(ELEMENT_BEATS).sort()).toEqual([...ELEMENTS].sort());
  });
});

describe('rank level caps', () => {
  it('caps each star rank ten levels above the previous one', () => {
    for (let rank = 1; rank <= MAX_RANK; rank += 1) {
      expect(LEVEL_CAP_BY_RANK[rank]).toBe(rank * 10);
    }
  });
});

describe('feature unlocks', () => {
  it('locks everything for a level-1 account', () => {
    const unlocks = computeUnlocks(1);
    expect(Object.values(unlocks).every((value) => value === false)).toBe(true);
  });

  it('unlocks each feature exactly at its configured level', () => {
    for (const [feature, level] of Object.entries(UNLOCK_LEVELS)) {
      const key = feature as keyof typeof UNLOCK_LEVELS;
      expect(computeUnlocks(level - 1)[key]).toBe(false);
      expect(computeUnlocks(level)[key]).toBe(true);
    }
  });

  it('unlocks everything at the level cap', () => {
    const unlocks = computeUnlocks(60);
    expect(Object.values(unlocks).every((value) => value === true)).toBe(true);
  });
});

describe('api envelope', () => {
  it('narrows success responses through the type guard', () => {
    const success = apiSuccess({ hello: 'vale' }, 7);
    expect(isApiSuccess(success)).toBe(true);
    if (isApiSuccess(success)) {
      expect(success.data.hello).toBe('vale');
    }
    expect(success.rev).toBe(7);
  });

  it('omits optional failure fields when they are not provided', () => {
    const failure = apiFailure('NOT_FOUND', 'nope', 1);
    expect(isApiSuccess(failure)).toBe(false);
    expect('details' in failure.error).toBe(false);
    expect('requestId' in failure.error).toBe(false);
  });

  it('carries details and request id when provided', () => {
    const failure = apiFailure('VALIDATION', 'bad', 2, {
      details: { field: 'accountName' },
      requestId: 'req-1',
    });
    expect(failure.error.details).toEqual({ field: 'accountName' });
    expect(failure.error.requestId).toBe('req-1');
  });
});

describe('error code tables', () => {
  it('defines a status and message for every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(200);
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});
