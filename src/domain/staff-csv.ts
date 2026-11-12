import { parseStaffRole, tableStaffRole, type StaffRole } from "@/domain/staff-invite";

/** Data rows allowed in one staff file. */
export const CSV_MAX_ROWS = 500;

/** Bytes allowed in one staff file. The role plan's 2 MB probe is over this cap. */
export const CSV_MAX_BYTES = 1024 * 1024;

/** Header the template and every import must use. */
export const STAFF_CSV_HEADER = "full_name,email,role,department,employee_id";

/** Shown when the file is larger than the cap. Checked before any row is read. */
export const CSV_TOO_BIG_MESSAGE = "This file is over the 1 MB limit.";

/** Shown when the file has more than 500 data rows. Checked before row rules run. */
export const CSV_TOO_MANY_MESSAGE = "This file has more than 500 rows.";

/** Shown when the first line is not the template header. */
export const CSV_HEADER_MESSAGE = "The header must be full_name,email,role,department,employee_id.";

/** Shown when a school administrator row is in the file. */
export const CSV_ADMIN_MESSAGE = "Use the single invite form.";

/** Shown when a commit has no row that can become an invite. */
export const CSV_NOTHING_MESSAGE = "Nothing to invite.";

/** One preview row. Sample names from the design are not used here. */
export interface StaffCsvRow {
  /** 1-based data line, after the header. */
  readonly line: number;
  /** Name from the file. */
  readonly fullName: string;
  /** Email from the file, lowercased when it is usable. */
  readonly email: string;
  /** Parsed role, or null when the row cannot be invited. */
  readonly role: StaffRole | null;
  /** Role cell from the file, kept for the results file. */
  readonly roleText: string;
  /** Words for the role column. */
  readonly roleLabel: string;
  /** Department name from the file, or empty. */
  readonly departmentName: string;
  /** Employee id from the file, or empty. */
  readonly employeeId: string;
  /** Invite when commit may create a link. Skip when the row is left out. */
  readonly result: "invite" | "skip";
  /** Why the row was skipped. Null when it will be invited. */
  readonly reason: string | null;
}

/**
 * Decide what a staff file would do, without writing.
 *
 * @param csv - The file text.
 * @param departmentNames - Department names that belong to the session university.
 * @param takenEmails - Emails that already have an account or a pending invite.
 * @returns The preview, or why the file was refused before row rules.
 */
export function previewStaffCsv(
  csv: string,
  departmentNames: readonly string[],
  takenEmails: readonly string[],
): { readonly _tag: "ready"; readonly rows: readonly StaffCsvRow[]; readonly inviteCount: number; readonly skipCount: number } | { readonly _tag: "rejected"; readonly message: string } {
  const bytes = new TextEncoder().encode(csv).byteLength;
  if (bytes > CSV_MAX_BYTES) {
    return { _tag: "rejected", message: CSV_TOO_BIG_MESSAGE };
  }
  const source = csv.replace(/^\uFEFF/, "");
  const physical = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (physical.length === 0) {
    return { _tag: "rejected", message: CSV_HEADER_MESSAGE };
  }
  if (physical.length - 1 > CSV_MAX_ROWS) {
    return { _tag: "rejected", message: CSV_TOO_MANY_MESSAGE };
  }
  const table = parseCsv(source);
  const header = table[0]?.map((cell) => cell.trim()).join(",");
  if (header !== STAFF_CSV_HEADER) {
    return { _tag: "rejected", message: CSV_HEADER_MESSAGE };
  }
  const known = departmentCounts(departmentNames);
  const taken = new Set(takenEmails.map((email) => email.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: StaffCsvRow[] = [];
  const data = table.slice(1);
  for (let index = 0; index < data.length; index++) {
    const cells = data[index] ?? [];
    rows.push(classifyRow(index + 1, cells, known, taken, seen));
  }
  const inviteCount = rows.filter((row) => row.result === "invite").length;
  return { _tag: "ready", rows, inviteCount, skipCount: rows.length - inviteCount };
}

/**
 * Build the results file. A cell that starts with a formula mark is prefixed.
 *
 * @param rows - Preview rows, with a link only for rows that were written.
 * @returns CSV text. The link column is empty when the row was skipped.
 */
export function staffResultsCsv(rows: readonly (StaffCsvRow & { readonly link: string })[]): string {
  const lines = ["full_name,email,role,department,employee_id,result,link"];
  for (const row of rows) {
    lines.push(
      [
        escapeCell(row.fullName),
        escapeCell(row.email),
        escapeCell(row.roleText),
        escapeCell(row.departmentName),
        escapeCell(row.employeeId),
        escapeCell(row.result === "invite" ? "invite" : (row.reason ?? "skip")),
        escapeCell(row.link),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

function classifyRow(
  line: number,
  cells: readonly string[],
  known: ReadonlyMap<string, number>,
  taken: Set<string>,
  seen: Set<string>,
): StaffCsvRow {
  const fullName = (cells[0] ?? "").trim();
  const email = (cells[1] ?? "").trim().toLowerCase();
  const roleText = (cells[2] ?? "").trim();
  const departmentName = (cells[3] ?? "").trim();
  const employeeId = (cells[4] ?? "").trim();
  const base = { line, fullName, email, roleText, departmentName, employeeId };
  const role = parseStaffRole(roleText);
  const roleLabel = role === null ? roleText : tableStaffRole(role);
  if (fullName.length === 0 || fullName.length > 120) {
    return skipped(base, roleLabel, "The name is missing.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return skipped(base, roleLabel, "The email is not valid.");
  }
  if (roleText === "school_admin") {
    return skipped(base, roleLabel, CSV_ADMIN_MESSAGE);
  }
  if (role === null || role === "school_admin") {
    return skipped(base, roleLabel, "That role is not invited from a file.");
  }
  if (employeeId.length > 64) {
    return skipped(base, roleLabel, "The employee id is too long.");
  }
  if (departmentName.length > 0 && known.get(departmentName.toLowerCase()) !== 1) {
    return skipped(base, roleLabel, "That department is not part of this university.");
  }
  if (taken.has(email) || seen.has(email)) {
    return skipped(base, roleLabel, "An account or a pending invite already uses this email.");
  }
  seen.add(email);
  return {
    ...base,
    role,
    roleLabel: tableStaffRole(role),
    result: "invite",
    reason: null,
  };
}

function skipped(
  base: {
    readonly line: number;
    readonly fullName: string;
    readonly email: string;
    readonly roleText: string;
    readonly departmentName: string;
    readonly employeeId: string;
  },
  roleLabel: string,
  reason: string,
): StaffCsvRow {
  return { ...base, role: null, roleLabel, result: "skip", reason };
}

function departmentCounts(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function escapeCell(value: string): string {
  let cell = value;
  if (cell.startsWith("=") || cell.startsWith("+") || cell.startsWith("-") || cell.startsWith("@")) {
    cell = `'${cell}`;
  }
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      cell = "";
      if (row.some((part) => part.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((part) => part.trim().length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}
