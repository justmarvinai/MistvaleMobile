import type { Bitmap } from './png';

/**
 * Baseline JPEG, decoded and encoded, with no dependencies.
 *
 * The sibling of `png.ts` and it exists for the same reason. The owner's painted art is
 * delivered as JPEG at the size it was generated — 2752×1536, ~2.8 MB apiece — and the game
 * draws it as a backdrop behind a vignette on screens no wider than 1920. Publishing it
 * untouched is the mistake C16 already fixed once for the champion avatars, and `png.ts`
 * cannot help: a JPEG is a quantised DCT bitstream rather than a filtered zlib one, and
 * nothing about the two formats is shared below the pixel buffer.
 *
 * Re-encoding to PNG is not the way out either, and it is worth saying why so nobody tries.
 * These are painted scenes — thousands of distinct colours with no flat regions — which is
 * the case PNG is worst at: the same picture that costs 2.8 MB as a JPEG costs about three
 * times that as a PNG at *half* the resolution. The format the art arrives in is the format
 * it should leave in.
 *
 * **Baseline only** (SOF0/SOF1, 8-bit, Huffman). Progressive, arithmetic-coded, 12-bit and
 * CMYK files are refused *by name* rather than mis-decoded, which is `png.ts`'s rule and the
 * one that matters: a resizer that silently produces a wrong picture is worse than one that
 * stops. Every JPEG in `assets/` is baseline, and the error says what to do if one is not.
 *
 * The encoder writes 4:2:0 with the specification's own Annex K Huffman tables. Optimised
 * tables would buy a few percent and cost a second pass over every block; a shared table set
 * is what most encoders emit and what every decoder is fastest at.
 */

/* ── Shared tables ──────────────────────────────────────────────────────────── */

/** Natural-order index of each zig-zag position. */
const ZIGZAG = new Int32Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

/** Annex K.1 — the luminance quantisation table at quality 50. */
const QUANT_LUMA = new Int32Array([
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]);

/** Annex K.2 — the chrominance table. Coarser, because the eye is. */
const QUANT_CHROMA = new Int32Array([
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]);

