import { readBarcodes, type ReadResult, type ReaderOptions } from "zxing-wasm/reader";

import type { ScanFormat, ScanHit } from "./types";

/**
 * Reading and writing the zxing module.
 *
 * The decoder is zxing-wasm, the WASM build of zxing-cpp. It is the only
 * decoder in the app: the worker in `decode.worker.ts` calls these functions
 * and nothing here touches React or the DOM state.
 *
 * The module needs a URL for `zxing_reader.wasm`. The worker points it at the
 * copy under `public/scanner/`, and a test points it at the file in
 * `node_modules`. Nothing in this file fetches anything itself.
 */

/** Only the formats the desk asks for. zxing names them, `types.ts` names the desk side. */
const READER_OPTIONS: ReaderOptions = {
  formats: ["EAN13", "Code128", "QRCode"],
  tryHarder: true,
  maxNumberOfSymbols: 4,
};

const NO_HITS: readonly ScanHit[] = [];

/** One decoded symbol, before the format is checked. */
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

/**
 * Keeps the reads the desk can act on.
 *
 * A format outside the desk list is dropped, not remapped: an EAN-8 or a
 * Data Matrix is not an asset tag or a badge.
 *
 * @param results - Whatever zxing returned for one frame.
 * @returns The usable reads, in the order they were found.
 */
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

/**
 * Decodes one encoded image.
 *
 * The container is sniffed by the decoder, so `mime` only decides whether the
 * bytes are worth handing over at all.
 *
 * @param bytes - A PNG, JPEG, BMP or GIF file.
 * @param mime - Its media type, for example `image/png`.
 * @returns Every usable read, or an empty list for a blank or unreadable frame.
 */
export async function decodeImage(bytes: Uint8Array, mime: string): Promise<readonly ScanHit[]> {
  if (bytes.byteLength === 0) return NO_HITS;
  if (!mime.toLowerCase().startsWith("image/")) return NO_HITS;
  try {
    return toHits(await readBarcodes(bytes, READER_OPTIONS));
  } catch {
    // A blank frame, a truncated file or a frame the decoder gives up on is
    // not an error the desk can act on. It is a frame with nothing in it.
    return NO_HITS;
  }
}

/**
 * Decodes one camera frame that has already been rasterised.
 *
 * This is the worker path: the pixels are copied as-is, so a frame costs no
 * image encoding on the way in.
 *
 * @param frame - RGBA pixels of one video frame.
 * @returns Every usable read, or an empty list.
 */
export async function decodeFrame(frame: ImageData): Promise<readonly ScanHit[]> {
  try {
    return toHits(await readBarcodes(frame, READER_OPTIONS));
  } catch {
    return NO_HITS;
  }
}
