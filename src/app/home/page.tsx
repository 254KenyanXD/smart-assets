import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CustodyMark } from "@/components/custody-mark";
import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";
import { Card } from "@/components/ui/card";
import { ThemeCorner } from "@/components/theme-toggle";
import * as schema from "@/db/schema";
import { listStudentCustody } from "@/lib/asset-store";
import { auth, orm } from "@/lib/auth-server";

import { SignOutButton } from "./sign-out-button";
import { StudentHome, type StudentHomeData } from "./student-home";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  const university =
    typeof organizationId !== "string"
      ? undefined
      : orm
          .select({ name: schema.universities.name })
          .from(schema.universities)
          .where(eq(schema.universities.id, organizationId))
          .get();
  const platformRole = session.user.platformRole;
  if (platformRole === "super_admin") {
    redirect("/admin");
  }
  const membership =
    typeof organizationId !== "string"
      ? undefined
      : orm
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, session.user.id)))
          .get();
  if (membership?.role === "student" && typeof organizationId === "string") {
    const profile = orm
      .select()
      .from(schema.studentProfiles)
      .where(eq(schema.studentProfiles.userId, session.user.id))
      .get();
    const now = new Date();
    const custody = listStudentCustody(orm, organizationId, session.user.id, now);
    const data: StudentHomeData = {
      name: profile?.fullName ?? session.user.name,
      initials: initials(profile?.fullName ?? session.user.name),
      photoUrl: profile?.photoUrl ?? null,
      meta: studentMeta(profile?.officialId, profile?.programme, session.user.email),
      universityName: university?.name ?? "University",
      officialId: profile?.officialId ?? null,
      loans: custody.open.map((loan) => ({
        assetTitle: loan.assetTitle,
        assetTag: loan.assetTag,
        dueLabel: dueLabel(loan.dueAt, now),
      })),
      onLoan: custody.onLoan,
      loansThisTerm: custody.loansThisTerm,
      returnedOnTime: custody.returnedOnTime,
      overdue: custody.overdue,
    };
    return (
      <main className="flex min-h-screen flex-col items-center bg-bg px-5 py-6 sm:px-6 lg:px-10 lg:py-10 xl:px-14 2xl:px-20">
        <StudentHome data={data} />
      </main>
    );
  }

  if (membership?.role === "school_admin") {
    redirect("/school/staff");
  }
  if (membership?.role === "attendant") {
    redirect("/desk");
  }
  if (membership?.role === "dept_head") {
    redirect("/school/inventory");
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-5 py-8">
      <ThemeCorner />
      <Card>
        <div className="flex items-center gap-3">
          <CustodyMark />
          <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ink3">UNIVERSITY SMART-ASSETS</p>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">Signed in</h1>
        <p className="mt-3 text-sm text-ink2">{session.user.name}</p>
        <p className="text-sm text-ink2">{session.user.email}</p>
        <p className="mt-4 text-sm text-ink">{sessionLine(platformRole, membership?.role, university?.name)}</p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </Card>
    </main>
  );
}

function sessionLine(
  platformRole: string | null | undefined,
  role: string | null | undefined,
  universityName: string | undefined,
): string {
  if (platformRole === "super_admin") {
    return "Platform administrator";
  }
  const staffRole = typeof role === "string" ? parseStaffRole(role) : null;
  const label = staffRole === null ? null : labelStaffRole(staffRole);
  if (label !== null && universityName !== undefined) {
    return `${label} at ${universityName}`;
  }
  return universityName ?? "No university on this session";
}

function initials(name: string): string {
  const parts = name.split(" ").filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const mark = (first + second).toUpperCase();
  return mark.length > 0 ? mark : "?";
}

function dueLabel(dueAt: Date | null, now: Date): string {
  if (dueAt === null) {
    return "No due date";
  }
  const month = String(dueAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dueAt.getUTCDate()).padStart(2, "0");
  const date = `${dueAt.getUTCFullYear()}-${month}-${day}`;
  return dueAt.getTime() < now.getTime() ? `Overdue ${date}` : `Due ${date}`;
}

function studentMeta(
  officialId: string | null | undefined,
  programme: string | null | undefined,
  email: string,
): string {
  if (typeof officialId === "string" && typeof programme === "string" && programme.length > 0) {
    return `${officialId} - ${programme}`;
  }
  if (typeof officialId === "string") {
    return officialId;
  }
  return email;
}
