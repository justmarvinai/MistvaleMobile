import argon2 from 'argon2';

/**
 * Password hashing with argon2id.
 *
 * Parameters are tuned for the production box (1 core / 4 GB): roughly 40–60 ms per
 * verification, which is strong against offline cracking while still letting the single
 * core serve requests (docs/ARCHITECTURE.md §5.6).
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verifies a password against a stored hash.
 *
 * Returns false rather than throwing when the stored hash is unreadable, so a corrupt
 * row cannot turn a failed login into a 500.
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

/**
 * A dummy verification used when the account does not exist.
 *
 * Without it, "unknown account" would answer noticeably faster than "wrong password",
 * letting an attacker enumerate valid account names by timing alone.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZXM$K8pJmVDkKp5Rd6bR5pMCiKQjZ3s9SWpTZjBhZGRl';

export async function burnTimingBudget(plaintext: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, plaintext);
}
