import { labelStaffRole } from "@/domain/staff-invite";

import { requireUniversityRole } from "../../school/guard";
import { ScannerLab } from "./scanner-lab";

/**
 * Scanner lab. One image, or the live camera, timed on the device in front of
 * the person holding it. It records nothing: no checkout, no check-in, no tag.
 * An attendant only, the same guard as the desk.
 */
export default async function ScannerLabPage() {
  const access = await requireUniversityRole(["attendant"]);
  return (
    <ScannerLab
      universityName={access.universityName}
      userName={access.userName}
      userInitials={initials(access.userName)}
      userRoleLabel={labelStaffRole("attendant")}
      subtitle={`Frame timings on this device - ${access.userName}`}
    />
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
