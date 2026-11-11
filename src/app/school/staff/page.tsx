import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import * as schema from "@/db/schema";
import { labelStaffRole, tableStaffRole } from "@/domain/staff-invite";
import { auth, orm } from "@/lib/auth-server";
import { listStaffDirectory, listUniversityDepartments } from "@/lib/staff-invite-store";

import { StaffBoard, type StaffDepartmentChoice, type StaffDisplayRow } from "./staff-board";

/**
 * Staff desk for one university. A school admin is the only role that reaches this page:
 * a super admin already has /admin, and students and attendants must not see staff records.
 */
export default async function StaffPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  if (typeof organizationId !== "string") {
    forbidden();
  }
  const membership = orm
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, session.user.id)))
    .get();
  if (membership === undefined || membership.role !== "school_admin") {
    forbidden();
  }
  const university = orm
    .select({ name: schema.universities.name, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, organizationId))
    .get();
  if (university === undefined || university.status !== "active") {
    forbidden();
  }

  const directory = listStaffDirectory(orm, organizationId, new Date());
  const rows: readonly StaffDisplayRow[] = directory.map((row) => ({
    name: row.name,
    email: row.email,
    roleLabel: tableStaffRole(row.role),
    department: row.department,
    status: row.status === "active" && row.banned ? "deactivated" : row.status,
    canDeactivate: row.status === "active" && !row.banned && (row.role === "attendant" || row.role === "dept_head"),
  }));
  const departments: readonly StaffDepartmentChoice[] = listUniversityDepartments(orm, organizationId);

  return (
    <StaffBoard
      universityId={organizationId}
      universityName={university.name}
      userName={session.user.name}
      userInitials={initials(session.user.name)}
      userRoleLabel={labelStaffRole("school_admin")}
      departments={departments}
      rows={rows}
    />
  );
}

/**
 * Two-letter mark for the signed-in user.
 *
 * @param name - Account or profile name.
 * @returns Up to two uppercase letters, or a question mark when the name is empty.
 */
function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
