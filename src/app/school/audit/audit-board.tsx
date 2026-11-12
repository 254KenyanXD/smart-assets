import { ThemeToggle } from "@/components/theme-toggle";
import { SchoolRail } from "@/components/school-rail";
import type { AuditEntry } from "@/lib/audit-store";

/**
 * Audit trail for one university. Rows come from the audit log. None are invented.
 */
export function AuditBoard(props: {
  /** University name in the rail and the breadcrumb. */
  readonly universityName: string;
  /** Signed-in person. */
  readonly userName: string;
  /** Two-letter mark. */
  readonly userInitials: string;
  /** Words for the signed-in role. */
  readonly userRoleLabel: string;
  /** Newest first. Empty until something in this university is audited. */
  readonly rows: readonly AuditEntry[];
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Audit trail"
        current="Audit trail"
        hrefs={{
          Staff: "/school/staff",
          Inventory: "/school/inventory",
          Reports: "/school/reports",
          "Audit trail": "/school/audit",
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-[6px] text-[12px]">
              <li className="text-ink3">{props.universityName}</li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li className="font-medium text-ink2">Audit trail</li>
            </ol>
          </nav>
          <div className="flex items-center gap-[10px]">
            <ThemeToggle />
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {props.userInitials}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-5 p-[20px] md:p-[24px_28px_26px_28px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="font-display text-[24px] font-semibold text-ink">Audit trail</h1>
            <p className="text-[12.5px] text-ink3">
              {props.universityName} - {props.rows.length} {props.rows.length === 1 ? "row" : "rows"}
            </p>
          </div>
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      When
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Action
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Actor
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Target
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold text-ink3">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {props.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-ink2">
                        No audit rows yet.
                      </td>
                    </tr>
                  ) : (
                    props.rows.map((row) => (
                      <tr key={row.id} className="border-b border-line">
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-ink2">{row.at}</td>
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-ink">{row.action}</td>
                        <td className="py-2.5 pr-3 text-[12px] text-ink">{row.actorName}</td>
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-ink2">{row.target}</td>
                        <td className="py-2.5 text-[12px] text-ink2">{row.detail}</td>
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
