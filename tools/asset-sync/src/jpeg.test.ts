import { describe, expect, it } from 'vitest';
import { decode, encode } from './jpeg';
import type { Bitmap } from './png';

/**
 * The JPEG codec, checked against what it has to survive.
 *
 * A codec is easy to write so that it *nearly* works — a wrong colour matrix, a dropped
 * restart marker or an off-by-one in the padding all produce a picture rather than an error,
 * and the picture is wrong in a way nobody notices until it is on a screen. So these tests
 * are mostly about the paths that do not come up in the happy case: a size that is not a
 * whole number of MCUs, a restart interval, a single-channel file, and every format the
 * decoder is supposed to refuse.
 *
 * The two hand-built files below are worth the fiddliness. Round-tripping through this
 * module's own encoder cannot prove the decoder reads *JPEG*; it only proves the two halves
 * agree with each other. A file assembled byte by byte from the specification's own tables
 * is the only test here that would catch both halves being wrong in the same way.
 */

function gradient(width: number, height: number): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      data[at] = Math.round((x / Math.max(1, width - 1)) * 255);
      data[at + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      data[at + 2] = 96;
      data[at + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Mean absolute per-channel difference, ignoring alpha. */
function meanError(a: Bitmap, b: Bitmap): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      total += Math.abs(a.data[i + c]! - b.data[i + c]!);
      count += 1;
    }
  }
  return total / count;
}

describe('round trip', () => {
  it('comes back as the same picture, within what quantisation costs', () => {
    const source = gradient(64, 48);
    const back = decode(encode(source, 92));
    expect(back.width).toBe(64);
    expect(back.height).toBe(48);
    // JPEG is lossy by design; what matters is that the error is quantisation-sized rather
    // than structural. A wrong colour matrix or a transposed block lands in the tens.
    expect(meanError(source, back)).toBeLessThan(4);
  });

  it('survives a size that is not a whole number of MCUs', () => {
    // 4:2:0 works in 16×16 blocks, so 37×23 exercises the padding on both axes — the edge
    // that reads past the last real pixel, and the crop that throws the padding away again.
    const source = gradient(37, 23);
    const back = decode(encode(source, 92));
    expect([back.width, back.height]).toEqual([37, 23]);
    expect(meanError(source, back)).toBeLessThan(6);
  });

  it('handles a single pixel', () => {
    const source = gradient(1, 1);
    const back = decode(encode(source));
    expect([back.width, back.height]).toEqual([1, 1]);
  });

  it('leaves every pixel opaque, since JPEG has no alpha to carry', () => {
    const back = decode(encode(gradient(16, 16)));
    for (let i = 3; i < back.data.length; i += 4) expect(back.data[i]).toBe(255);
  });

  it('gets the colour matrix right, which a gradient is too forgiving to prove', () => {
    // Twelve flat patches, each big enough to survive 4:2:0, checked channel by channel.
    // Three things had to be true for this to be worth writing. It needs **flat** patches,
    // because on a smooth gradient a wrong coefficient is worth a couple of points of mean
    // error and passes. It needs **mid-tones** as well as primaries, because a chroma *gain*
    // error is invisible on saturated colours — pure blue clamps to 255 whether the gain is
    // right or 11% high. And it needs a **tight** tolerance: measured, the real error on a
    // flat patch at quality 95 is at most 2, so anything past 4 is a defect rather than
    // quantisation. At 12 every mutation of this matrix survived.
    const swatches = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [255, 255, 255],
      [0, 0, 0],
      [200, 72, 72],
      [72, 200, 72],
      [72, 72, 200],
      [200, 176, 80],
      [96, 140, 180],
      [150, 110, 60],
    ] as const;
    const width = swatches.length * 32;
    const data = new Uint8Array(width * 32 * 4);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const swatch = swatches[Math.floor(x / 32)]!;
        data.set([swatch[0], swatch[1], swatch[2], 255], (y * width + x) * 4);
      }
    }
    const back = decode(encode({ width, height: 32, data }, 95));
    swatches.forEach((swatch, index) => {
      // The middle of each patch, well away from the ringing at its edges.
      const at = (16 * width + index * 32 + 16) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        expect(
          Math.abs(back.data[at + channel]! - swatch[channel]!),
          `swatch ${index} channel ${channel}`,
        ).toBeLessThan(4);
      }
    });
  });

  it('keeps its edges clean at a size that is not a whole number of MCUs', () => {
    // 4:2:0 works in 16×16 MCUs, so a height of 20 leaves twelve rows of padding below the
    // picture — read out of range, and the last real rows come back as noise or the encoder
    // throws on an undefined sample.
    //
    // What this deliberately does *not* claim is that the padding is filled the right way.
    // It is filled by repeating the edge, which is the conventional choice, but measured
    // against wrapping to the top of the image on the game's own key art the difference is
    // 0.3 of a level out of 255: the real rows dominate the block's fit either way. Asserting
    // it would be asserting an implementation detail with no visible consequence.
    //
    // Coloured rather than grey on purpose — luma and chroma pad on separate code paths, and
    // a grey test image has no chroma for the second one to exercise.
    const width = 32;
    const height = 20;
    const top = [220, 60, 60] as const;
    const bottom = [40, 70, 200] as const;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const colour = y < 10 ? top : bottom;
      for (let x = 0; x < width; x += 1) {
        data.set([colour[0], colour[1], colour[2], 255], (y * width + x) * 4);
      }
    }
    const back = decode(encode({ width, height, data }, 92));
    for (let x = 0; x < width; x += 1) {
      const at = ((height - 1) * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        expect(
          Math.abs(back.data[at + channel]! - bottom[channel]!),
          `column ${x} channel ${channel}`,
        ).toBeLessThan(24);
      }
    }
  });
});

