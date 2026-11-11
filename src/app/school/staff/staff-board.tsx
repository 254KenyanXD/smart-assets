"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { SchoolRail } from "@/components/school-rail";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { CsvImport } from "./csv-import";

/** One department the invite form can attach to a staff account. */
export interface StaffDepartmentChoice {
  /** Department id from the university. */
  readonly id: string;
  /** Department name shown in the select. */
  readonly name: string;
}

/** One row of the staff table, with the role label already resolved on the server. */
export interface StaffDisplayRow {
  /** Staff member name, or the name on a pending invite. */
  readonly name: string;
  /** University email. */
  readonly email: string;
  /** Words for the university role, from the domain label helper. */
  readonly roleLabel: string;
  /** Department name, or null when the account has none. */
  readonly department: string | null;
  /** Active account, a banned account, or an invite that has not been accepted. */
  readonly status: "active" | "pending" | "deactivated";
  /** True when this school administrator may deactivate the row. */
  readonly canDeactivate: boolean;
}

/** Everything the staff desk reads from the server. */
export interface StaffBoardProps {
  /** University on this session. Every read and every invite is scoped to it. */
  readonly universityId: string;
  /** University name, used in the rail, the breadcrumb and the subtitle. */
  readonly universityName: string;
  /** Name of the signed-in school admin. */
  readonly userName: string;
  /** Two-letter mark for that account. */
  readonly userInitials: string;
  /** Words for the signed-in user's role. */
  readonly userRoleLabel: string;
  /** Departments of this university, for the invite form. */
  readonly departments: readonly StaffDepartmentChoice[];
  /** Staff accounts and pending invites in this university. */
  readonly rows: readonly StaffDisplayRow[];
}

/**
 * School admin staff desk: rail, top bar, invite card and the staff table.
 * Search filters only what this page holds, which is the staff directory.
 */
