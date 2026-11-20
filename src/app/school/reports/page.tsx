import { pageReportKinds, parseReportKind, type ReportKind } from "@/domain/reports";
import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { orm } from "@/lib/auth-server";
import { loadReport, type ReportTable } from "@/lib/report-store";

import { requireUniversityRole } from "../guard";
import { ReportsBoard } from "./reports-board";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const access = await requireUniversityRole(["school_admin", "dept_head"]);
  const kinds = pageReportKinds(access.role);
  const first = kinds[0];
  if (first === undefined) {
    return null;
  }
  const requested = parseReportKind((await searchParams).report ?? "");
  const selected: ReportKind = requested !== null && kinds.includes(requested) ? requested : first;
  const table: ReportTable = loadReport(orm, {
    universityId: access.organizationId,
    kind: selected,
    scope: "university",
    borrowerUserId: null,
    now: new Date(),
  });
  const role = parseStaffRole(access.role);
  return (
    <ReportsBoard
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={role === null ? access.role : labelStaffRole(role)}
      canInvite={access.role === "school_admin"}
      kinds={kinds}
      selected={selected}
      table={table}
    />
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + last).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
