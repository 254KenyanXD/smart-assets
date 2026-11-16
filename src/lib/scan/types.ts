/** Formats the desk asks a decoder to read. */
export const scanFormats = ["ean_13", "code_128", "qr_code"] as const;

/** One format from the desk list. */
export type ScanFormat = (typeof scanFormats)[number];

/** One accepted read. `text` is the payload, unchanged. */
export interface ScanHit {
  readonly text: string;
  readonly format: ScanFormat;
}

/** The same payload inside this window is one event. */
export const SCAN_DEDUPE_MS = 1500;

/** The last payload the loop already handed to the desk. */
export interface PriorHit {
  readonly text: string;
  readonly at: number;
}

/**
 * Whether this read is a new event.
 * The same text inside `SCAN_DEDUPE_MS` is ignored. A different text is accepted.
 *
 * @param previous - The last accepted hit, or null before the first one.
 * @param text - Payload from the decoder.
 * @param now - Clock reading in milliseconds.
 * @returns True when the desk should see this read.
 */
export function acceptHit(previous: PriorHit | null, text: string, now: number): boolean {
  if (previous !== null && previous.text === text && now - previous.at < SCAN_DEDUPE_MS) {
    return false;
  }
  return true;
}
