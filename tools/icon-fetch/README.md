# `@mistvale/icon-fetch`

Downloads the [game-icons.net](https://game-icons.net) icons Mistvale uses, normalizes them, and
emits the client sprite plus the attribution the CC BY 3.0 licence requires.

Mistvale ships **no invented icons**. Every icon in the game comes from this tool, and the set it
fetches is declared in one file — [`src/icons.ts`](src/icons.ts). If an icon is not in that file,
it is not in the game.

## What it produces

Three files, written into `--out` (default `apps/client/public/icons/`, which is generated and
git-ignored — regenerate, don't commit):

| File             | Consumer                                                     |
| ---------------- | ------------------------------------------------------------ |
| `icons.svg`      | The client. One `<symbol>` per icon, referenced by id.       |
| `icons.json`     | The client icon component and the Settings → Credits screen. |
| `ATTRIBUTION.md` | `CREDITS.md` and the in-game credits page.                   |

### Using the sprite

Symbol ids are `mv-<key>`, where `<key>` is the key from `src/icons.ts` — `mv-stat-atk`,
`mv-debuff-poison`, `mv-nav-haven`:

```html
<svg class="icon" aria-hidden="true"><use href="/icons/icons.svg#mv-stat-atk" /></svg>
```

```scss
.icon {
  width: 1em;
  height: 1em;
  color: tokens.$mist-accent; // fills are stripped, so `color` drives the icon
}
```

Every symbol carries `viewBox="0 0 512 512"` and `fill="currentColor"`, so an icon takes its colour
from CSS like text does — that is what lets one sprite serve element tints, rarity colours and
disabled states without duplicate assets.

### `icons.json`

```jsonc
{
  "generatedBy": "tools/icon-fetch",
  "generatedAt": "…",
  "sprite": "icons.svg",
  "source": { "site": "…", "repository": "…", "ref": "master" },
  "license": "CC BY 3.0",
  "licenseUrl": "…",
  "count": 79,
  "icons": {
    "stat-atk": {
      "symbolId": "mv-stat-atk",
      "sourceName": "broadsword",
      "author": "lorc",
      "authorName": "Lorc",
      "license": "CC BY 3.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
      "url": "https://game-icons.net/1x1/lorc/broadsword.html",
      "sourceUrl": "https://raw.githubusercontent.com/…/lorc/broadsword.svg",
      "group": "stat",
      "use": "ATK",
    },
  },
}
```

## Running it

```bash
pnpm --filter @mistvale/icon-fetch icons                       # full set → apps/client/public/icons
pnpm --filter @mistvale/icon-fetch icons --dry-run             # resolve + report, write nothing
pnpm --filter @mistvale/icon-fetch icons --out dist-assets     # local sanity build
```

> **Use `icons`, or `run fetch`.** `fetch` is also a built-in pnpm command, so
> `pnpm --filter @mistvale/icon-fetch fetch` runs _pnpm's_ fetch (it populates the store and exits
> 0 without touching a single icon). The `icons` script is an unshadowed alias for the same thing;
> `pnpm --filter @mistvale/icon-fetch run fetch` works too, because `run` disambiguates.

| Flag                | Effect                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--out <dir>`       | Output directory. Relative paths resolve from `tools/icon-fetch`.                                                          |
| `--only <key,key>`  | Fetch a subset while iterating. **Outputs become partial** — the tool says so loudly; re-run without it before committing. |
| `--cache <dir>`     | Cache directory (default `.cache`).                                                                                        |
| `--concurrency <n>` | Parallel downloads, 1–16 (default 6).                                                                                      |
| `--force`           | Ignore the cache and the stored icon index; re-download everything.                                                        |
| `--dry-run`         | Resolve and report, write nothing.                                                                                         |

Exit codes: `0` success · `1` an icon failed to resolve, download or normalize · `2` usage error.

**A failed run publishes nothing.** If even one icon fails, no output file is written — a sprite
with a missing symbol renders as a silent blank chip in-game, which is far worse than a red build.

## Adding an icon

1. Find the icon on [game-icons.net](https://game-icons.net) and note its name (the URL slug,
   e.g. `frozen-block`).
2. Add an entry to `ICONS` in [`src/icons.ts`](src/icons.ts), in the right group:

   ```ts
   'debuff-petrify': { group: 'debuff', name: 'stoned-skull', use: 'Petrify' },
   ```

3. Re-run `pnpm --filter @mistvale/icon-fetch icons`.

That is the whole change — the sprite, the manifest and `ATTRIBUTION.md` are generated, and the new
icon is available as `mv-debuff-petrify`. A name that does not exist upstream fails the run with a
non-zero exit, so the map cannot drift into fiction.

**Author pins.** 47 names in the set are published by more than one author. The tool refuses to
guess (attribution has to name the right person) and tells you to pin one:

```ts
tomes: { group: 'currency', name: 'book-cover', use: 'Skill tomes', author: 'delapouite' },
```

## How it works

1. **Resolve** — an icon name has to be mapped to its author folder, since the mirror is laid out
   as `<author>/<name>.svg`. The tool fetches the repository tree from the GitHub API once and
   caches it as `.cache/icon-index.json`. When the API is unavailable — it is rate-limited to 60
   requests/hour anonymously and blocked on some networks — it falls back to probing
   `raw.githubusercontent.com` per author folder, most-populated first, and caches what it learns.
   Set `GITHUB_TOKEN` to raise the API limit; it is never required.
2. **Download** — concurrency-limited, retried with exponential backoff and jitter, cached under
   `.cache/svg/<author>/<name>.svg`. Every write is atomic, so an interrupted run cannot leave a
   truncated file that a later run trusts as a cache hit.
3. **Normalize** — each source icon is a black square with a white glyph on top:

   ```svg
   <svg viewBox="0 0 512 512">
     <path d="M0 0h512v512H0z"/>   <!-- opaque background, removed -->
     <path fill="#fff" d="…"/>     <!-- the glyph; fill stripped -->
   </svg>
   ```

   The background is only removed when its geometry matches the viewBox exactly, so a glyph that
   legitimately spans the canvas survives. Anything unexpected — an element other than `<path>` or
   `<circle>`, an `id` that would collide inside the shared sprite, an external reference — throws
   rather than shipping mangled art.

4. **Emit** — sprite, manifest, attribution.

### No runtime dependencies

The tool uses Node 22's built-in `fetch` and nothing else. `svgo` was considered and skipped: the
upstream files are already minified and structurally uniform, so it would add a large dependency
tree for a rounding error on a file that gzips to roughly a third of its size. The normalizer is
~120 lines and fails loudly instead of silently "fixing" things.

## Licensing obligation — read this

The icons are licensed **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**. That licence
is free but not unconditional: it requires that **the authors are credited wherever their work
appears**. For Mistvale that means all three of these stay true:

- `ATTRIBUTION.md` is generated on every run and is the source for the in-game
  **Settings → Credits** screen and for the game-icons row in `CREDITS.md`.
- The licence notice is embedded in `icons.svg` itself, so the obligation travels with the file.
- Removing an author's credit while still shipping their icon is a licence violation. Do not
  hand-edit the generated files; change `src/icons.ts` and regenerate.

Per `docs/ASSET_GUIDE.md §3`, no third-party asset enters the game without a `CREDITS.md` entry.
