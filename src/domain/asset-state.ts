
export const assetStates = ["procured", "available", "in_custody", "under_maintenance", "decommissioned"] as const;

export type AssetState = (typeof assetStates)[number];

const moves: Record<AssetState, readonly AssetState[]> = {
  procured: ["available"],
  available: ["in_custody", "under_maintenance", "decommissioned"],
  in_custody: ["available"],
  under_maintenance: ["available", "decommissioned"],
  decommissioned: [],
};

export function parseAssetState(value: string): AssetState | null {
  switch (value) {
    case "procured":
    case "available":
    case "in_custody":
    case "under_maintenance":
    case "decommissioned":
      return value;
    default:
      return null;
  }
}

export function labelAssetState(state: AssetState): string {
  switch (state) {
    case "procured":
      return "Procured";
    case "available":
      return "Available";
    case "in_custody":
      return "In custody";
    case "under_maintenance":
      return "Under maintenance";
    case "decommissioned":
      return "Decommissioned";
  }
}

export function decideMove(
  from: AssetState,
  to: AssetState,
): { readonly _tag: "allow" } | { readonly _tag: "reject" } {
  return moves[from].includes(to) ? { _tag: "allow" } : { _tag: "reject" };
}
