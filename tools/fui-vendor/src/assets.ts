/**
 * Pruning `assets.css` down to the art that was actually vendored.
 *
 * The library's `assets.css` declares `--fui-img-*` for every asset it has, across every
 * pack. Mistvale vendors a subset — the packs it ships plus whatever the Dark Ember theme
 * reaches for — so most of those declarations point at files that are not in `public/fui`.
 *
 * That was thought to cost nothing, on the reasoning that a custom property nothing reads is
 * never fetched. True at runtime; not true at build time. Vite resolves every `url()` it
 * finds in CSS, and each unresolvable one is a warning — twenty-eight of them on every
 * production build, which is exactly the sort of standing noise that hides the warning that
 * matters. It is also a latent trap: a component pointed at one of those slots renders an
 * empty box rather than falling back, and nothing says why.
 *
 * So the declarations are pruned to what is on disk. Done here rather than by hand, because
 * `src/fui/` is vendored output and a hand-edit would vanish on the next run.
 */

/** `--fui-img-foo`, `--fui-ar-foo`, `--fui-bw-foo`, `--fui-slice-foo` → `foo`. */
const DECLARATION = /^\s*--fui-(?:img|ar|bw|slice)-([a-z0-9-]+)\s*:/i;

/** The file a `url("/fui/pack/name.png")` names, or null for anything else. */
function urlTarget(line: string): string | null {
  return /url\(\s*["']?\/fui\/([^"')]+?)["']?\s*\)/.exec(line)?.[1] ?? null;
}

/**
 * Drops every asset declaration whose image is not present.
 *
 * `has` is asked about pack-relative paths exactly as they appear in the stylesheet, e.g.
 * `stone-vine/panel-arch.png`. An asset's companion lines — aspect ratio, border widths,
 * nine-slice numbers — go with it, matched on the id rather than on a prefix so
 * `bar-track-stone` and `bar-track-stone-1` cannot be confused for one another.
 */
export function pruneAssetsCss(css: string, has: (file: string) => boolean): string {
  const missing = new Set<string>();

  // First pass: which ids have no image on disk.
  for (const line of css.split('\n')) {
    const id = DECLARATION.exec(line)?.[1];
    const target = urlTarget(line);
    if (id && target && !has(target)) missing.add(id);
  }

  if (missing.size === 0) return css;

  // Second pass: drop every line belonging to one of them.
  const kept = css.split('\n').filter((line) => {
    const id = DECLARATION.exec(line)?.[1];
    return id === undefined || !missing.has(id);
  });

  return kept.join('\n');
}
