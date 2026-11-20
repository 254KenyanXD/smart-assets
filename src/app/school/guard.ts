import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import * as schema from "@/db/schema";
import { auth, orm } from "@/lib/auth-server";

export interface UniversityAccess {
  readonly userId: string;

  readonly userName: string;

  readonly email: string;

  readonly platformRole: string;

  readonly organizationId: string;

  readonly role: string;

  readonly universityName: string;
}

export async function requireUniversityRole(allowed: readonly string[]): Promise<UniversityAccess> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  if (typeof organizationId !== "string") {
    forbidden();
  }
  const membership = orm
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, session.user.id)))
    .get();
  if (membership === undefined || !allowed.includes(membership.role)) {
    forbidden();
  }
  const university = orm
    .select({ name: schema.universities.name, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, organizationId))
    .get();
  if (university === undefined || university.status !== "active") {
    forbidden();
  }
  const platformRole = session.user.platformRole;
  return {
    userId: session.user.id,
    userName: session.user.name,
    email: session.user.email,
    platformRole: typeof platformRole === "string" ? platformRole : "user",
    organizationId,
    role: membership.role,
    universityName: university.name,
  };
}
