/**
 * SVG normalization.
 *
 * Every icon in the game-icons set has the same shape:
 *
 *   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
 *     <path d="M0 0h512v512H0z"/>          <- opaque black background, unwanted
 *     <path fill="#fff" d="…"/>            <- the glyph (1+ paths, occasionally a circle)
 *   </svg>
 *
 * Normalizing means: drop the background, drop the hard-coded white so the glyph inherits
 * `currentColor` from CSS, keep the viewBox, and minify. Anything that does not match the
 * expected shape throws — a silently mangled icon is worse than a failed build.
 */

export interface NormalizedSvg {
  /** viewBox copied from the source, e.g. `0 0 512 512`. */
  readonly viewBox: string;
  /** Minified inner markup, background removed and fills stripped. */
  readonly body: string;
}

export class NormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NormalizeError';
  }
}

/** The canvas every icon we ship is expected to use. */
export const EXPECTED_VIEW_BOX = '0 0 512 512';

const SVG_OPEN_TAG = /<svg\b([^>]*)>/i;
const VIEW_BOX_ATTR = /\bviewBox\s*=\s*"([^"]+)"/i;
const PATH_TAG = /<path\b[^>]*\/?>/gi;
const D_ATTR = /\bd\s*=\s*"([^"]*)"/i;
const FILL_ATTR = /\bfill\s*=\s*"([^"]*)"/i;
/** Hard-coded white — stripped so `currentColor` on the `<symbol>` drives the paint. */
const WHITE_PAINT_ATTR = /\s(?:fill|stroke)\s*=\s*"(?:#fff|#ffffff|white)"/gi;
/** `M0 0h<width>v<height>H0z` — a rect tracing the whole canvas. */
const CANVAS_RECT = /^M0 0h(\d+(?:\.\d+)?)v(\d+(?:\.\d+)?)H0z$/;
const BLACK_FILLS: ReadonlySet<string> = new Set(['#000', '#000000', 'black']);
const SUPPORTED_TAGS: ReadonlySet<string> = new Set(['path', 'circle']);

/**
 * Normalizes one raw game-icons SVG.
 *
 * @param raw  file contents as fetched
 * @param name icon name, used in error messages only
 */
export function normalizeSvg(raw: string, name: string): NormalizedSvg {
  const open = SVG_OPEN_TAG.exec(raw);
  if (open === null) throw new NormalizeError(`${name}: no <svg> root element`);

  const viewBoxMatch = VIEW_BOX_ATTR.exec(open[1] ?? '');
  if (viewBoxMatch === null) throw new NormalizeError(`${name}: <svg> has no viewBox`);
  const viewBox = (viewBoxMatch[1] ?? '').trim();

  const closeIndex = raw.lastIndexOf('</svg>');
  if (closeIndex < 0) throw new NormalizeError(`${name}: no closing </svg>`);

  const inner = raw.slice(open.index + open[0].length, closeIndex);
  const withoutBackground = stripBackgroundPlate(inner, viewBox);
  const body = minify(withoutBackground.replace(WHITE_PAINT_ATTR, ''));

  if (body.length === 0) throw new NormalizeError(`${name}: nothing left after normalization`);
  assertShippable(body, name);

  return { viewBox, body };
}

/**
 * Removes the opaque plate behind the glyph: a `<path>` that traces the full canvas and is
 * painted black (or carries no fill, which renders black). Requiring both the exact rect
 * geometry *and* a black paint means a glyph that legitimately spans the canvas survives.
 */
function stripBackgroundPlate(inner: string, viewBox: string): string {
  const [, , width, height] = viewBox.split(/\s+/);

  return inner.replace(PATH_TAG, (tag) => {
    const d = D_ATTR.exec(tag)?.[1];
    if (d === undefined) return tag;

    const rect = CANVAS_RECT.exec(d.trim());
    if (rect === null || rect[1] !== width || rect[2] !== height) return tag;

    const fill = FILL_ATTR.exec(tag)?.[1]?.toLowerCase();
    return fill === undefined || BLACK_FILLS.has(fill) ? '' : tag;
  });
}

function minify(markup: string): string {
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * The set uses only `<path>` and `<circle>`. Anything else — `<script>`, `<style>`, `<image>`,
 * external references — or an `id` that would collide inside the shared sprite means upstream
 * changed shape and a human should look before this reaches players.
 */
function assertShippable(body: string, name: string): void {
  for (const match of body.matchAll(/<([a-zA-Z][\w-]*)/g)) {
    const tag = (match[1] ?? '').toLowerCase();
    if (!SUPPORTED_TAGS.has(tag)) {
      throw new NormalizeError(`${name}: unsupported element <${tag}> — review before shipping`);
    }
  }
  if (/\sid\s*=\s*"/i.test(body)) {
    throw new NormalizeError(
      `${name}: contains an id attribute, which would collide in the sprite`,
    );
  }
  if (/\b(?:href|xlink:href)\s*=/i.test(body)) {
    throw new NormalizeError(`${name}: contains an external reference`);
  }
}
