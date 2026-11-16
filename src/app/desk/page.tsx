import { labelStaffRole } from "@/domain/staff-invite";
import { listAssets, listOpenCustody } from "@/lib/asset-store";
import { orm } from "@/lib/auth-server";
import { listFoundReports } from "@/lib/found-store";

import { requireUniversityRole } from "../school/guard";
import { DeskBoard, type DeskAsset, type DeskLoan } from "./desk-board";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Attendant desk. Checkout and check-in are recorded here.
 * A school administrator does not land on this page.
 */
export default async function DeskPage() {
  const access = await requireUniversityRole(["attendant"]);
  const now = new Date();
  const assets: readonly DeskAsset[] = listAssets(orm, access.organizationId, now).map((row) => ({
    title: row.title,
    tag: row.tag,
    stateLabel: row.stateLabel,
    locationName: row.locationName.length === 0 ? "No location" : row.locationName,
    conditionLabel: row.conditionLabel.length === 0 ? "None yet" : row.conditionLabel,
  }));
  const found = listFoundReports(orm, access.organizationId);
  const loans: readonly DeskLoan[] = listOpenCustody(orm, access.organizationId).map((loan) => ({
    assetId: loan.assetId,
    assetTitle: loan.assetTitle,
    assetTag: loan.assetTag,
    studentLabel: loan.officialId ?? loan.borrowerName,
    borrowerName: loan.borrowerName,
    when: clock(loan.checkedOutAt, now),
  }));
  const weekday = weekdays[now.getUTCDay()] ?? "Sunday";
  const month = months[now.getUTCMonth()] ?? "January";
  return (
    <DeskBoard
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={labelStaffRole("attendant")}
      subtitle={`${weekday} ${now.getUTCDate()} ${month} - ${access.userName} at the desk`}
      assets={assets}
      loans={loans}
      found={found}
    />
  );
}

function clock(value: Date, now: Date): string {
  const time = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
  const sameDay =
    value.getUTCFullYear() === now.getUTCFullYear() &&
    value.getUTCMonth() === now.getUTCMonth() &&
    value.getUTCDate() === now.getUTCDate();
  if (sameDay) {
    return time;
  }
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${time}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