/** Annex K.3 — the standard Huffman tables, as (counts-per-length, values). */
const STD_DC_LUMA: [number[], number[]] = [
  [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
];
const STD_DC_CHROMA: [number[], number[]] = [
  [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
];
const STD_AC_LUMA: [number[], number[]] = [
  [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
    0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
    0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
    0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
    0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
    0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa,
  ],
];
const STD_AC_CHROMA: [number[], number[]] = [
  [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
    0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
    0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
    0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
    0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
    0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
    0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
    0xf9, 0xfa,
  ],
];

/** The 8-point DCT-II basis, precomputed: `COS[u][x] = c(u)/2 · cos((2x+1)uπ/16)`. */
const COS: Float64Array[] = Array.from({ length: 8 }, (_, u) => {
  const scale = (u === 0 ? Math.SQRT1_2 : 1) / 2;
  return Float64Array.from(
    { length: 8 },
    (_, x) => scale * Math.cos(((2 * x + 1) * u * Math.PI) / 16),
  );
});

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/* ── Decode ─────────────────────────────────────────────────────────────────── */

interface HuffTable {
  /** Flat lookup: code length → { code → value }, walked one bit at a time. */
  lookup: Map<number, number>[];
}

interface Component {
  id: number;
  h: number;
  v: number;
  quantId: number;
  /** Per-component sample plane, at that component's own (subsampled) resolution. */
  plane: Uint8ClampedArray;
  planeWidth: number;
  planeHeight: number;
  blocksPerLine: number;
  blocksPerColumn: number;
  dcTable: number;
  acTable: number;
  pred: number;
}

function buildHuff(counts: number[], values: number[]): HuffTable {
  const lookup: Map<number, number>[] = Array.from({ length: 17 }, () => new Map());
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < (counts[length - 1] ?? 0); i += 1) {
      lookup[length]!.set(code, values[k] ?? 0);
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return { lookup };
}

/**
 * Decodes a baseline JPEG to RGBA.
 *
 * Throws with a sentence naming the reason for anything it will not handle, so a file that
 * cannot be resized fails the publish rather than reaching the client wrong.
 */
export function decode(jpeg: Buffer): Bitmap {
  if (jpeg.length < 4 || jpeg.readUInt16BE(0) !== 0xffd8) throw new Error('not a JPEG');

  const quant: (Int32Array | undefined)[] = [];
  const dcTables: (HuffTable | undefined)[] = [];
  const acTables: (HuffTable | undefined)[] = [];
  let frameWidth = 0;
  let frameHeight = 0;
  let components: Component[] = [];
  let maxH = 1;
  let maxV = 1;
  let restartInterval = 0;
  let adobeTransform = -1;
  let scanned = false;

  let offset = 2;
  while (offset < jpeg.length - 1) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = jpeg[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) break;

    const length = jpeg.readUInt16BE(offset);
    const body = jpeg.subarray(offset + 2, offset + length);

    switch (marker) {
      case 0xdb: {
        // One or more quantisation tables, each 64 bytes in zig-zag order.
        let p = 0;
        while (p < body.length) {
          const spec = body[p]!;
          const precision = spec >> 4;
          if (precision !== 0) throw new Error('16-bit quantisation tables are not supported');
          const table = new Int32Array(64);
          for (let i = 0; i < 64; i += 1) table[ZIGZAG[i]!] = body[p + 1 + i]!;
          quant[spec & 15] = table;
          p += 65;
        }
        break;
      }
      case 0xc4: {
        let p = 0;
        while (p < body.length) {
          const spec = body[p]!;
          const counts = Array.from(body.subarray(p + 1, p + 17));
          const total = counts.reduce((sum, n) => sum + n, 0);
          const values = Array.from(body.subarray(p + 17, p + 17 + total));
          const table = buildHuff(counts, values);
          if (spec >> 4 === 0) dcTables[spec & 15] = table;
          else acTables[spec & 15] = table;
          p += 17 + total;
        }
        break;
      }
      case 0xdd:
        restartInterval = body.readUInt16BE(0);
        break;
      case 0xee:
        // Adobe APP14 — its transform byte is the only way to know a three-channel file is
        // YCbCr rather than RGB, and the only warning that a four-channel one is YCCK.
        if (body.subarray(0, 5).toString('latin1') === 'Adobe') adobeTransform = body[11] ?? -1;
        break;
      case 0xc0:
      case 0xc1: {
        if (body[0] !== 8) throw new Error('only 8-bit JPEGs are supported');
        frameHeight = body.readUInt16BE(1);
        frameWidth = body.readUInt16BE(3);
        const count = body[5]!;
        if (count !== 1 && count !== 3) {
          throw new Error(`unsupported JPEG with ${count} colour channels (CMYK is not supported)`);
        }
        components = [];
        for (let i = 0; i < count; i += 1) {
          const at = 6 + i * 3;
          components.push({
            id: body[at]!,
            h: body[at + 1]! >> 4,
            v: body[at + 1]! & 15,
            quantId: body[at + 2]!,
            plane: new Uint8ClampedArray(0),
            planeWidth: 0,
            planeHeight: 0,
            blocksPerLine: 0,
            blocksPerColumn: 0,
            dcTable: 0,
            acTable: 0,
            pred: 0,
          });
        }
        maxH = Math.max(...components.map((c) => c.h));
        maxV = Math.max(...components.map((c) => c.v));
        break;
      }
      case 0xc2:
        throw new Error('progressive JPEGs are not supported — re-save as baseline');
      case 0xc3:
      case 0xc5:
      case 0xc6:
      case 0xc7:
      case 0xc9:
      case 0xca:
      case 0xcb:
      case 0xcd:
      case 0xce:
      case 0xcf:
        throw new Error(`unsupported JPEG encoding (SOF marker 0xff${marker.toString(16)})`);
      case 0xda: {
        const count = body[0]!;
        for (let i = 0; i < count; i += 1) {
          const id = body[1 + i * 2]!;
          const spec = body[2 + i * 2]!;
          const component = components.find((c) => c.id === id);
          if (!component) throw new Error('scan names a component the frame does not have');
          component.dcTable = spec >> 4;
          component.acTable = spec & 15;
        }
        offset = decodeScan(jpeg, offset + length, {
          components,
          maxH,
          maxV,
          frameWidth,
          frameHeight,
          quant,
          dcTables,
          acTables,
          restartInterval,
        });
        scanned = true;
        continue;
      }
      default:
        break;
    }
    offset += length;
  }

  if (!scanned || frameWidth === 0 || frameHeight === 0) throw new Error('JPEG has no image data');
  return toRgba(components, frameWidth, frameHeight, maxH, maxV, adobeTransform);
}

interface ScanContext {
  components: Component[];
  maxH: number;
  maxV: number;
  frameWidth: number;
  frameHeight: number;
  quant: (Int32Array | undefined)[];
  dcTables: (HuffTable | undefined)[];
  acTables: (HuffTable | undefined)[];
  restartInterval: number;
}

/**
 * Reads the entropy-coded segment, filling each component's sample plane.
 *
 * Returns the offset of the marker that ended the scan, so the caller can carry on parsing.
 * The bit reader has one wrinkle that is the whole of JPEG's framing: a `0xff` byte inside
 * entropy data is followed by a stuffed `0x00`, and any *other* byte after `0xff` is a real
 * marker and the end of the data.
 */
function decodeScan(jpeg: Buffer, start: number, ctx: ScanContext): number {
  const { components, maxH, maxV, frameWidth, frameHeight } = ctx;

  const mcusPerLine = Math.ceil(frameWidth / (8 * maxH));
  const mcusPerColumn = Math.ceil(frameHeight / (8 * maxV));

  for (const component of components) {
    component.blocksPerLine = mcusPerLine * component.h;
    component.blocksPerColumn = mcusPerColumn * component.v;
    component.planeWidth = component.blocksPerLine * 8;
    component.planeHeight = component.blocksPerColumn * 8;
    component.plane = new Uint8ClampedArray(component.planeWidth * component.planeHeight);
    component.pred = 0;
  }

  let at = start;
  let bitBuffer = 0;
  let bitCount = 0;
  let ended = false;

  function readBit(): number {
    if (bitCount === 0) {
      if (at >= jpeg.length) {
        ended = true;
        return 0;
      }
      const byte = jpeg[at]!;
      at += 1;
      if (byte === 0xff) {
        const next = jpeg[at];
        if (next === 0x00) at += 1;
        else {
          // A real marker: rewind onto it and feed zeros until the caller stops asking.
          at -= 1;
          ended = true;
          return 0;
        }
      }
      bitBuffer = byte;
      bitCount = 8;
    }
    bitCount -= 1;
    return (bitBuffer >> bitCount) & 1;
  }

  function decodeHuff(table: HuffTable | undefined): number {
    if (!table) throw new Error('scan uses a Huffman table the file never defined');
    let code = 0;
    for (let length = 1; length <= 16; length += 1) {
      code = (code << 1) | readBit();
      const value = table.lookup[length]!.get(code);
      if (value !== undefined) return value;
      if (ended) return 0;
    }
    throw new Error('corrupt JPEG: no Huffman code matched in 16 bits');
  }

  /** `receive` + `extend`: read `size` bits as a signed JPEG coefficient. */
  function readCoefficient(size: number): number {
    if (size === 0) return 0;
    let value = 0;
    for (let i = 0; i < size; i += 1) value = (value << 1) | readBit();
    return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
  }

  const block = new Int32Array(64);
  const pixels = new Float64Array(64);

  function decodeBlock(component: Component, blockRow: number, blockCol: number): void {
    block.fill(0);
    const quantTable = ctx.quant[component.quantId];
    if (!quantTable) throw new Error('scan uses a quantisation table the file never defined');

    const dcSize = decodeHuff(ctx.dcTables[component.dcTable]);
    component.pred += readCoefficient(dcSize);
    block[0] = component.pred * quantTable[0]!;

    let k = 1;
    while (k < 64) {
      const rs = decodeHuff(ctx.acTables[component.acTable]);
      const run = rs >> 4;
      const size = rs & 15;
      if (size === 0) {
        if (run !== 15) break; // EOB
        k += 16;
        continue;
      }
      k += run;
      if (k > 63) break;
      const index = ZIGZAG[k]!;
      block[index] = readCoefficient(size) * quantTable[index]!;
      k += 1;
    }

    idct(block, pixels);
    const { plane, planeWidth } = component;
    const originX = blockCol * 8;
    const originY = blockRow * 8;
    for (let y = 0; y < 8; y += 1) {
      const row = (originY + y) * planeWidth + originX;
      for (let x = 0; x < 8; x += 1) plane[row + x] = pixels[y * 8 + x]! + 128;
    }
  }

  let sinceRestart = 0;
  for (let mcuRow = 0; mcuRow < mcusPerColumn; mcuRow += 1) {
    for (let mcuCol = 0; mcuCol < mcusPerLine; mcuCol += 1) {
      if (ctx.restartInterval > 0 && sinceRestart === ctx.restartInterval) {
        // Byte-align, step over the RSTn marker, and reset every DC predictor.
        bitCount = 0;
        sinceRestart = 0;
        while (at < jpeg.length - 1) {
          if (jpeg[at] === 0xff && jpeg[at + 1]! >= 0xd0 && jpeg[at + 1]! <= 0xd7) {
            at += 2;
            break;
          }
          at += 1;
        }
        for (const component of components) component.pred = 0;
        ended = false;
      }
      for (const component of components) {
        for (let v = 0; v < component.v; v += 1) {
          for (let h = 0; h < component.h; h += 1) {
            decodeBlock(component, mcuRow * component.v + v, mcuCol * component.h + h);
          }
        }
      }
      sinceRestart += 1;
    }
  }

  // Skip whatever is left of the entropy data and land on the next marker.
  while (at < jpeg.length - 1 && !(jpeg[at] === 0xff && jpeg[at + 1] !== 0x00)) at += 1;
  return at;
}

/** Separable inverse DCT. `out` is the 8×8 spatial block, still centred on zero. */
function idct(block: Int32Array, out: Float64Array): void {
  const rows = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let sum = 0;
      for (let u = 0; u < 8; u += 1) sum += COS[u]![x]! * block[y * 8 + u]!;
      rows[y * 8 + x] = sum;
    }
  }
  for (let x = 0; x < 8; x += 1) {
    for (let y = 0; y < 8; y += 1) {
      let sum = 0;
      for (let v = 0; v < 8; v += 1) sum += COS[v]![y]! * rows[v * 8 + x]!;
      out[y * 8 + x] = sum;
    }
  }
}

