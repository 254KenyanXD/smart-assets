import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { listAssets, listLocations } from "@/lib/asset-store";
import { orm } from "@/lib/auth-server";
import { listUniversityDepartments } from "@/lib/staff-invite-store";

import { requireUniversityRole } from "../guard";
import { InventoryBoard, type InventoryRow } from "./inventory-board";

export default async function InventoryPage() {
  const access = await requireUniversityRole(["school_admin", "dept_head"]);
  const now = new Date();
  const rows: readonly InventoryRow[] = listAssets(orm, access.organizationId, now).map((row) => ({
    id: row.id,
    title: row.title,
    tag: row.tag,
    state: row.state,
    stateLabel: row.stateLabel,
    conditionLabel: row.conditionLabel,
    locationName: row.locationName,
    locationId: row.locationId ?? "",
    bookValue: row.bookValue === null ? "" : String(row.bookValue),
    cost: String(row.cost),
    salvage: String(row.salvage),
    usefulLifeYears: String(row.usefulLifeYears),
    purchasedOn: utcDay(row.purchasedOn),
    movedOn: utcDay(row.updatedAt),
  }));
  const role = parseStaffRole(access.role);
  const canWrite = access.role === "school_admin";
  return (
    <InventoryBoard
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={role === null ? access.role : labelStaffRole(role)}
      canWrite={canWrite}
      rows={rows}
      locations={listLocations(orm, access.organizationId)}
      departments={canWrite ? listUniversityDepartments(orm, access.organizationId) : []}
    />
  );
}

function utcDay(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
