/**
 * A small QR encoder for the borrower badge.
 *
 * It writes byte mode at error correction level L, for versions 1 to 6, and
 * picks the mask with the lowest penalty. A payload that does not fit in
 * version 6 is refused rather than truncated.
 */

/** The largest version this encoder writes, so no version information block is needed. */
const MAX_VERSION = 6;

/** One row of the error correction tables for level L. */
interface VersionTable {
  /** Data codewords across every block. */
  readonly dataCodewords: number;
  /** Error correction codewords per block. */
  readonly ecCodewordsPerBlock: number;
  /** Data codewords in each block, in order. */
  readonly blocks: readonly number[];
  /** Bits left over after the last codeword. */
  readonly remainderBits: number;
  /** Row and column centres of the alignment patterns. */
  readonly alignment: readonly number[];
}

/** Level L parameters, indexed by version. */
const TABLES: Readonly<Record<number, VersionTable>> = {
  1: { dataCodewords: 19, ecCodewordsPerBlock: 7, blocks: [19], remainderBits: 0, alignment: [] },
  2: { dataCodewords: 34, ecCodewordsPerBlock: 10, blocks: [34], remainderBits: 7, alignment: [6, 18] },
  3: { dataCodewords: 55, ecCodewordsPerBlock: 15, blocks: [55], remainderBits: 7, alignment: [6, 22] },
  4: { dataCodewords: 80, ecCodewordsPerBlock: 20, blocks: [80], remainderBits: 7, alignment: [6, 26] },
  5: { dataCodewords: 108, ecCodewordsPerBlock: 26, blocks: [108], remainderBits: 7, alignment: [6, 30] },
  6: { dataCodewords: 136, ecCodewordsPerBlock: 18, blocks: [68, 68], remainderBits: 7, alignment: [6, 34] },
};

/** A finished QR symbol, read one module at a time. */
export interface QrCode {
  /** Modules along one side, without the quiet zone. */
  readonly size: number;
  /**
   * Whether the module at this position is dark.
   *
   * @param x - Column, counting from the left.
   * @param y - Row, counting from the top.
   * @returns True when the module is dark.
   */
  isDark(x: number, y: number): boolean;
}

/** Powers of two and their exponents over GF(256), primitive polynomial 0x11d. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

function buildGaloisTables(): void {
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value > 0xff) value ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    EXP[i] = EXP[i - 255] ?? 0;
  }
}

buildGaloisTables();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0;
}

function polyMul(a: Uint8Array, b: Uint8Array): Uint8Array {
  const product = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i] ?? 0;
    if (left === 0) continue;
    for (let j = 0; j < b.length; j += 1) {
      product[i + j] = (product[i + j] ?? 0) ^ gfMul(left, b[j] ?? 0);
    }
  }
  return product;
}

/** The Reed-Solomon generator polynomial of the given degree. */
function generatorPoly(degree: number): Uint8Array {
  let poly: Uint8Array = Uint8Array.from([1]);
  for (let i = 0; i < degree; i += 1) {
    poly = polyMul(poly, Uint8Array.from([1, EXP[i] ?? 0]));
  }
  return poly;
}

/** The remainder of `data` divided by the generator, which is the block's error correction. */
function rsRemainder(data: Uint8Array, degree: number): Uint8Array {
  const generator = generatorPoly(degree);
  const remainder = new Uint8Array(degree);
  for (let i = 0; i < data.length; i += 1) {
    const factor = (data[i] ?? 0) ^ (remainder[0] ?? 0);
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    if (factor === 0) continue;
    for (let j = 0; j < degree; j += 1) {
      remainder[j] = (remainder[j] ?? 0) ^ gfMul(generator[j + 1] ?? 0, factor);
    }
  }
  return remainder;
}

function tableFor(version: number): VersionTable {
  const table = TABLES[version];
  if (table === undefined) throw new Error("This QR version has no table.");
  return table;
}

/** The smallest version that holds the payload, or an error when none does. */
function pickVersion(byteLength: number): number {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const table = tableFor(version);
    if (byteLength <= table.dataCodewords - 2) return version;
  }
  throw new Error("The badge payload is too long for a QR code.");
}

