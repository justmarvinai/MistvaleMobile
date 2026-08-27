import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { decode, downscale, encode, type Bitmap } from './png';

/**
 * The image codec `pnpm assets` shrinks avatars with.
 *
 * It exists because Q6 wanted a resize and the toolchain had no image library — so this is
 * a hand-written decoder, a hand-written resampler and a hand-written encoder, which is
 * three places to be quietly wrong about pixels. Wrong here does not throw: it publishes a
 * champion with a black fringe, or an off-by-one row shear nobody looks closely enough to
 * catch. So the properties are pinned rather than the output eyeballed.
 */

function bitmap(width: number, height: number, fill: (x: number, y: number) => number[]): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const at = (y * width + x) * 4;
      data[at] = r!;
      data[at + 1] = g!;
      data[at + 2] = b!;
      data[at + 3] = a!;
    }
  }
  return { width, height, data };
}

describe('encode and decode', () => {
  it('round-trips an opaque image pixel for pixel', () => {
    const source = bitmap(7, 5, (x, y) => [x * 30, y * 40, (x + y) * 20, 255]);
    const back = decode(encode(source));
    expect(back.width).toBe(7);
    expect(back.height).toBe(5);
    expect([...back.data]).toEqual([...source.data]);
  });

  it('round-trips a translucent image, alpha included', () => {
    const source = bitmap(4, 4, (x, y) => [10, 20, 30, x === y ? 0 : 128]);
    const back = decode(encode(source));
    expect([...back.data]).toEqual([...source.data]);
  });

  it('drops the alpha channel when nothing is transparent', () => {
    // Colour type 2 is truecolour, 6 is truecolour with alpha — byte 9 of IHDR, which
    // starts at offset 16 in the file. Worth twenty kilobytes on a real avatar.
    const opaque = encode(bitmap(4, 4, () => [1, 2, 3, 255]));
    const translucent = encode(bitmap(4, 4, (x) => [1, 2, 3, x === 0 ? 254 : 255]));
    expect(opaque[25]).toBe(2);
    expect(translucent[25]).toBe(6);
    expect(opaque.length).toBeLessThan(translucent.length);
  });

  it('is deterministic, because the publisher compares bytes', () => {
    const source = bitmap(9, 9, (x, y) => [x * 11, y * 13, 7, 255]);
    expect(encode(source).equals(encode(source))).toBe(true);
  });

  it('refuses what it cannot read, by name', () => {
    expect(() => decode(Buffer.alloc(32))).toThrow(/not a PNG/);
    expect(() => decode(fabricate({ depth: 16 }))).toThrow(/bit depth 16/);
    expect(() => decode(fabricate({ colour: 3 }))).toThrow(/colour type 3/);
    expect(() => decode(fabricate({ interlace: 1 }))).toThrow(/interlaced/);
  });
});

describe('downscale', () => {
  it('leaves a bitmap that already fits exactly alone', () => {
    // Identity rather than a re-sample: a small source must not be nudged by a rounding
    // error into a file that differs from the one already published.
    const source = bitmap(64, 64, (x) => [x, x, x, 255]);
    expect(downscale(source, 320)).toBe(source);
  });

  it('averages the area each new pixel covers', () => {
    // Four pixels of known value into one: the answer is their mean, not one of them.
    const source = bitmap(2, 2, (x, y) => [
      y === 0 ? (x === 0 ? 0 : 100) : x === 0 ? 200 : 40,
      0,
      0,
      255,
    ]);
    const small = downscale(source, 1);
    expect(small.width).toBe(1);
    expect(small.data[0]).toBe(Math.round((0 + 100 + 200 + 40) / 4));
  });

  it('keeps the longer side at the ceiling and the aspect ratio with it', () => {
    const small = downscale(
      bitmap(1254, 627, () => [1, 2, 3, 255]),
      320,
    );
    expect(small.width).toBe(320);
    expect(small.height).toBe(160);
  });

  /**
   * The one that would have shipped a visible defect.
   *
   * Averaging colour straight across a transparent edge drags whatever is stored in the
   * invisible pixels — usually black — into the fringe, and a cut-out champion comes out
   * with a dark outline. Weighting by alpha is what a compositor does and what this has to
   * do: a half-transparent white pixel beside a fully transparent black one is still white.
   */
  it('does not drag a transparent neighbour into the colour', () => {
    const source = bitmap(2, 1, (x) => (x === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
    const small = downscale(source, 1);
    expect(small.data[0]).toBe(255);
    expect(small.data[1]).toBe(255);
    expect(small.data[2]).toBe(255);
    // …and the pixel is half covered, which is what the alpha has to say.
    expect(small.data[3]).toBe(128);
  });
});

/** A minimal PNG with a deliberately unsupported header, for the refusal cases. */
function fabricate(over: { depth?: number; colour?: number; interlace?: number }): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = over.depth ?? 8;
  ihdr[9] = over.colour ?? 6;
  ihdr[12] = over.interlace ?? 0;
  const chunk = (type: string, body: Buffer): Buffer => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'ascii');
    body.copy(out, 8);
    return out;
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(5))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
