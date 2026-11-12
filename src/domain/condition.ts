/** Condition grades from the Soft Bento check-in frame. */
export const conditions = ["good", "wear", "damaged"] as const;

/** A grade recorded when an asset comes back. */
export type Condition = (typeof conditions)[number];

/**
 * Parse a condition grade.
 *
 * @param value - Text from a form or a row.
 * @returns The grade, or null when it is not one of the three.
 */
export function parseCondition(value: string): Condition | null {
  switch (value) {
    case "good":
    case "wear":
    case "damaged":
      return value;
    default:
      return null;
  }
}

/**
 * Words for a condition grade.
 *
 * @param condition - A parsed grade.
 * @returns The label from the check-in frame.
 */
export function labelCondition(condition: Condition): string {
  switch (condition) {
    case "good":
      return "Good";
    case "wear":
      return "Minor wear";
    case "damaged":
      return "Damaged";
  }
}
