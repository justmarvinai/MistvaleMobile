import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Session tokens.
 *
 * The client holds a 256-bit random token; the database stores only its peppered
 * SHA-256 hash. A database leak therefore yields no usable sessions, and rotating
 * SESSION_PEPPER logs everyone out at once.
 *
 * SHA-256 (not argon2) is correct here: the token is already high-entropy random, so
 * there is nothing to brute-force, and session lookup happens on every request.
 */

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

/** Constant-time comparison for equal-length hex digests. */
export function tokensMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function sessionExpiryFrom(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
