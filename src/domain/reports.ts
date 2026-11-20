
export const reportKinds = ["inventory", "custody", "demand", "depreciation"] as const;

export type ReportKind = (typeof reportKinds)[number];

export type ReportScope = "university" | "day" | "borrower";

export type ReportRole = "super_admin" | "school_admin" | "dept_head" | "attendant" | "student";

export function parseReportKind(value: string): ReportKind | null {
  switch (value) {
    case "inventory":
    case "custody":
    case "demand":
    case "depreciation":
      return value;
    default:
      return null;
  }
}

export function reportTitle(kind: ReportKind): string {
  switch (kind) {
    case "inventory":
      return "Inventory and room audit";
    case "custody":
      return "Custody history";
    case "demand":
      return "Demand and wear";
    case "depreciation":
      return "Depreciation";
  }
}

export function reportFilename(kind: ReportKind): string {
  switch (kind) {
    case "inventory":
      return "inventory";
    case "custody":
      return "custody-history";
    case "demand":
      return "demand-and-wear";
    case "depreciation":
      return "depreciation";
  }
}

export function reportLabel(kind: ReportKind): string {
  switch (kind) {
    case "inventory":
      return "Inventory";
    case "custody":
      return "Custody history";
    case "demand":
      return "Demand and wear";
    case "depreciation":
      return "Depreciation";
  }
}

export function reportScope(role: ReportRole, kind: ReportKind): ReportScope | null {
  if (role === "super_admin" || role === "dept_head") {
    return "university";
  }
  if (role === "school_admin" && (kind === "inventory" || kind === "depreciation")) {
    return "university";
  }
  if (role === "attendant" && kind === "custody") {
    return "day";
  }
  if (role === "student" && kind === "custody") {
    return "borrower";
  }
  return null;
}

export function pageReportKinds(role: string): readonly ReportKind[] {
  if (role === "dept_head") {
    return reportKinds;
  }
  if (role === "school_admin") {
    return ["inventory", "depreciation"];
  }
  return [];
}
