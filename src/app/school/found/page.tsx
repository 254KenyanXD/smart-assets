import { SchoolRail, type SchoolNavLabel } from "@/components/school-rail";
import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { orm } from "@/lib/auth-server";
import { listFoundReports } from "@/lib/found-store";

import { requireUniversityRole } from "../guard";

export default async function FoundPage() {
  const access = await requireUniversityRole(["school_admin", "dept_head"]);
  const rows = listFoundReports(orm, access.organizationId);
  const role = parseStaffRole(access.role);
  const hrefs: Partial<Record<SchoolNavLabel, string>> =
    access.role === "school_admin"
      ? {
          Overview: "/school",
          Inventory: "/school/inventory",
          Reports: "/school/reports",
          Staff: "/school/staff",
          "Audit trail": "/school/audit",
        }
      : { Overview: "/school", Inventory: "/school/inventory", Reports: "/school/reports" };
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={access.universityName}
        userName={access.userName}
        userInitials={initials(access.userName)}
        userRoleLabel={role === null ? access.role : labelStaffRole(role)}
        ariaLabel="School"
        current="Overview"
        hrefs={hrefs}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-[6px] text-[12px]">
              <li className="text-ink3">{access.universityName}</li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li>
                <a href="/school" className="text-ink3">
                  Operations
                </a>
              </li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li className="font-medium text-ink2">Found tags</li>
            </ol>
          </nav>
          <div className="flex items-center gap-[10px]">
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {initials(access.userName)}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-4 p-[20px] md:p-[22px_28px_24px_28px]">
          <div className="flex flex-col gap-[5px]">
            <h1 className="font-display text-[26px] font-semibold text-ink">Found tags</h1>
            <p className="text-[12.5px] text-ink3">
              {rows.length} {rows.length === 1 ? "tag" : "tags"} handed in and not yet claimed
            </p>
          </div>
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Asset", "Location", "Note", "Found"].map((label) => (
                      <th key={label} scope="col" className="py-[6px] pr-2 text-[9.5px] font-medium tracking-[0.2px] text-ink3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-[12px] text-ink2">
                        No found tags.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-b-0">
                        <td className="py-[9px] pr-2">
                          <span className="flex flex-col gap-[1px]">
                            <span className="text-[11.5px] font-medium text-ink">{row.assetTitle}</span>
                            <span className="font-mono text-[9px] text-ink3">{row.assetTag}</span>
                          </span>
                        </td>
                        <td className="py-[9px] pr-2 text-[11px] text-ink2">{row.locationName ?? "No location"}</td>
                        <td className="py-[9px] pr-2 text-[11px] text-ink2">{row.note ?? "-"}</td>
                        <td className="py-[9px] font-mono text-[10.5px] text-ink3">{stamp(row.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function stamp(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day} ${hour}:${minute}`;
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + last).toUpperCase();
  return mark.length > 0 ? mark : "?";
}
