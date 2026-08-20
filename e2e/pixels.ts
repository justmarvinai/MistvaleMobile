import { inflateSync } from 'node:zlib';

/**
 * Reading pixels out of a screenshot.
 *
 * The suite could always assert on the DOM, and everything drawn in the DOM is covered by
 * `visible.spec.ts`. The battlefield is not in the DOM: it is a WebGL canvas, and to every
 * test in this repo it has always been an opaque rectangle. That is exactly how a fight
 * could render **nothing at all** — no champions, no enemies — while forty tests walked
 * through it happily, which is what the owner was looking at on 2026-08-20.
 *
 * Pixi renders without `preserveDrawingBuffer`, deliberately: keeping the buffer around
 * costs memory and bandwidth on a one-core box for something only a test wants. So the
 * pixels are read the other way round — Playwright composites the canvas into a PNG, and
 * this decodes it.
 *
 * Small on purpose. It handles exactly what Playwright emits: 8-bit, non-interlaced,
 * truecolour with or without alpha. Anything else throws rather than guessing, because a
 * test that silently measures the wrong bytes is worse than one that fails.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, row-major. */
  data: Uint8Array;
}

export function decodePng(png: Buffer): Bitmap {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];

  // Chunk walk: length, type, payload, CRC.
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      const interlace = body[12];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colour !== 2 && colour !== 6) throw new Error(`unsupported colour type ${colour}`);
      if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }

    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));

    // The five PNG line filters, each relative to the pixel left (a), above (b) and
    // above-left (c) — §9 of the spec, and the only fiddly part of this file.
    for (let x = 0; x < stride; x += 1) {
      const a = (x >= channels ? line[x - channels] : 0) ?? 0;
      const b = previous[x] ?? 0;
      const c = (x >= channels ? previous[x - channels] : 0) ?? 0;
      const value = source[x] ?? 0;
      line[x] =
        filter === 0
          ? value
          : filter === 1
            ? (value + a) & 0xff
            : filter === 2
              ? (value + b) & 0xff
              : filter === 3
                ? (value + ((a + b) >> 1)) & 0xff
                : (value + paeth(a, b, c)) & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = line[from] ?? 0;
      out[to + 1] = line[from + 1] ?? 0;
      out[to + 2] = line[from + 2] ?? 0;
      out[to + 3] = channels === 4 ? (line[from + 3] ?? 255) : 255;
    }

    previous.set(line);
  }

  return { width, height, data: out };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * How much of a bitmap is not the near-black the battlefield is painted on.
 *
 * The backdrop is a ground plate and a horizon band, all within a few points of
 * `#0c0a09`–`#171310`, so anything appreciably brighter is a thing that was drawn: a
 * champion, an enemy, a health bar, a floating number. Returned as a fraction so a caller
 * can say "more than a hundredth of this box has something in it" without caring how big
 * the box is.
 */
export function litFraction(bitmap: Bitmap, threshold = 42): number {
  let lit = 0;
  for (let at = 0; at < bitmap.data.length; at += 4) {
    const r = bitmap.data[at] ?? 0;
    const g = bitmap.data[at + 1] ?? 0;
    const b = bitmap.data[at + 2] ?? 0;
    if (Math.max(r, g, b) > threshold) lit += 1;
  }
  return lit / (bitmap.width * bitmap.height);
}
