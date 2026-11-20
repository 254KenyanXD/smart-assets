
export const conditions = ["good", "wear", "damaged"] as const;

export type Condition = (typeof conditions)[number];

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