describe('encode', () => {
  it('is deterministic, because the publish step diffs against what is on disk', () => {
    const source = gradient(48, 32);
    expect(encode(source, 82).equals(encode(source, 82))).toBe(true);
  });

  it('wraps the data in the markers a decoder looks for', () => {
    const out = encode(gradient(16, 16));
    expect(out.readUInt16BE(0)).toBe(0xffd8); // SOI
    expect(out.readUInt16BE(out.length - 2)).toBe(0xffd9); // EOI
  });

  it('spends bytes on quality, and the lever is real', () => {
    const source = gradient(96, 96);
    const cheap = encode(source, 40).length;
    const dear = encode(source, 95).length;
    expect(cheap).toBeLessThan(dear);
    expect(decode(encode(source, 40)).width).toBe(96);
  });

  it('refuses an empty image rather than writing a file no decoder accepts', () => {
    expect(() => encode({ width: 0, height: 0, data: new Uint8Array(0) })).toThrow(/empty/i);
  });
});

describe('decode refusals', () => {
  it('refuses something that is not a JPEG at all', () => {
    expect(() => decode(Buffer.from('not an image'))).toThrow(/not a JPEG/i);
  });

  it('refuses a progressive JPEG by name, rather than mis-reading it', () => {
    // SOI then an SOF2 header. The point is the message: an operator who hits this needs to
    // know the file is fine and the *encoding* is what has to change.
    const progressive = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc2, 0x00, 0x11, 0x08]),
      Buffer.alloc(14),
    ]);
    expect(() => decode(progressive)).toThrow(/progressive/i);
  });

  it('refuses arithmetic coding and the other exotic frame types', () => {
    const arithmetic = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc9, 0x00, 0x11, 0x08]),
      Buffer.alloc(14),
    ]);
    expect(() => decode(arithmetic)).toThrow(/unsupported JPEG encoding/i);
  });

  it('refuses anything that is not eight bits a sample', () => {
    const twelveBit = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x0c, 0, 8, 0, 8, 1, 1, 0x11, 0,
    ]);
    expect(() => decode(twelveBit)).toThrow(/8-bit/i);
  });

  it('refuses CMYK, which is four channels and a different colour model', () => {
    const cmyk = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x14, 0x08, 0x00, 0x08, 0x00, 0x08, 0x04]),
      Buffer.alloc(12),
    ]);
    expect(() => decode(cmyk)).toThrow(/CMYK/i);
  });

  it('refuses a file with no scan in it', () => {
    expect(() => decode(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toThrow(/no image data/i);
  });
});

