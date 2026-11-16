/** Which field the desk is filling from a read. */
export type ScanPhase = "asset" | "student";

/** One open loan the attendant can match a read against. */
export interface RouteLoan {
  /** Asset id carried through to the check-in. */
  readonly assetId: string;
  /** Tag on that asset. */
  readonly assetTag: string;
}

/** What one accepted read means at the desk. */
export type ScanRoute =
  | { readonly kind: "student" }
  | { readonly kind: "loan"; readonly assetId: string }
  | { readonly kind: "tag" };

/**
 * Decide what a read fills in.
 *
 * The student phase always answers a student, even when the payload happens to
 * equal an asset tag: the badge is the admission number, and a number that is
 * also a tag must not open a loan. The asset phase matches an open loan first,
 * then falls back to the checkout tag field.
 *
 * @param phase - Which field the desk is asking the camera for.
 * @param text - Payload the decoder read.
 * @param loans - Open loans in this university.
 * @returns The student, one loan, or a checkout tag.
 */
export function routeScan(phase: ScanPhase, text: string, loans: readonly RouteLoan[]): ScanRoute {
  const payload = text.trim();
  if (phase === "student") {
    return { kind: "student" };
  }
  for (const loan of loans) {
    if (loan.assetTag === payload) {
      return { kind: "loan", assetId: loan.assetId };
    }
  }
  return { kind: "tag" };
}