/** Upsamples every component to full resolution and converts to RGBA. */
function toRgba(
  components: Component[],
  width: number,
  height: number,
  maxH: number,
  maxV: number,
  adobeTransform: number,
): Bitmap {
  const data = new Uint8Array(width * height * 4);
  const grey = components.length === 1;
  // Three channels are YCbCr unless Adobe says otherwise; a bare RGB JPEG is rare and legal.
  const ycbcr = grey || adobeTransform !== 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      const sample = (component: Component): number => {
        const sx = Math.min(component.planeWidth - 1, ((x * component.h) / maxH) | 0);
        const sy = Math.min(component.planeHeight - 1, ((y * component.v) / maxV) | 0);
        return component.plane[sy * component.planeWidth + sx]!;
      };

      if (grey) {
        const value = sample(components[0]!);
        data[out] = value;
        data[out + 1] = value;
        data[out + 2] = value;
      } else if (ycbcr) {
        const luma = sample(components[0]!);
        const cb = sample(components[1]!) - 128;
        const cr = sample(components[2]!) - 128;
        data[out] = clampByte(Math.round(luma + 1.402 * cr));
        data[out + 1] = clampByte(Math.round(luma - 0.344136 * cb - 0.714136 * cr));
        data[out + 2] = clampByte(Math.round(luma + 1.772 * cb));
      } else {
        data[out] = sample(components[0]!);
        data[out + 1] = sample(components[1]!);
        data[out + 2] = sample(components[2]!);
      }
      data[out + 3] = 255;
    }
  }

  return { width, height, data };
}