/** Builds the data and error correction codewords, interleaved in the order the symbol expects. */
function buildCodewords(bytes: Uint8Array, table: VersionTable): Uint8Array {
  const bits: number[] = [];
  const pushBits = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.byteLength, 8);
  for (const byte of bytes) pushBits(byte, 8);

  const capacityBits = table.dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ?? 0);
    data.push(value);
  }
  const padding = [0xec, 0x11];
  while (data.length < table.dataCodewords) {
    data.push(padding[data.length % 2] ?? 0);
  }

  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (const length of table.blocks) {
    blocks.push(Uint8Array.from(data.slice(offset, offset + length)));
    offset += length;
  }
  const corrections = blocks.map((block) => rsRemainder(block, table.ecCodewordsPerBlock));

  const codewords: number[] = [];
  const longestBlock = Math.max(...table.blocks);
  for (let i = 0; i < longestBlock; i += 1) {
    for (const block of blocks) {
      const value = block[i];
      if (value !== undefined) codewords.push(value);
    }
  }
  for (let i = 0; i < table.ecCodewordsPerBlock; i += 1) {
    for (const block of corrections) {
      const value = block[i];
      if (value !== undefined) codewords.push(value);
    }
  }
  return Uint8Array.from(codewords);
}

function setModule(grid: Uint8Array, size: number, x: number, y: number, dark: boolean): void {
  grid[y * size + x] = dark ? 1 : 0;
}

function moduleAt(grid: Uint8Array, size: number, x: number, y: number): boolean {
  return (grid[y * size + x] ?? 0) === 1;
}

function isFunctionAt(grid: Uint8Array, size: number, x: number, y: number): boolean {
  return (grid[y * size + x] ?? 0) === 1;
}

function markFunction(grid: Uint8Array, size: number, x: number, y: number): void {
  grid[y * size + x] = 1;
}

function drawFinder(modules: Uint8Array, functions: Uint8Array, size: number, originX: number, originY: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const onBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const inCentre = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      markFunction(functions, size, x, y);
      setModule(modules, size, x, y, inside && (onBorder || inCentre));
    }
  }
}

function drawAlignment(modules: Uint8Array, functions: Uint8Array, size: number, centreX: number, centreY: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const x = centreX + dx;
      const y = centreY + dy;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      markFunction(functions, size, x, y);
      setModule(modules, size, x, y, distance !== 1);
    }
  }
}

/** Paints every pattern that is not data, and marks the format areas as reserved. */
function drawFunctionPatterns(
  modules: Uint8Array,
  functions: Uint8Array,
  size: number,
  table: VersionTable,
): void {
  drawFinder(modules, functions, size, 0, 0);
  drawFinder(modules, functions, size, size - 7, 0);
  drawFinder(modules, functions, size, 0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    markFunction(functions, size, i, 6);
    setModule(modules, size, i, 6, dark);
    markFunction(functions, size, 6, i);
    setModule(modules, size, 6, i, dark);
  }

  const centres = table.alignment;
  const last = centres.length - 1;
  for (let row = 0; row <= last; row += 1) {
    for (let column = 0; column <= last; column += 1) {
      const overlapsFinder =
        (column === 0 && row === 0) || (column === last && row === 0) || (column === 0 && row === last);
      if (overlapsFinder) continue;
      const centreX = centres[column];
      const centreY = centres[row];
      if (centreX === undefined || centreY === undefined) continue;
      drawAlignment(modules, functions, size, centreX, centreY);
    }
  }

  for (let i = 0; i <= 8; i += 1) {
    markFunction(functions, size, 8, i);
    markFunction(functions, size, i, 8);
  }
  for (let i = 0; i < 8; i += 1) {
    markFunction(functions, size, size - 1 - i, 8);
  }
  for (let i = 8; i < 15; i += 1) {
    markFunction(functions, size, 8, size - 15 + i);
  }
  markFunction(functions, size, 8, size - 8);
}

/** Writes the 15 format bits, both copies, and the always dark module. */
function drawFormatBits(modules: Uint8Array, size: number, mask: number): void {
  const levelL = 1;
  const data = (levelL << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;

  const bit = (index: number): boolean => ((bits >>> index) & 1) === 1;

  for (let i = 0; i <= 5; i += 1) setModule(modules, size, 8, i, bit(i));
  setModule(modules, size, 8, 7, bit(6));
  setModule(modules, size, 8, 8, bit(7));
  setModule(modules, size, 7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) setModule(modules, size, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i += 1) setModule(modules, size, size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) setModule(modules, size, 8, size - 15 + i, bit(i));
  setModule(modules, size, 8, size - 8, true);
}

/** Lays the codewords into the zigzag path, skipping every function module. */
function placeCodewords(modules: Uint8Array, functions: Uint8Array, size: number, codewords: Uint8Array): void {
  const totalBits = codewords.length * 8;
  let index = 0;
  let right = size - 1;
  while (right >= 1) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let pair = 0; pair < 2; pair += 1) {
        const x = right - pair;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (isFunctionAt(functions, size, x, y)) continue;
        if (index >= totalBits) continue;
        const codeword = codewords[index >>> 3] ?? 0;
        setModule(modules, size, x, y, ((codeword >>> (7 - (index & 7))) & 1) === 1);
        index += 1;
      }
    }
    right -= 2;
  }
}

