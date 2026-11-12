import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import * as schema from "@/db/schema";
import { auth, orm } from "@/lib/auth-server";

/** A signed-in member of one active university, already checked against the allowed roles. */
export interface UniversityAccess {
  /** Account id. */
  readonly userId: string;
  /** Account name. */
  readonly userName: string;
  /** Login email. */
  readonly email: string;
  /** Platform role from the account. */
  readonly platformRole: string;
  /** Active organization, which is the university id. */
  readonly organizationId: string;
  /** University role loaded from membership. */
  readonly role: string;
  /** University display name. */
  readonly universityName: string;
}

/**
 * Require a session whose university role is one of `allowed`.
 * Hiding a nav row is not this check. The page calls it again.
 *
 * @param allowed - University roles that may open the page.
 */
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
