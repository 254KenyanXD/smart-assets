
export const scanFormats = ["ean_13", "code_128", "qr_code"] as const;

export type ScanFormat = (typeof scanFormats)[number];

export interface ScanHit {
  readonly text: string;
  readonly format: ScanFormat;
}

export const SCAN_DEDUPE_MS = 1500;

export interface PriorHit {
  readonly text: string;
  readonly at: number;
}

export function acceptHit(previous: PriorHit | null, text: string, now: number): boolean {
  if (previous !== null && previous.text === text && now - previous.at < SCAN_DEDUPE_MS) {
    return false;
  }
  return true;
}
