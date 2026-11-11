import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { listAudit } from "@/lib/audit-store";
import { orm } from "@/lib/auth-server";

import { requireUniversityRole } from "../guard";
import { AuditBoard } from "./audit-board";

/**
 * Audit trail for the signed-in university.
 * A department head, an attendant, and a student are refused. Hiding the rail row is not this check.
 */
export default async function AuditPage() {
  const access = await requireUniversityRole(["school_admin"]);
  const role = parseStaffRole(access.role);
  return (
    <AuditBoard
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={role === null ? access.role : labelStaffRole(role)}
      rows={listAudit(orm, access.organizationId)}
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
