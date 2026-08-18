import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat ESLint config for the Mistvale monorepo.
 * Type-aware linting is enabled per-package via `projectService`.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.cache/**',
      '**/drizzle/**',
      '**/public/**',
      '**/coverage/**',
      'assets/**',
      // The vendored FantasyUIs library. Held to this repo's rules it raises a hundred
      // findings about code nobody here may edit — `pnpm fui:vendor` overwrites the tree
      // byte-for-byte from upstream, so a fix applied here would vanish on the next
      // vendor and turn a copy into a merge. The library lints itself upstream, with its
      // own `npm run audit` enforcing invariants a linter cannot see (teardown for every
      // timer, `ns:verb` on every event, no reach for the global `document`).
      //
      // Only the vendored subdirectories. `src/fui/react.tsx` is Mistvale's own bridge
      // and is linted like everything else we wrote.
      'apps/client/src/fui/components/**',
      'apps/client/src/fui/core/**',
      'apps/client/src/fui/styles/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level tooling that belongs to no package tsconfig. The browser specs
          // deliberately are *not* here: they have their own `e2e/tsconfig.json`, because
          // the inferred default project caps at eight files and every phase adds a spec.
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            'playwright.config.ts',
            'apps/server/build.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },
  {
    // React rules apply to the client only; the server and engine have no components.
    files: ['apps/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The client renders the engine's event contract, so it needs the engine's
      // *types* — but shipping its code would put game math on the client, which is a
      // hard rule (CLAUDE.md). Type imports are erased at build; value imports are not.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@mistvale/engine',
              message:
                'The client may import engine types only. Game math runs on the server; use `import type`.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    // Plain-JS build tooling runs in Node, outside any package's TypeScript project.
    files: ['**/build.js', 'eslint.config.js', 'vitest.config.ts'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  prettier,
);