function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function applyMask(modules: Uint8Array, functions: Uint8Array, size: number, mask: number): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isFunctionAt(functions, size, x, y)) continue;
      if (!maskApplies(mask, x, y)) continue;
      setModule(modules, size, x, y, !moduleAt(modules, size, x, y));
    }
  }
}

function darknessPenalty(modules: Uint8Array, size: number): number {
  const total = size * size;
  let dark = 0;
  for (let i = 0; i < total; i += 1) dark += (modules[i] ?? 0) === 1 ? 1 : 0;
  const deviation = Math.abs(dark * 20 - total * 10);
  return Math.floor(deviation / total) * 10;
}

function runPenalty(modules: Uint8Array, size: number): number {
  let score = 0;
  for (let outer = 0; outer < size; outer += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      let previous = horizontal ? moduleAt(modules, size, 0, outer) : moduleAt(modules, size, outer, 0);
      for (let inner = 1; inner < size; inner += 1) {
        const current = horizontal
          ? moduleAt(modules, size, inner, outer)
          : moduleAt(modules, size, outer, inner);
        if (current === previous) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
          previous = current;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }
  return score;
}

function blockPenalty(modules: Uint8Array, size: number): number {
  let score = 0;
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const value = moduleAt(modules, size, x, y);
      if (
        value === moduleAt(modules, size, x + 1, y) &&
        value === moduleAt(modules, size, x, y + 1) &&
        value === moduleAt(modules, size, x + 1, y + 1)
      ) {
        score += 3;
      }
    }
  }
  return score;
}

function finderPenalty(modules: Uint8Array, size: number): number {
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversed = [...pattern].reverse();
  let score = 0;
  for (let outer = 0; outer < size; outer += 1) {
    for (const horizontal of [true, false]) {
      for (let inner = 0; inner + pattern.length <= size; inner += 1) {
        let forwardMatch = true;
        let reverseMatch = true;
        for (let offset = 0; offset < pattern.length; offset += 1) {
          const value = horizontal
            ? moduleAt(modules, size, inner + offset, outer)
            : moduleAt(modules, size, outer, inner + offset);
          if (value !== pattern[offset]) forwardMatch = false;
          if (value !== reversed[offset]) reverseMatch = false;
        }
        if (forwardMatch) score += 40;
        if (reverseMatch) score += 40;
      }
    }
  }
  return score;
}

function penaltyOf(modules: Uint8Array, size: number): number {
  return (
    runPenalty(modules, size) +
    blockPenalty(modules, size) +
    finderPenalty(modules, size) +
    darknessPenalty(modules, size)
  );
}

/**
 * Encodes text as a QR symbol.
 *
 * @param text - Payload, written as UTF-8 bytes.
 * @returns The finished symbol, mask and format bits included.
 * @throws When the payload does not fit in version 6 at level L.
 */
export function encodeQr(text: string): QrCode {
  if (text.length === 0) throw new Error("A QR payload cannot be empty.");
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.byteLength);
  const table = tableFor(version);
  const size = version * 4 + 17;
  const functions = new Uint8Array(size * size);
  const base = new Uint8Array(size * size);

  drawFunctionPatterns(base, functions, size, table);
  placeCodewords(base, functions, size, buildCodewords(bytes, table));

  let best: Uint8Array | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = Uint8Array.from(base);
    applyMask(candidate, functions, size, mask);
    drawFormatBits(candidate, size, mask);
    const penalty = penaltyOf(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = candidate;
    }
  }
  const modules = best;
  if (modules === null) throw new Error("The QR symbol could not be completed.");

  return {
    size,
    isDark(x: number, y: number): boolean {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      return moduleAt(modules, size, x, y);
    },
  };
}