export function StaffBoard(props: StaffBoardProps) {
  const [query, setQuery] = useState("");
  const [deactivateEmail, setDeactivateEmail] = useState<string | null>(null);
  const activeCount = props.rows.filter((row) => row.status === "active").length;
  const pendingCount = props.rows.filter((row) => row.status === "pending").length;
  const needle = query.trim().toLowerCase();
  const visibleRows =
    needle.length === 0
      ? props.rows
      : props.rows.filter((row) => {
          return (
            row.name.toLowerCase().includes(needle) ||
            row.email.toLowerCase().includes(needle) ||
            row.roleLabel.toLowerCase().includes(needle)
          );
        });

  return (
    <div className="flex min-h-screen flex-col bg-bg md:flex-row">
      <SchoolRail
        universityName={props.universityName}
        userName={props.userName}
        userInitials={props.userInitials}
        userRoleLabel={props.userRoleLabel}
        ariaLabel="Staff desk"
        current="Staff"
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
              <li className="font-medium text-ink2">Staff</li>
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-[10px]">
            <input
              id="staff-search"
              type="search"
              aria-label="Search assets, tags, students"
              placeholder="Search assets, tags, students"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-[38px] w-full min-w-0 rounded-[10px] border border-line bg-alt px-3 text-[12px] text-ink outline-none placeholder:text-ink3 focus:border-accent md:w-[260px]"
            />
            <ThemeToggle />
            <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-accsoft text-[10px] font-semibold text-accent">
              {props.userInitials}
            </span>
          </div>
        </header>

        <main className="flex flex-col gap-5 p-[20px] md:p-[24px_28px_26px_28px]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-[6px]">
              <h1 className="font-display text-[24px] font-semibold text-ink">Staff</h1>
              <p className="text-[12.5px] text-ink3">
                {props.universityName} - {activeCount} active, {pendingCount} pending invites
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <a
                href="/staff-template.csv"
                download
                className="inline-flex h-[46px] items-center justify-center rounded-xl border border-line bg-surface px-4 text-[13.5px] font-semibold text-ink"
              >
                Download template
              </a>
              <a
                href="#invite-staff"
                className="inline-flex h-[46px] items-center justify-center rounded-xl bg-accent-fill px-4 text-[13.5px] font-semibold text-on-deep"
              >
                Invite staff
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-[18px] lg:flex-row lg:items-start">
            <div className="flex w-full flex-col gap-[18px] lg:w-[340px] lg:shrink-0">
              <InvitePanel universityId={props.universityId} departments={props.departments} />
              <PasswordResetPanel />
            </div>
            <section className="min-w-0 flex-1 rounded-[18px] border border-line bg-surface p-[18px]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-[15px] font-semibold text-ink">Staff accounts</h2>
                <p className="text-[11px] text-ink3">
                  {activeCount} active, {pendingCount} pending
                </p>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                        Name
                      </th>
                      <th scope="col" className="w-[88px] py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                        Role
                      </th>
                      <th scope="col" className="w-[120px] py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                        Department
                      </th>
                      <th scope="col" className="w-[108px] py-2.5 pr-3 text-[10px] font-semibold text-ink3">
                        Location
                      </th>
                      <th scope="col" className="w-[92px] py-2.5 text-[10px] font-semibold text-ink3">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-sm text-ink2">
                          No staff accounts yet.
                        </td>
                      </tr>
                    ) : visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-sm text-ink2">
                          No staff match that search.
                        </td>
                      </tr>
                    ) : (
                      visibleRows.map((row) => (
                        <tr key={row.email} className="border-b border-line last:border-b-0">
                          <td className="py-[11px] pr-3 text-[12px] font-medium text-ink">{row.name}</td>
                          <td className="py-[11px] pr-3 text-[11.5px] text-ink2">{row.roleLabel}</td>
                          <td className="py-[11px] pr-3 text-[11.5px] text-ink2">{row.department ?? ""}</td>
                          <td className="py-[11px] pr-3 text-[11.5px] text-ink2" />
                          <td className="py-[11px] text-[11.5px] font-medium">
                            {row.status === "deactivated" ? (
                              <span className="text-ink3">Deactivated</span>
                            ) : row.status === "pending" ? (
                              <span className="text-amber">Pending invite</span>
                            ) : row.canDeactivate ? (
                              <button
                                type="button"
                                className="text-red"
                                onClick={() => setDeactivateEmail(row.email)}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <span className="text-accent">Active</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {deactivateEmail !== null ? (
                <DeactivateForm
                  email={deactivateEmail}
                  name={props.rows.find((row) => row.email === deactivateEmail)?.name ?? deactivateEmail}
                  onClose={() => setDeactivateEmail(null)}
                />
              ) : null}
              <RoleReference />
            </section>
          </div>
          <CsvImport />
        </main>
      </div>
    </div>
  );
}

/**
 * Ask for a reason, then deactivate one staff account in this university.
 * The reason is required. No email is sent.
 */
function DeactivateForm({
  email,
  name,
  onClose,
}: {
  readonly email: string;
  readonly name: string;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/auth/deactivate-account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, reason }),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(messageFrom(body, "The account could not be deactivated."));
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <form className="mt-4 flex flex-col gap-[10px] rounded-[14px] border border-line bg-alt p-[14px]" onSubmit={submit}>
      <p className="text-[12px] text-ink">Deactivate {name}. This closes their sign-in.</p>
      <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="deactivate-reason">
        Reason
        <Input
          id="deactivate-reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
      <div className="flex flex-wrap gap-[8px]">
        <button
          type="submit"
          className="inline-flex h-[40px] items-center justify-center rounded-xl border border-line bg-surface px-4 text-[13px] font-semibold text-red"
          disabled={busy}
        >
          {busy ? "Deactivating" : "Deactivate account"}
        </button>
        <button
          type="button"
          className="inline-flex h-[40px] items-center justify-center rounded-xl px-3 text-[13px] font-semibold text-ink2"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Mint one password reset for an account in the signed-in university.
 * The raw link is shown once. No email is sent.
 */
function PasswordResetPanel() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setLink(null);
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(messageFrom(body, "The reset link could not be created."));
      return;
    }
    if (typeof body === "object" && body !== null && "link" in body && typeof body.link === "string") {
      setLink(body.link);
      setEmail("");
      return;
    }
    setNotice("The reset link could not be created.");
  }

  return (
    <section id="reset-password" className="w-full scroll-mt-6 rounded-[18px] border border-line bg-surface p-[18px]">
      <form className="flex flex-col gap-[11px]" onSubmit={submit}>
        <h2 className="font-display text-[14px] font-semibold text-ink">Reset a password</h2>
        <p className="text-[10.5px] leading-4 text-ink3">
          A department head, an attendant, or a student in this university. The link is shown once. No email is sent.
        </p>
        <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="reset-email">
          University email
          <Input
            id="reset-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
        {link !== null ? (
          <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink" htmlFor="reset-link">
            Copy this link. It will not be shown again.
            <Input id="reset-link" readOnly value={link} />
          </label>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating" : "Create reset link"}
        </Button>
        <p className="text-[10px] leading-[15px] text-ink3">The link expires after 72 hours.</p>
      </form>
    </section>
  );
}

/**
 * Issue one staff invite for the signed-in university.
 * The raw link is shown once and is never stored in component state beyond this visit.
 */
function InvitePanel({
  universityId,
  departments,
}: {
  readonly universityId: string;
  readonly departments: readonly StaffDepartmentChoice[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("attendant");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setLink(null);
    const payload: {
      fullName: string;
      email: string;
      role: string;
      universityId: string;
      departmentId?: string;
    } = { fullName, email, role, universityId };
    if (departmentId.length > 0) {
      payload.departmentId = departmentId;
    }
    const response = await fetch("/api/auth/staff-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(messageFrom(body, "The invite could not be created."));
      return;
    }
    if (typeof body === "object" && body !== null && "link" in body && typeof body.link === "string") {
      setLink(body.link);
      setFullName("");
      setEmail("");
      router.refresh();
      return;
    }
    setNotice("The invite could not be created.");
  }

  return (
    <section
      id="invite-staff"
      className="w-full scroll-mt-6 rounded-[18px] border border-line bg-surface p-[18px]"
    >
      <form className="flex flex-col gap-[11px]" onSubmit={submit}>
        <h2 className="font-display text-[14px] font-semibold text-ink">Invite a staff member</h2>
        <p className="text-[10.5px] leading-4 text-ink3">
          Staff are the only accounts created by hand. Students link through the portal.
        </p>
        <input type="hidden" name="universityId" value={universityId} />
        <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="staff-name">
          Full name
          <Input
            id="staff-name"
            value={fullName}
            autoComplete="name"
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="staff-email">
          University email
          <Input
            id="staff-email"
            type="email"
            value={email}
            autoComplete="off"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="staff-role">
          Role
          <select
            id="staff-role"
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="attendant">Attendant</option>
            <option value="dept_head">Department head</option>
          </select>
        </label>
        <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink2" htmlFor="staff-department">
          Department
          <select
            id="staff-department"
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            {departments.length === 0 ? (
              <option value="" disabled>
                No department yet
              </option>
            ) : (
              departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))
            )}
          </select>
        </label>
        {notice !== null ? <p className="text-sm text-red">{notice}</p> : null}
        {link !== null ? (
          <label className="flex flex-col gap-[6px] text-[11px] font-medium text-ink" htmlFor="invite-link">
            Copy this link. It will not be shown again.
            <Input id="invite-link" readOnly value={link} />
          </label>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Sending" : "Send invite"}
        </Button>
        <p className="text-[10px] leading-[15px] text-ink3">The link is shown once and expires after 72 hours.</p>
      </form>
    </section>
  );
}

/**
 * Pull the server sentence out of an error body.
 *
 * @param body - Parsed response body, if any.
 * @returns The message the API sent, or a neutral sentence.
 */
/** The three university roles, in the words from the Soft Bento staff frame. */
function RoleReference() {
  const roles = [
    ["school_admin", "Runs this university: staff, inventory, reports and the audit log."],
    ["dept_head", "Sees the assets and demand figures for one department."],
    ["attendant", "Checks assets out and in, records condition and files lost reports at one desk."],
  ] as const;
  return (
    <section className="mt-4 flex flex-col gap-3 rounded-[18px] bg-role p-[18px]">
      <h2 className="font-display text-[14px] font-semibold text-ink">What each role can do</h2>
      {roles.map(([name, sentence]) => (
        <div key={name} className="flex items-start gap-3">
          <span className="flex h-[26px] w-[104px] shrink-0 items-center justify-center rounded-lg font-mono text-[10.5px] text-ink2">
            {name}
          </span>
          <p className="text-[11px] leading-4 text-ink3">{sentence}</p>
        </div>
      ))}
    </section>
  );
}

function messageFrom(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}
