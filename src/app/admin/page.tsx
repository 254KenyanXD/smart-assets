import { asc } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden } from "next/navigation";

import { SchoolRail } from "@/components/school-rail";
import { ThemeToggle } from "@/components/theme-toggle";
import * as schema from "@/db/schema";
import { auth, orm } from "@/lib/auth-server";

import { InviteForm } from "./invite-form";

const staffRoles = new Set(["school_admin", "dept_head", "attendant"]);

/** One university row on the platform desk. */
interface TenantRow {
  /** University id. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Stored country. */
  readonly country: string;
  /** Email domains for this university, joined for the table. */
  readonly domains: string;
  /** Auth adapter name from the stored config, or empty when it is missing. */
  readonly adapter: string;
  /** School administrators, department heads, and attendants. Students are not staff. */
  readonly staff: number;
  /** Stored status word. */
  readonly status: string;
}

/**
 * Platform desk for the super admin: the universities on this deployment, and one staff invite.
 * Everyone else gets 403. There is no control here for adding or suspending a university.
 */
export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null || session.user.platformRole !== "super_admin") {
    forbidden();
  }

  const stored = orm
    .select({
      id: schema.universities.id,
      name: schema.universities.name,
      country: schema.universities.country,
      status: schema.universities.status,
      authConfig: schema.universities.authConfig,
    })
    .from(schema.universities)
    .orderBy(asc(schema.universities.name))
    .all();
  const domainRows = orm
    .select({
      universityId: schema.universityDomains.universityId,
      domain: schema.universityDomains.domain,
    })
    .from(schema.universityDomains)
    .orderBy(asc(schema.universityDomains.domain))
    .all();
  const memberships = orm
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
    })
    .from(schema.member)
    .all();

  const rows: readonly TenantRow[] = stored.map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
    domains: domainRows
      .filter((domain) => domain.universityId === row.id)
      .map((domain) => domain.domain)
      .join(", "),
    adapter: adapterOf(row.authConfig),
    staff: memberships.filter(
      (member) => member.organizationId === row.id && staffRoles.has(member.role),
    ).length,
    status: row.status,
  }));
  const active = rows.filter((row) => row.status === "active");
  const suspended = rows.filter((row) => row.status === "suspended").length;

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName="Platform"
        userName={session.user.name}
        userInitials={initials(session.user.name)}
        userRoleLabel="Platform administrator"
        ariaLabel="Platform"
        current="Universities"
        hrefs={{ Universities: "/admin" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-3 md:flex-row md:items-center md:justify-between md:px-7">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-[6px] text-[12px]">
              <li className="text-ink3">Platform</li>
              <li aria-hidden="true" className="text-ink3">
                <svg viewBox="0 0 14 14" className="h-3 w-3" aria-hidden="true">
                  <path d="M5 3.5 L8.5 7 L5 10.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </li>
              <li className="font-medium text-ink2">Universities</li>
            </ol>
          </nav>
          <div className="flex items-center gap-[10px]">
            <ThemeToggle />
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {initials(session.user.name)}
            </span>
          </div>
        </header>
        <main className="flex flex-col gap-5 p-[20px] md:p-[24px_28px_26px_28px]">
          <div className="flex flex-col gap-[6px]">
            <h1 className="font-display text-[24px] font-semibold text-ink">Universities</h1>
            <p className="text-[12.5px] text-ink3">
              Platform - {counted(rows.length, "tenant", "tenants")}, {active.length} active, {suspended} suspended
            </p>
          </div>
          <div className="grid grid-cols-2 gap-[14px] md:grid-cols-4">
            <SummaryTile value={rows.length} label="Tenants" />
            <SummaryTile value={active.length} label="Active" />
            <SummaryTile value={suspended} label="Suspended" />
            <SummaryTile value={domainRows.length} label="Verified domains" />
          </div>
          <section className="min-w-0 rounded-[18px] border border-line bg-surface p-[18px]">
            <h2 className="font-display text-[15px] font-semibold text-ink">Universities on this deployment</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      University
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Country
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Domains
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Adapter
                    </th>
                    <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                      Staff
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold text-ink3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-b-0">
                      <td className="py-3 pr-3 text-[12px] font-medium text-ink">{row.name}</td>
                      <td className="py-3 pr-3 text-[11.5px] text-ink2">{row.country}</td>
                      <td className="py-3 pr-3 font-mono text-[11px] text-ink2">{row.domains}</td>
                      <td className="py-3 pr-3 font-mono text-[11px] text-ink2">{row.adapter}</td>
                      <td className="py-3 pr-3 font-mono text-[11px] text-ink">{row.staff}</td>
                      <td className={`py-3 text-[11.5px] ${statusClass(row.status)}`}>{statusLabel(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="max-w-[420px] rounded-[18px] border border-line bg-surface p-[18px]">
            <InviteForm universities={active.map((row) => ({ id: row.id, name: row.name }))} />
          </section>
        </main>
      </div>
    </div>
  );
}

/**
 * One count tile from the Soft Bento platform frame.
 *
 * @param value - Count taken from the database.
 * @param label - Tile caption.
 */
function SummaryTile(props: { readonly value: number; readonly label: string }) {
  return (
    <div className="flex flex-col gap-[3px] rounded-[14px] bg-alt p-[14px]">
      <p className="font-display text-[20px] font-semibold text-ink">{props.value}</p>
      <p className="text-[10.5px] text-ink3">{props.label}</p>
    </div>
  );
}

/**
 * Two-letter mark for the signed-in user.
 *
 * @param name - Account name.
 * @returns Up to two uppercase letters, or a question mark when the name is empty.
 */
function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}

/**
 * Adapter name stored on the university, when the config has one.
 *
 * @param authConfig - JSON column from `universities.auth_config`.
 */
function adapterOf(authConfig: unknown): string {
  if (typeof authConfig !== "object" || authConfig === null || !("adapter" in authConfig)) {
    return "";
  }
  const adapter = authConfig.adapter;
  return typeof adapter === "string" ? adapter : "";
}

/**
 * Status word for the table. Known values are titled. Anything else stays as stored.
 *
 * @param status - `universities.status`.
 */
function statusLabel(status: string): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "suspended") {
    return "Suspended";
  }
  return status;
}

function statusClass(status: string): string {
  if (status === "active") {
    return "font-medium text-accent";
  }
  if (status === "suspended") {
    return "font-medium text-red";
  }
  return "text-ink2";
}

function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