/* ── Encode ─────────────────────────────────────────────────────────────────── */

/** Annex K's own rule for scaling the quality-50 tables to any quality. */
function scaleQuant(base: Int32Array, quality: number): Int32Array {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const factor = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((value) => Math.min(255, Math.max(1, Math.round((value * factor + 50) / 100))));
}

/** A Huffman table as the encoder wants it: value → [code, length]. */
function buildEncodeTable(counts: number[], values: number[]): Map<number, [number, number]> {
  const table = new Map<number, [number, number]>();
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < (counts[length - 1] ?? 0); i += 1) {
      table.set(values[k]!, [code, length]);
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return table;
}

class BitWriter {
  private readonly bytes: number[] = [];
  private buffer = 0;
  private count = 0;

  write(code: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.buffer = (this.buffer << 1) | ((code >> i) & 1);
      this.count += 1;
      if (this.count === 8) this.flushByte();
    }
  }

  /** Pads with ones, which is what the specification requires at the end of a scan. */
  finish(): Buffer {
    while (this.count !== 0) {
      this.buffer = (this.buffer << 1) | 1;
      this.count += 1;
      if (this.count === 8) this.flushByte();
    }
    return Buffer.from(this.bytes);
  }

  private flushByte(): void {
    const byte = this.buffer & 0xff;
    this.bytes.push(byte);
    // Byte stuffing: an 0xff in the data must not be mistaken for a marker.
    if (byte === 0xff) this.bytes.push(0x00);
    this.buffer = 0;
    this.count = 0;
  }
}

