import { SchoolRail, type SchoolNavLabel } from "@/components/school-rail";

import type { SchoolMetrics } from "@/lib/metrics-store";

export function SchoolDashboard(props: {
  readonly universityName: string;
  readonly userName: string;
  readonly userInitials: string;
  readonly userRoleLabel: string;
  readonly canStaff: boolean;
  readonly metrics: SchoolMetrics;
  readonly stamp: string;
  readonly now: Date;
}) {
  const hrefs: Partial<Record<SchoolNavLabel, string>> = props.canStaff
    ? {
        Overview: "/school",
        Inventory: "/school/inventory",
        Reports: "/school/reports",
        Staff: "/school/staff",
        "Audit trail": "/school/audit",
      }
    : {
        Overview: "/school",
        Inventory: "/school/inventory",
        Reports: "/school/reports",
      };
  const { assets, custody, conditions, categories, locations, finance, found, activity } = props.metrics;
  const peak = Math.max(...activity, 1);
  const periodLoans = categories.reduce((sum, row) => sum + row.loans, 0);
  const attention: readonly { readonly text: string; readonly tone: "red" | "amber" | "accent" }[] = [
    ...(custody.overdue > 0
      ? [
          {
            text: `${custody.overdue} ${custody.overdue === 1 ? "loan" : "loans"} past due`,
            tone: "red" as const,
          },
        ]
      : []),
    ...(conditions.damaged > 0
      ? [
          {
            text: `${conditions.damaged} ${conditions.damaged === 1 ? "return" : "returns"} graded damaged`,
            tone: "amber" as const,
          },
        ]
      : []),
    ...(found.total > 0
      ? [{ text: `${found.total} found tags unclaimed`, tone: "accent" as const }]
      : []),
  ];
  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="School"
        current="Overview"
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
              <li className="font-medium text-ink2">Operations</li>
            </ol>
          </nav>
          <div className="flex items-center gap-[10px]">
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {props.userInitials}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-4 p-[20px] md:p-[22px_28px_24px_28px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-[5px]">
              <h1 className="font-display text-[26px] font-semibold text-ink">Operations</h1>
              <p className="text-[12.5px] text-ink3">{props.stamp}</p>
            </div>
            <a
              href="/reports/custody?format=pdf"
              className="inline-flex h-9 items-center justify-center gap-[7px] rounded-[10px] border border-line bg-surface px-[13px] text-[12.5px] font-medium text-ink"
            >
              <svg viewBox="0 0 14 14" className="h-[14px] w-[14px]" aria-hidden="true">
                <path
                  d="M7 1v8m0 0 3-3m-3 3L4 6M2 11.5h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              Day report
            </a>
          </div>

          <section className="flex flex-col gap-5 rounded-[18px] border border-line bg-surface p-5 md:flex-row md:items-center md:gap-5">
            <div className="flex w-full shrink-0 flex-col gap-1 md:w-[286px]">
              <p className="text-[10px] font-semibold tracking-[0.8px] text-ink3">UTILISATION</p>
              <div className="flex items-end gap-[6px]">
                <p className="font-mono text-[52px] font-semibold leading-none text-ink">{assets.utilisation}%</p>
              </div>
              <p className="text-[11.5px] text-ink2">
                {assets.onLoan} of {assets.serviceable} serviceable assets are out
              </p>
              <div className="mt-1 flex h-[34px] w-full max-w-[250px] items-end gap-[3px]" aria-hidden="true">
                {activity.map((count, index) => (
                  <span
                    key={index}
                    className={`min-h-[3px] flex-1 rounded-[2px] ${index === activity.length - 1 ? "bg-accent" : "bg-accsoft"}`}
                    style={{ height: `${Math.max(3, Math.round((count / peak) * 34))}px` }}
                  />
                ))}
              </div>
            </div>
            <div className="hidden h-[140px] w-px shrink-0 bg-line md:block" />
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-4 md:flex md:w-auto md:flex-1 md:gap-0">
              <HeroStat
                label="Overdue"
                value={custody.overdue}
                sub={custody.overdue === 0 ? "none late" : `${custody.oldestOverdueDays} days late`}
                tone="red"
              />
              <HeroStat label="Due today" value={custody.dueToday} sub="due by 23:59" />
              <HeroStat label="Returns today" value={custody.returnsToday} sub={`${custody.checkoutsToday} out today`} />
              <HeroStat label="Found tags" value={found.total} sub={`${found.lastWeek} this week`} tone="amber" />
            </div>
            <div className="hidden h-[140px] w-px shrink-0 bg-line md:block" />
            <div className="flex w-full flex-col gap-[9px] md:w-[300px]">
              <p className="text-[11px] font-semibold text-ink2">Needs a person</p>
              {attention.length === 0 ? (
                <p className="text-[11px] text-ink3">Nothing waiting.</p>
              ) : (
                attention.slice(0, 3).map((row) => (
                  <div
                    key={row.text}
                    className={`flex items-center gap-2 rounded-[10px] px-[10px] py-2 ${
                      row.tone === "red" ? "bg-redbg" : row.tone === "amber" ? "bg-amberbg" : "bg-accsoft"
                    }`}
                  >
                    <span
                      className={`h-[6px] w-[6px] shrink-0 rounded-full ${
                        row.tone === "red" ? "bg-red" : row.tone === "amber" ? "bg-amber" : "bg-accent"
                      }`}
                    />
                    <span
                      className={`text-[11px] font-medium ${
                        row.tone === "red" ? "text-red" : row.tone === "amber" ? "text-amber" : "text-accent"
                      }`}
                    >
                      {row.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="flex flex-col gap-4 lg:flex-row">
            <section className="min-w-0 flex-1 rounded-[18px] border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-[2px]">
                  <h2 className="font-display text-[14px] font-semibold text-ink">Where the stock is</h2>
                  <p className="text-[10.5px] text-ink3">Assets by location, with what is out now</p>
                </div>
                <a href="/school/inventory" className="text-[10.5px] font-medium text-accent">
                  Manage locations
                </a>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      {[
                        ["Location", ""],
                        ["Assets", "w-[70px]"],
                        ["Out", "w-[50px]"],
                        ["Overdue", "w-[70px]"],
                        ["Last return", "w-[110px]"],
                      ].map(([label, width]) => (
                        <th
                          key={label}
                          scope="col"
                          className={`py-[6px] pr-2 text-[9.5px] font-medium tracking-[0.2px] text-ink3 ${width}`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locations.slice(0, 4).map((row) => (
                      <tr key={row.id ?? "none"} className="border-b border-line last:border-b-0">
                        <td className="py-[9px] pr-2">
                          <span className="flex items-center gap-[7px]">
                            <span
                              className={`h-[6px] w-[6px] shrink-0 rounded-full ${row.overdue > 0 ? "bg-red" : "bg-accsoft"}`}
                            />
                            <span className="text-[11.5px] font-medium text-ink">{row.name}</span>
                          </span>
                        </td>
                        <td className="py-[9px] pr-2 font-mono text-[11px] text-ink2">{row.assets}</td>
                        <td className="py-[9px] pr-2 font-mono text-[11px] text-ink">{row.out}</td>
                        <td className={`py-[9px] pr-2 font-mono text-[11px] ${row.overdue > 0 ? "text-red" : "text-ink3"}`}>
                          {row.overdue > 0 ? row.overdue : "-"}
                        </td>
                        <td className="py-[9px] text-[10.5px] text-ink3">{lastReturn(row.lastReturn, props.now)}</td>
                      </tr>
                    ))}
                    {locations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-[12px] text-ink2">
                          No locations yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex w-full flex-col gap-[11px] rounded-[18px] border border-line bg-surface p-4 lg:w-[416px]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-[14px] font-semibold text-ink">Borrowed by category</h2>
                <span className="rounded-[8px] bg-accsoft px-2 py-[4px] text-[9.5px] font-semibold text-accent">
                  {periodLoans} {periodLoans === 1 ? "loan" : "loans"}
                </span>
              </div>
              <p className="-mt-2 text-[10.5px] text-ink3">
                {props.metrics.period.label} - open a category for the assets behind it
              </p>
              {categories.length === 0 ? (
                <p className="text-[11px] text-ink3">No loans in this period.</p>
              ) : (
                categories.map((row) => (
                  <a
                    key={row.category}
                    href={`/school/reports?report=demand&category=${encodeURIComponent(row.category)}`}
                    className="flex items-center gap-[10px] border-b border-line py-[9px] last:border-b-0"
                  >
                    <span className="w-[124px] shrink-0 text-[11px] text-ink2">{row.name}</span>
                    <span className="flex min-w-0 flex-1 items-center">
                      <span
                        className={`h-[7px] rounded-[3px] ${row.name === "Laptops" ? "bg-accent" : "bg-sage"}`}
                        style={{ width: `${Math.min(132, Math.round((row.share / 40) * 132))}px` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-[11px] font-semibold text-ink">
                      {row.loans}
                    </span>
                    <span className="h-4 w-4 shrink-0 text-ink3">
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                        <path
                          d="M6 3.5 10.5 8 6 12.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </a>
                ))
              )}
            </section>
          </div>

          <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-alt px-[18px] py-[14px] sm:flex-row sm:flex-wrap sm:items-center">
            <FinanceItem label="Original cost" value={group(finance.cost)} sub="KES" />
            <FinanceItem label="Accumulated charge" value={group(finance.accumulated)} sub="straight line" />
            <FinanceItem label="Book value" value={group(finance.bookValue)} sub="today" />
            <FinanceItem label="Past useful life" value={String(finance.pastLife)} sub="assets" />
            <FinanceItem
              label="Registered assets"
              value={String(assets.registered)}
              sub={`${finance.locations} ${finance.locations === 1 ? "location" : "locations"}`}
            />
            <FinanceItem
              label="Staff accounts"
              value={String(finance.staff)}
              sub={`${finance.pendingInvites} pending ${finance.pendingInvites === 1 ? "invite" : "invites"}`}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function HeroStat(props: {
  readonly label: string;
  readonly value: number;
  readonly sub: string;
  readonly tone?: "red" | "amber";
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px] px-0 md:px-[14px]">
      <p className="text-[10px] font-medium tracking-[0.2px] text-ink3">{props.label}</p>
      <p
        className={`font-mono text-[26px] font-semibold leading-none ${
          props.tone === "red" ? "text-red" : props.tone === "amber" ? "text-amber" : "text-ink"
        }`}
      >
        {props.value}
      </p>
      <p className="text-[9.5px] text-ink3">{props.sub}</p>
    </div>
  );
}

function FinanceItem(props: { readonly label: string; readonly value: string; readonly sub: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px] px-0 sm:px-4">
      <p className="text-[9.5px] font-medium tracking-[0.2px] text-ink3">{props.label}</p>
      <p className="font-mono text-[17px] font-semibold text-ink">{props.value}</p>
      <p className="text-[9px] text-ink3">{props.sub}</p>
    </div>
  );
}

function group(value: number): string {
  return value.toLocaleString("en-GB");
}

function lastReturn(value: Date | null, now: Date): string {
  if (value === null) {
    return "-";
  }
  const today = now.toISOString().slice(0, 10);
  const day = value.toISOString().slice(0, 10);
  const time = `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  if (day === today) {
    return `Today ${time}`;
  }
  return value.toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
