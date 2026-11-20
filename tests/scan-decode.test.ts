import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { prepareZXingModule } from "zxing-wasm/reader";

import { borrowerBadgeSvg } from "@/lib/scan/badge";
import { decodeImage } from "@/lib/scan/decode";
import { acceptHit, type PriorHit } from "@/lib/scan/types";

const wasm = readFileSync(
  fileURLToPath(new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url)),
);
const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer;
prepareZXingModule({ overrides: { wasmBinary } });

interface Fixture {
  readonly file: string;
  readonly format: string;
  readonly text: string;
  readonly sourceUrl: string;
  readonly license?: string;
  readonly note?: string;
}

const fixtureDirectory = fileURLToPath(new URL("./fixtures/barcodes/", import.meta.url));

function loadManifest(): readonly Fixture[] {
  const raw = readFileSync(`${fixtureDirectory}manifest.json`, "utf8");
  return JSON.parse(raw) as readonly Fixture[];
}

function mimeOf(file: string): string {
  return file.endsWith(".png") ? "image/png" : "application/octet-stream";
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const file = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    file.set(part, offset);
    offset += part.length;
  }
  return file;
}

interface SvgRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function parseBadge(svg: string): { readonly span: number; readonly rects: readonly SvgRect[] } {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (box === null) throw new Error("The badge has no view box.");
  const span = Number(box[1]);
  const rects: SvgRect[] = [];
  for (const match of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)) {
    rects.push({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    });
  }
  return { span, rects };
}

function rasterise(svg: string, scale: number): Uint8Array {
  const { span, rects } = parseBadge(svg);
  const side = span * scale;
  const rgba = new Uint8Array(side * side * 4).fill(0xff);
  for (const rect of rects) {
    for (let y = rect.y * scale; y < (rect.y + rect.height) * scale; y += 1) {
      for (let x = rect.x * scale; x < (rect.x + rect.width) * scale; x += 1) {
        const index = (y * side + x) * 4;
        rgba[index] = 0;
        rgba[index + 1] = 0;
        rgba[index + 2] = 0;
      }
    }
  }
  return encodePng(side, side, rgba);
}

describe("acceptHit", () => {
  const previous: PriorHit = { text: "SA-0001", at: 10_000 };

  test("ignores the same text inside the window", () => {
    expect(acceptHit(previous, "SA-0001", 11_000)).toBe(false);
  });

  test("accepts the same text once the window closes", () => {
    expect(acceptHit(previous, "SA-0001", 11_500)).toBe(true);
  });

  test("accepts a different text inside the window", () => {
    expect(acceptHit(previous, "SA-0002", 10_100)).toBe(true);
  });

  test("accepts the first read", () => {
    expect(acceptHit(null, "SA-0001", 10_000)).toBe(true);
  });
});

describe("decodeImage", () => {
  const fixtures = loadManifest();

  test("the manifest names a real sample for every desk format", () => {
    const formats = fixtures.map((fixture) => fixture.format);
    expect(formats).toContain("ean_13");
    expect(formats).toContain("code_128");
    expect(formats).toContain("qr_code");
    expect(fixtures.every((fixture) => fixture.sourceUrl.includes("zxing-cpp"))).toBe(true);
  });

  for (const fixture of fixtures) {
    test(`reads ${fixture.format} from ${fixture.file}`, async () => {
      const bytes = new Uint8Array(readFileSync(`${fixtureDirectory}${fixture.file}`));
      const hits = await decodeImage(bytes, mimeOf(fixture.file));
      const match = hits.find((hit) => hit.text === fixture.text && hit.format === fixture.format);
      expect(match).toBeDefined();
    });
  }

  test("returns nothing for a blank image", async () => {
    const blank = encodePng(1, 1, new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    expect(await decodeImage(blank, "image/png")).toEqual([]);
  });

  test("returns nothing for bytes that are not an image", async () => {
    expect(await decodeImage(new Uint8Array(0), "image/png")).toEqual([]);
    expect(await decodeImage(Uint8Array.from([1, 2, 3, 4]), "image/png")).toEqual([]);
  });
});

describe("borrowerBadgeSvg", () => {
  test("the admission number survives a round trip through the decoder", async () => {
    const svg = borrowerBadgeSvg("23-1943");
    const drawn = rasterise(svg, 8);
    expect(await decodeImage(drawn, "image/png")).toEqual([{ text: "23-1943", format: "qr_code" }]);
  });

  test("the payload is the identifier alone", async () => {
    const svg = borrowerBadgeSvg("23-0001");
    expect(svg).not.toContain("23-0001");
    const drawn = rasterise(svg, 8);
    expect(await decodeImage(drawn, "image/png")).toEqual([{ text: "23-0001", format: "qr_code" }]);
  });

  test("refuses an empty identifier", () => {
    expect(() => borrowerBadgeSvg("")).toThrow();
  });
});
