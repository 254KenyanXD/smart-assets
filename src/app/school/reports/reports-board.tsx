import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { SchoolRail, type SchoolNavLabel } from "@/components/school-rail";
import { reportLabel, type ReportKind } from "@/domain/reports";
import type { ReportTable } from "@/lib/report-store";

/**
 * Department reports from the Soft Bento frame.
 * The table is the query. Export CSV and Export PDF download that same query.
 */
export function ReportsBoard(props: {
  /** University name in the rail and the breadcrumb. */
  readonly universityName: string;
  /** Signed-in person. */
  readonly userName: string;
  /** Two-letter mark. */
  readonly userInitials: string;
  /** Words for the signed-in role. */
  readonly userRoleLabel: string;
  /** School administrators also have the staff desk. Department heads do not. */
  readonly canInvite: boolean;
  /** Reports this role is allowed to open. */
  readonly kinds: readonly ReportKind[];
  /** The report on screen. */
  readonly selected: ReportKind;
  /** Rows for `selected`. Empty until the university has some. */
  readonly table: ReportTable;
}) {
  const hrefs: Partial<Record<SchoolNavLabel, string>> = props.canInvite
    ? {
          Staff: "/school/staff",
          Inventory: "/school/inventory",
          Reports: "/school/reports",
          "Audit trail": "/school/audit",
        }
    : { Inventory: "/school/inventory", Reports: "/school/reports" };
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Reports"
        current="Reports"
        hrefs={hrefs}
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
              <li className="font-medium text-ink2">Reports</li>
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
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-[6px]">
              <h1 className="font-display text-[24px] font-semibold text-ink">Department reports</h1>
              <p className="text-[12.5px] text-ink3">
                {props.universityName} - {props.table.department}
              </p>
            </div>
            <div className="flex flex-wrap gap-[10px]">
              <a
                href={`/reports/${props.selected}?format=csv`}
                className="inline-flex h-[46px] items-center justify-center rounded-xl border border-line bg-surface px-4 text-[13.5px] font-semibold text-ink"
              >
                Export CSV
              </a>
              <a
                href={`/reports/${props.selected}?format=pdf`}
                className="inline-flex h-[46px] items-center justify-center rounded-xl bg-accent-fill px-4 text-[13.5px] font-semibold text-white"
              >
                Export PDF
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.kinds.map((kind) => {
              const current = kind === props.selected;
              return (
                <Link
                  key={kind}
                  href={`/school/reports?report=${kind}`}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex h-[34px] items-center rounded-full px-[14px] text-[11.5px] ${
                    current ? "bg-accent-fill font-semibold text-white" : "bg-surface font-normal text-ink2"
                  }`}
                >
                  {reportLabel(kind)}
                </Link>
              );
            })}
            <p className="ml-auto font-mono text-[11px] text-ink3">{props.table.period}</p>
          </div>
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">{props.table.title}</h2>
            <div className="mt-2 flex flex-col gap-1">
              {props.table.notes.map((note) => (
                <p key={note} className="text-[12px] leading-relaxed text-ink2">
                  {note}
                </p>
              ))}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {props.table.header.map((cell) => (
                      <th key={cell} scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {props.table.rows.length === 0 ? (
                    <tr>
                      <td colSpan={props.table.header.length} className="py-6 text-sm text-ink2">
                        No rows yet.
                      </td>
                    </tr>
                  ) : (
                    props.table.rows.map((row, rowIndex) => (
                      <tr key={`${rowIndex}-${row[1] ?? row[0] ?? "row"}`} className="border-b border-line">
                        {row.map((cell, index) => (
                          <td
                            key={`${props.table.header[index] ?? "cell"}-${index}`}
                            className={`py-2.5 pr-3 text-[12px] text-ink ${index === 1 ? "font-mono text-[11px]" : ""}`}
                          >
                            {cell}
                          </td>
                        ))}
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