/** How many bits `value` needs, which is the `size` half of every JPEG symbol. */
function magnitude(value: number): number {
  let bits = 0;
  let n = Math.abs(value);
  while (n > 0) {
    bits += 1;
    n >>= 1;
  }
  return bits;
}

/** Forward DCT, separable, on a block already centred on zero. */
function fdct(input: Float64Array, out: Float64Array): void {
  const rows = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let x = 0; x < 8; x += 1) sum += COS[u]![x]! * input[y * 8 + x]!;
      rows[y * 8 + u] = sum;
    }
  }
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) sum += COS[v]![y]! * rows[y * 8 + u]!;
      out[v * 8 + u] = sum;
    }
  }
}

function segment(marker: number, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

/**
 * Encodes RGBA to a baseline JPEG: 4:2:0 chroma, Annex K Huffman tables.
 *
 * Deterministic — the same bitmap and quality always produce the same bytes — because the
 * publish step compares against what is already on disk and only writes when they differ.
 * Alpha is dropped, since JPEG has none; nothing that reaches here has any (the format is
 * chosen for painted scenery, which is opaque by construction).
 */
export function encode(bitmap: Bitmap, quality = 82): Buffer {
  const { width, height, data } = bitmap;
  if (width < 1 || height < 1) throw new Error('cannot encode an empty image');

  const lumaQuant = scaleQuant(QUANT_LUMA, quality);
  const chromaQuant = scaleQuant(QUANT_CHROMA, quality);
  const dcLuma = buildEncodeTable(...STD_DC_LUMA);
  const acLuma = buildEncodeTable(...STD_AC_LUMA);
  const dcChroma = buildEncodeTable(...STD_DC_CHROMA);
  const acChroma = buildEncodeTable(...STD_AC_CHROMA);

  // Full-resolution luma, half-resolution chroma. Both are padded out to whole MCUs by
  // clamping the read back to the last real pixel, which repeats the edge. That is what
  // every encoder does and it costs nothing, but it is worth recording that it is a matter
  // of good manners rather than correctness: measured against wrapping to the opposite edge
  // on the game's own key art, the bottom rows differ by 0.3 of a level out of 255, because
  // the real samples dominate the block's fit whatever the padding holds.
  const mcuCols = Math.ceil(width / 16);
  const mcuRows = Math.ceil(height / 16);
  const chromaWidth = mcuCols * 8;
  const chromaHeight = mcuRows * 8;
  const luma = new Float64Array(mcuCols * 16 * mcuRows * 16);
  const cb = new Float64Array(chromaWidth * chromaHeight);
  const cr = new Float64Array(chromaWidth * chromaHeight);
  const lumaWidth = mcuCols * 16;

  for (let y = 0; y < mcuRows * 16; y += 1) {
    const sy = Math.min(y, height - 1);
    for (let x = 0; x < lumaWidth; x += 1) {
      const at = (sy * width + Math.min(x, width - 1)) * 4;
      const r = data[at]!;
      const g = data[at + 1]!;
      const b = data[at + 2]!;
      luma[y * lumaWidth + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  for (let y = 0; y < chromaHeight; y += 1) {
    for (let x = 0; x < chromaWidth; x += 1) {
      // Average the 2×2 luma-resolution block this chroma sample covers.
      let sumCb = 0;
      let sumCr = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        const sy = Math.min(y * 2 + dy, height - 1);
        for (let dx = 0; dx < 2; dx += 1) {
          const at = (sy * width + Math.min(x * 2 + dx, width - 1)) * 4;
          const r = data[at]!;
          const g = data[at + 1]!;
          const b = data[at + 2]!;
          sumCb += -0.168736 * r - 0.331264 * g + 0.5 * b;
          sumCr += 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      cb[y * chromaWidth + x] = sumCb / 4;
      cr[y * chromaWidth + x] = sumCr / 4;
    }
  }

  const writer = new BitWriter();
  const input = new Float64Array(64);
  const coefficients = new Float64Array(64);
  const preds = [0, 0, 0];

  function writeBlock(
    plane: Float64Array,
    planeWidth: number,
    originX: number,
    originY: number,
    centre: number,
    quant: Int32Array,
    dc: Map<number, [number, number]>,
    ac: Map<number, [number, number]>,
    predIndex: number,
  ): void {
    for (let y = 0; y < 8; y += 1) {
      const row = (originY + y) * planeWidth + originX;
      for (let x = 0; x < 8; x += 1) input[y * 8 + x] = plane[row + x]! - centre;
    }
    fdct(input, coefficients);

    const quantised = new Int32Array(64);
    for (let i = 0; i < 64; i += 1) quantised[i] = Math.round(coefficients[i]! / quant[i]!);

    const diff = quantised[0]! - preds[predIndex]!;
    preds[predIndex] = quantised[0]!;
    const dcSize = magnitude(diff);
    const dcCode = dc.get(dcSize);
    if (!dcCode) throw new Error('DC coefficient out of range for the standard table');
    writer.write(dcCode[0], dcCode[1]);
    if (dcSize > 0) writer.write(diff < 0 ? diff + (1 << dcSize) - 1 : diff, dcSize);

    let run = 0;
    for (let k = 1; k < 64; k += 1) {
      const value = quantised[ZIGZAG[k]!]!;
      if (value === 0) {
        run += 1;
        continue;
      }
      while (run > 15) {
        const zrl = ac.get(0xf0)!;
        writer.write(zrl[0], zrl[1]);
        run -= 16;
      }
      const size = magnitude(value);
      const code = ac.get((run << 4) | size);
      if (!code) throw new Error('AC coefficient out of range for the standard table');
      writer.write(code[0], code[1]);
      writer.write(value < 0 ? value + (1 << size) - 1 : value, size);
      run = 0;
    }
    if (run > 0) {
      const eob = ac.get(0x00)!;
      writer.write(eob[0], eob[1]);
    }
  }

  for (let mcuRow = 0; mcuRow < mcuRows; mcuRow += 1) {
    for (let mcuCol = 0; mcuCol < mcuCols; mcuCol += 1) {
      for (let v = 0; v < 2; v += 1) {
        for (let h = 0; h < 2; h += 1) {
          writeBlock(
            luma,
            lumaWidth,
            mcuCol * 16 + h * 8,
            mcuRow * 16 + v * 8,
            128,
            lumaQuant,
            dcLuma,
            acLuma,
            0,
          );
        }
      }
      writeBlock(cb, chromaWidth, mcuCol * 8, mcuRow * 8, 0, chromaQuant, dcChroma, acChroma, 1);
      writeBlock(cr, chromaWidth, mcuCol * 8, mcuRow * 8, 0, chromaQuant, dcChroma, acChroma, 2);
    }
  }

  const jfif = Buffer.from([
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);

  const dqt = Buffer.concat([quantSegment(0, lumaQuant), quantSegment(1, chromaQuant)]);

  const sof = Buffer.alloc(15);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof.writeUInt8(3, 5);
  sof.set([1, 0x22, 0], 6); // luma, 2×2 sampling, quant table 0
  sof.set([2, 0x11, 1], 9);
  sof.set([3, 0x11, 1], 12);

  const dht = Buffer.concat([
    huffSegment(0x00, STD_DC_LUMA),
    huffSegment(0x10, STD_AC_LUMA),
    huffSegment(0x01, STD_DC_CHROMA),
    huffSegment(0x11, STD_AC_CHROMA),
  ]);

  const sos = Buffer.from([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, jfif),
    dqt,
    segment(0xc0, sof),
    dht,
    segment(0xda, sos),
    writer.finish(),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function quantSegment(id: number, table: Int32Array): Buffer {
  const body = Buffer.alloc(65);
  body.writeUInt8(id, 0);
  for (let i = 0; i < 64; i += 1) body.writeUInt8(table[ZIGZAG[i]!]!, 1 + i);
  return segment(0xdb, body);
}

function huffSegment(spec: number, [counts, values]: [number[], number[]]): Buffer {
  return segment(
    0xc4,
    Buffer.concat([Buffer.from([spec]), Buffer.from(counts), Buffer.from(values)]),
  );
}
