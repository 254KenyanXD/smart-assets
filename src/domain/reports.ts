/** The four reports from the written list. Audit trail is not one of them. */
export const reportKinds = ["inventory", "custody", "demand", "depreciation"] as const;

/** One report a caller can download. */
export type ReportKind = (typeof reportKinds)[number];

/** How far a role may see into a report that it is allowed to download. */
export type ReportScope = "university" | "day" | "borrower";

/** A university role, or the platform super admin, as stored. */
export type ReportRole = "super_admin" | "school_admin" | "dept_head" | "attendant" | "student";

/**
 * Parse a report name from a route or a query string.
 *
 * @param value - Untrusted text.
 * @returns The kind, or null when it is not one of the four.
 */
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

/**
 * Title printed on the file and on the page.
 *
 * @param kind - A parsed report kind.
 */
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

/**
 * Download name without the file extension.
 *
 * @param kind - A parsed report kind.
 */
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

/**
 * Short label for the report switch on the department page.
 *
 * @param kind - A parsed report kind.
 */
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

/**
 * Who may download this report, and how the rows are cut.
 * A super admin names one university. That is not a cross-university dump.
 * A school administrator gets inventory and depreciation for the university.
 * A department head gets all four for the university.
 * An attendant gets custody history for the UTC day.
 * A student gets custody history for their own loans.
 *
 * @param role - Role loaded from membership, or super admin from the account.
 * @param kind - The report being asked for.
 * @returns The scope, or null when this role cannot download this report.
 */
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

/**
 * Reports the department page shows for this university role.
 * An attendant and a student do not use that page.
 *
 * @param role - Role string from membership.
 */
export function pageReportKinds(role: string): readonly ReportKind[] {
  if (role === "dept_head") {
    return reportKinds;
  }
  if (role === "school_admin") {
    return ["inventory", "depreciation"];
  }
  return [];
}
