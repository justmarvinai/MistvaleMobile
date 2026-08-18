import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The completeness check that makes `resetAccountState` trustworthy.
 *
 * Its failure mode is silence: a store added in a later phase, holding one more piece of
 * an account, that nobody remembers to clear. Nothing about the code would look wrong and
 * nothing would fail — the next account would simply see a flash of the last one's data.
 *
 * So the rule is mechanical: **a store with a `reset` is account state, and account state
 * is forgotten on sign-out.** A store that genuinely is not needs to say so here, by name,
 * which is a sentence somebody has to write on purpose.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** Stores whose `reset` is deliberately not part of signing out. */
const NOT_ACCOUNT_STATE = new Set<string>([
  // Content is the same game whoever is looking at it, and re-fetching the whole bundle
  // on every sign-out would be a second's blank screen for nothing. It has no `reset`
  // today; named here so that adding one does not silently fail this test.
  'contentStore.ts',
]);

describe('signing out forgets the account', () => {
  const files = readdirSync(here).filter(
    (name) => name.endsWith('Store.ts') && !name.endsWith('.test.ts'),
  );
  const source = readFileSync(join(here, 'resetAccount.ts'), 'utf8');

  it('finds the stores to check', () => {
    // A guard on the guard: a glob that matches nothing passes every assertion below.
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    const store = readFileSync(join(here, file), 'utf8');
    const hasReset = /^\s{2}reset\(\)/m.test(store);
    if (!hasReset || NOT_ACCOUNT_STATE.has(file)) continue;

    const hook = /export const (use\w+Store)/.exec(store)?.[1];

    it(`${file} is cleared`, () => {
      expect(hook, `${file} exports a store hook`).toBeDefined();
      expect(source, `resetAccount.ts imports ${hook ?? file}`).toContain(
        `./${file.replace(/\.ts$/, '')}`,
      );
      expect(source, `resetAccount.ts calls ${hook ?? file}.getState().reset()`).toContain(
        `${hook ?? ''}.getState().reset()`,
      );
    });
  }
});
