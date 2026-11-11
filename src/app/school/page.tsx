import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import * as schema from "@/db/schema";
import { auth, orm } from "@/lib/auth-server";

/**
 * School admin entry. There is no designed overview for this tier, so this page only
 * runs the same guard as the staff desk and then hands over to it.
 */
export default async function SchoolPage() {
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
  if (membership === undefined || membership.role !== "school_admin") {
    forbidden();
  }
  const university = orm
    .select({ status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, organizationId))
    .get();
  if (university === undefined || university.status !== "active") {
    forbidden();
  }
  redirect("/school/staff");
}
