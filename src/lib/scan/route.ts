
export type ScanPhase = "asset" | "student";

export interface RouteLoan {
  readonly assetId: string;

  readonly assetTag: string;
}

export type ScanRoute =
  | { readonly kind: "student" }
  | { readonly kind: "loan"; readonly assetId: string }
  | { readonly kind: "tag" };

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
