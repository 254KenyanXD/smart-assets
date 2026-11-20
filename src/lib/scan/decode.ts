import { readBarcodes, type ReadResult, type ReaderOptions } from "zxing-wasm/reader";

import type { ScanFormat, ScanHit } from "./types";

const READER_OPTIONS: ReaderOptions = {
  formats: ["EAN13", "Code128", "QRCode"],
  tryHarder: true,
  maxNumberOfSymbols: 4,
};

const NO_HITS: readonly ScanHit[] = [];

function toFormat(zxingFormat: string): ScanFormat | null {
  switch (zxingFormat) {
    case "EAN13":
      return "ean_13";
    case "Code128":
      return "code_128";
    case "QRCode":
      return "qr_code";
    default:
      return null;
  }
}

function toHits(results: readonly ReadResult[]): readonly ScanHit[] {
  const hits: ScanHit[] = [];
  for (const result of results) {
    if (!result.isValid || result.text.length === 0) continue;
    const format = toFormat(result.format);
    if (format === null) continue;
    hits.push({ text: result.text, format });
  }
  return hits;
}

export async function decodeImage(bytes: Uint8Array, mime: string): Promise<readonly ScanHit[]> {
  if (bytes.byteLength === 0) return NO_HITS;
  if (!mime.toLowerCase().startsWith("image/")) return NO_HITS;
  try {
    return toHits(await readBarcodes(bytes, READER_OPTIONS));
  } catch {
    return NO_HITS;
  }
}

export async function decodeFrame(frame: ImageData): Promise<readonly ScanHit[]> {
  try {
    return toHits(await readBarcodes(frame, READER_OPTIONS));
  } catch {
    return NO_HITS;
  }
}
