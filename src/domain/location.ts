
export const locationKinds = ["lab", "desk", "library"] as const;

export type LocationKind = (typeof locationKinds)[number];

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

export function displayLocationKind(kind: string): string {
  const parsed = parseLocationKind(kind);
  return parsed === null ? kind : labelLocationKind(parsed);
}
