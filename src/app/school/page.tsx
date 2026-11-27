import { orm } from "@/lib/auth-server";
import { loadSchoolMetrics } from "@/lib/metrics-store";
import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { longDate } from "@/domain/metrics";

import { requireUniversityRole } from "./guard";
import { SchoolDashboard } from "./school-dashboard";

export default async function SchoolPage() {
  const access = await requireUniversityRole(["school_admin", "dept_head"]);
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  const metrics = loadSchoolMetrics(orm, access.organizationId, now);
  const role = parseStaffRole(access.role);
  const stamp = `${longDate(eat)} - ${clock(eat)} EAT - whole university`;
  return (
    <SchoolDashboard
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={role === null ? access.role : labelStaffRole(role)}
      canStaff={access.role === "school_admin"}
      metrics={metrics}
      stamp={stamp}
      now={eat}
    />
  );
}

function clock(value: Date): string {
  return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + last).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
