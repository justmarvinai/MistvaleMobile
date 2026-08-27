import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Reading, shrinking and writing a PNG, with nothing installed to do it.
 *
 * Q6: the champion avatars are exported at 1254×1254 and the game draws them at 150px on a
 * card and 44px on an arena portrait, so opening the roster pulled roughly 9 MB of art the
 * screen had no use for — on a 1-core box, the largest single thing a player downloads by
 * an order of magnitude, growing with every champion that gets a face.
 *
 * The obvious fix was `sharp`, and the reason Q6 sat open is that `sharp` is a native
 * module that has to build on the VPS — a locked-stack decision rather than a tidy-up. It
 * turned out not to be needed: the avatars are **PNG**, Node ships zlib, and a PNG is a
 * zlib stream with five per-row filters in front of it. That is the whole format, for the
 * kind of file an exporter emits.
 *
 * Deliberately small, and it throws rather than guessing. Palette, 16-bit and interlaced
 * files are refused by name, because an asset pipeline that silently publishes the wrong
 * pixels is worse than one that stops and says which file it could not read.
 */

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, four bytes per pixel, row-major. */
  data: Uint8Array;
}

const SIGNATURE = 0x89504e47;

export function decode(png: Buffer): Bitmap {
  if (png.length < 8 || png.readUInt32BE(0) !== SIGNATURE) throw new Error('not a PNG');

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
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth} (only 8 is read)`);
      if (colour !== 2 && colour !== 6) {
        throw new Error(
          `unsupported colour type ${colour} (only truecolour, with or without alpha)`,
        );
      }
      if (interlace !== 0) throw new Error('interlaced PNGs are not read');
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }

    at += 12 + length;
  }

  if (!width || !height) throw new Error('PNG has no IHDR');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  let read = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const line = new Uint8Array(raw.subarray(read, read + stride));
    read += stride;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels]! : 0;
      const b = previous[x]!;
      const c = x >= channels ? previous[x - channels]! : 0;
      const value = line[x]!;
      if (filter === 1) line[x] = (value + a) & 0xff;
      else if (filter === 2) line[x] = (value + b) & 0xff;
      else if (filter === 3) line[x] = (value + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) line[x] = (value + paeth(a, b, c)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown row filter ${String(filter)}`);
    }

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      data[to] = line[from]!;
      data[to + 1] = line[from + 1]!;
      data[to + 2] = line[from + 2]!;
      data[to + 3] = channels === 4 ? line[from + 3]! : 255;
    }

    previous = line;
  }

  return { width, height, data };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Shrinks so the longest side is at most `maxSide`, by averaging the area each new pixel
 * covers.
 *
 * Area averaging rather than nearest-neighbour, and the difference is not subtle at this
 * ratio: 1254 → 320 is nearly four to one, so a nearest sample throws away fifteen pixels
 * in sixteen and the result crawls with aliasing on every edge in the art. Averaging is
 * what a mipmap does and what the eye expects from a photograph shrunk.
 *
 * **Alpha-weighted**, which matters for a cut-out portrait: averaging colour straight
 * across a transparent edge drags the background's black into the fringe, so the champion
 * ends up outlined. Colours are weighted by their own alpha and divided by the alpha sum,
 * which is the same premultiply-then-divide every compositor does.
 *
 * Returns the bitmap unchanged when it already fits, so a small source is not re-encoded
 * into a slightly different file for no reason.
 */
export function downscale(bitmap: Bitmap, maxSide: number): Bitmap {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxSide) return bitmap;

  const scale = maxSide / longest;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * bitmap.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * bitmap.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * bitmap.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * bitmap.width) / width));

      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const at = (sy * bitmap.width + sx) * 4;
          const a = bitmap.data[at + 3]!;
          r += bitmap.data[at]! * a;
          g += bitmap.data[at + 1]! * a;
          b += bitmap.data[at + 2]! * a;
          alpha += a;
          count += 1;
        }
      }

      const to = (y * width + x) * 4;
      if (alpha > 0) {
        data[to] = Math.round(r / alpha);
        data[to + 1] = Math.round(g / alpha);
        data[to + 2] = Math.round(b / alpha);
      }
      data[to + 3] = Math.round(alpha / count);
    }
  }

  return { width, height, data };
}

/**
 * Writes an 8-bit PNG — RGB when the bitmap is fully opaque, RGBA when it is not.
 *
 * Two choices here, both measured on the real avatars rather than assumed, because the
 * first cut of this guessed at one of them and guessed wrong.
 *
 * **Every row is filtered `Paeth`.** The guess was that a shrunk photograph has little for
 * a filter to find and `None` would cost a couple of percent. Measured, `None` is 239 KB
 * and `Paeth` is 198 — seventeen percent, on the largest thing a player downloads. Trying
 * all five per row and keeping the smallest, which is what a real encoder does, then buys a
 * further **0.4 KB**: nearly all the benefit is in simply predicting from the neighbours,
 * so one rule for every row is the whole of the win without five to be right about.
 *
 * **Alpha is dropped when nothing is transparent.** The champion avatars are cut-outs on a
 * painted ground and are opaque to the last pixel, so a fourth channel is a byte per pixel
 * of nothing — twenty more kilobytes. Checked per file rather than assumed, since the next
 * avatar delivered may well have a soft edge.
 *
 * Deterministic, which the publisher relies on: it compares the bytes it would write with
 * the bytes already there, so the same source must always encode to the same file.
 */
export function encode(bitmap: Bitmap): Buffer {
  const opaque = isOpaque(bitmap);
  const channels = opaque ? 3 : 4;
  const stride = bitmap.width * channels;
  const raw = Buffer.allocUnsafe((stride + 1) * bitmap.height);
  let previous = new Uint8Array(stride);

  for (let y = 0; y < bitmap.height; y += 1) {
    // The row as it is, which the next row predicts from.
    const line = new Uint8Array(stride);
    for (let x = 0; x < bitmap.width; x += 1) {
      const from = (y * bitmap.width + x) * 4;
      const to = x * channels;
      line[to] = bitmap.data[from]!;
      line[to + 1] = bitmap.data[from + 1]!;
      line[to + 2] = bitmap.data[from + 2]!;
      if (channels === 4) line[to + 3] = bitmap.data[from + 3]!;
    }

    const at = y * (stride + 1);
    raw[at] = 4; // Paeth
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels]! : 0;
      const b = previous[i]!;
      const c = i >= channels ? previous[i - channels]! : 0;
      raw[at + 1 + i] = (line[i]! - paeth(a, b, c)) & 0xff;
    }
    previous = line;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bitmap.width, 0);
  ihdr.writeUInt32BE(bitmap.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // truecolour, with alpha only when something needs it
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Whether every pixel is fully opaque, and so whether the alpha channel earns its byte. */
function isOpaque(bitmap: Bitmap): boolean {
  for (let at = 3; at < bitmap.data.length; at += 4) {
    if (bitmap.data[at] !== 255) return false;
  }
  return true;
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.allocUnsafe(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
