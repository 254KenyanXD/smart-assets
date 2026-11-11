/** The only states an asset is allowed to sit in. */
export const assetStates = ["procured", "available", "in_custody", "under_maintenance", "decommissioned"] as const;

/** One custody state from the written state list. */
export type AssetState = (typeof assetStates)[number];

const moves: Record<AssetState, readonly AssetState[]> = {
  procured: ["available"],
  available: ["in_custody", "under_maintenance", "decommissioned"],
  in_custody: ["available"],
  under_maintenance: ["available", "decommissioned"],
  decommissioned: [],
};

/**
 * Parse a stored state.
 *
 * @param value - Text from a row or a form.
 * @returns The state, or null when the text is not one of the five.
 */
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

/**
 * Words for a state in a table.
 *
 * @param state - A parsed asset state.
 * @returns The label shown on the inventory desk.
 */
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

/**
 * Decide whether a move is on the written list.
 * The caller writes the audit row. This function does not.
 *
 * @param from - The state the asset is in now.
 * @param to - The state the caller asked for.
 * @returns Allow, or reject when the move is not on the list.
 */
export function decideMove(
  from: AssetState,
  to: AssetState,
): { readonly _tag: "allow" } | { readonly _tag: "reject" } {
  return moves[from].includes(to) ? { _tag: "allow" } : { _tag: "reject" };
}
