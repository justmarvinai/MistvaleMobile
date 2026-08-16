import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiryFrom,
  tokensMatch,
} from './session-token';

describe('generateSessionToken', () => {
  it('produces unique, URL-safe, high-entropy tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // 32 random bytes in base64url.
      expect(token.length).toBeGreaterThanOrEqual(42);
    }
  });
});

describe('hashSessionToken', () => {
  it('is deterministic for the same token and pepper', () => {
    expect(hashSessionToken('abc', 'pepper')).toBe(hashSessionToken('abc', 'pepper'));
  });

  it('changes when the pepper changes, so rotating it invalidates all sessions', () => {
    expect(hashSessionToken('abc', 'pepper-1')).not.toBe(hashSessionToken('abc', 'pepper-2'));
  });

  it('never returns the raw token', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token, 'pepper');
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('tokensMatch', () => {
  it('compares equal and unequal digests correctly', () => {
    const hash = hashSessionToken('abc', 'pepper');
    expect(tokensMatch(hash, hash)).toBe(true);
    expect(tokensMatch(hash, hashSessionToken('abd', 'pepper'))).toBe(false);
  });

  it('returns false on length mismatch instead of throwing', () => {
    expect(tokensMatch('short', 'a-much-longer-value')).toBe(false);
  });
});

describe('sessionExpiryFrom', () => {
  it('adds the configured number of days', () => {
    const now = new Date('2026-08-16T00:00:00.000Z');
    expect(sessionExpiryFrom(now, 30).toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });
});