/* ── Files built by hand from the specification ─────────────────────────────── */

/**
 * The smallest greyscale JPEG that says anything.
 *
 * One 8×8 block, a quantisation table of ones, the standard luminance Huffman tables, and
 * an entropy segment of exactly six bits: `00` is the DC symbol for "difference of size 0"
 * and `1010` is the first four-bit AC code, which is end-of-block. Padded to `00101011`.
 * A DC of zero means every sample is the level shift itself — mid grey.
 */
function greyscaleFile(entropy: number[], extra: { width?: number; dri?: number } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  const dqt = Buffer.alloc(67);
  dqt.writeUInt16BE(0xffdb, 0);
  dqt.writeUInt16BE(65, 2);
  dqt.writeUInt8(0, 4);
  dqt.fill(1, 5);
  parts.push(dqt);

  if (extra.dri !== undefined) {
    const dri = Buffer.alloc(6);
    dri.writeUInt16BE(0xffdd, 0);
    dri.writeUInt16BE(4, 2);
    dri.writeUInt16BE(extra.dri, 4);
    parts.push(dri);
  }

  const sof = Buffer.alloc(13);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(11, 2);
  sof.writeUInt8(8, 4); // precision
  sof.writeUInt16BE(8, 5); // height
  sof.writeUInt16BE(extra.width ?? 8, 7); // width
  sof.writeUInt8(1, 9); // one component
  sof.set([1, 0x11, 0], 10);
  parts.push(sof);

  const dcCounts = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
  const dcValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const acCounts = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
  const acValues = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11];
  for (const [spec, counts, values] of [
    [0x00, dcCounts, dcValues],
    [0x10, acCounts, [...acValues, ...Array(0x7d + 20 - acValues.length).fill(0xfa)]],
  ] as const) {
    const body = Buffer.from([spec, ...counts, ...values]);
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xffc4, 0);
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }

  const sos = Buffer.alloc(10);
  sos.writeUInt16BE(0xffda, 0);
  sos.writeUInt16BE(8, 2);
  sos.writeUInt8(1, 4);
  sos.set([1, 0x00, 0, 63, 0], 5);
  parts.push(sos, Buffer.from(entropy), Buffer.from([0xff, 0xd9]));

  return Buffer.concat(parts);
}

describe('a file this module did not write', () => {
  it('reads a greyscale JPEG as grey, on the single-component path', () => {
    const bitmap = decode(greyscaleFile([0b00101011]));
    expect([bitmap.width, bitmap.height]).toEqual([8, 8]);
    // Mid grey everywhere: R, G and B equal, and the level shift is 128.
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBe(128);
      expect(bitmap.data[i + 1]).toBe(128);
      expect(bitmap.data[i + 2]).toBe(128);
    }
  });

  it('obeys a restart interval, which resets the DC predictor mid-scan', () => {
    // Two MCUs across, restarting between them: block, pad, RST0, block, pad. Getting this
    // wrong does not throw — it desynchronises the bit reader and the second half of the
    // picture comes out as noise, which is exactly the failure that needs a test.
    const bitmap = decode(
      greyscaleFile([0b00101011, 0xff, 0xd0, 0b00101011], { width: 16, dri: 1 }),
    );
    expect([bitmap.width, bitmap.height]).toEqual([16, 8]);
    for (let i = 0; i < bitmap.data.length; i += 4) expect(bitmap.data[i]).toBe(128);
  });
});
