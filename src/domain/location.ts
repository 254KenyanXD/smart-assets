/** Kinds a new location may use. A lab, a desk, or a library counter. */
export const locationKinds = ["lab", "desk", "library"] as const;

/** A kind accepted when a location is created. */
export type LocationKind = (typeof locationKinds)[number];

/**
 * Parse a location kind from a form.
 *
 * @param value - Text from the inventory form.
 * @returns The kind, or null when it is not one of the three.
 */
export function parseLocationKind(value: string): LocationKind | null {
  switch (value) {
    case "lab":
    case "desk":
    case "library":
      return value;
    default:
      return null;
  }
}

/**
 * Words for a location kind.
 *
 * @param kind - A kind accepted on create.
 * @returns The label shown on the inventory form.
 */
export function labelLocationKind(kind: LocationKind): string {
  switch (kind) {
    case "lab":
      return "Lab";
    case "desk":
      return "Desk";
    case "library":
      return "Library counter";
  }
}

/**
 * Words for a stored kind.
 * Older rows may use a word that new creates no longer accept. Those stay as stored.
 *
 * @param kind - Text from the locations table.
 * @returns The label, or the stored word when it is not one of the three.
 */
export function displayLocationKind(kind: string): string {
  const parsed = parseLocationKind(kind);
  return parsed === null ? kind : labelLocationKind(parsed);
}
