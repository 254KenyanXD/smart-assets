import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Effect, Layer } from "effect";

import { openDatabase } from "@/db/client";
import { createFirstSuperAdmin } from "@/db/create-admin";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import {
  DEACTIVATE_ALREADY_MESSAGE,
  DEACTIVATE_FORBIDDEN_MESSAGE,
  DEACTIVATE_OTHER_UNIVERSITY_MESSAGE,
  DEACTIVATE_PLATFORM_MESSAGE,
  DEACTIVATE_REASON_MESSAGE,
  DEACTIVATE_ROLE_MESSAGE,
  DEACTIVATE_SELF_MESSAGE,
  DEACTIVATE_SUSPENDED_MESSAGE,
  DEACTIVATE_UNKNOWN_MESSAGE,
  DEACTIVATE_UNKNOWN_UNIVERSITY_MESSAGE,
  decideDeactivate,
  type DeactivateActor,
} from "@/domain/account-deactivation";
import { hashInviteToken } from "@/domain/staff-invite";
import { createAuth, hashLocalPassword } from "@/lib/auth";
import { Service as PortalTransport } from "@/lib/identity/portal-transport";
import { readPasswordReset } from "@/lib/password-reset-store";
import { readStaffInvite } from "@/lib/staff-invite-store";

const origin = "http://localhost:3000";
const password = "local-secret-not-stored";
const reason = "Left the desk.";

const schoolEmail = "school.admin.review230040@daystar.ac.ke";
const attendantEmail = "attendant.review230041@daystar.ac.ke";
const studentEmail = "borrower.review230042@daystar.ac.ke";
const leadEmail = "school.lead.review230043@daystar.ac.ke";
const neighbourEmail = "borrower.review230044@strathmore.edu";
const departmentEmail = "dept.review230045@daystar.ac.ke";

type Orm = BunSQLiteDatabase<typeof schema>;

function memoryDatabase() {
  const database = openDatabase(":memory:");
  applyMigrations(database);
  seed(database);
  return database;
}

function testAuth(database: ReturnType<typeof memoryDatabase>, logs: string[]) {
  return createAuth({
    database,
    secret: "test-secret-not-a-portal-password-32",
    baseURL: origin,
    trustedOrigins: [origin],
    portal: Layer.succeed(
      PortalTransport,
      PortalTransport.of({
        login: () => Effect.die("A deactivation must not call the portal."),
        dashboard: () => Effect.die("A deactivation must not call the portal."),
      }),
    ),
    captureLog: (line) => {
      logs.push(line);
    },
    rateLimit: false,
  });
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .filter((cookie) => cookie.length > 0)
    .join("; ");
}

async function post(
  auth: ReturnType<typeof createAuth>["auth"],
  path: string,
  body: unknown,
  cookie?: string,
) {
  const headers = new Headers({ "content-type": "application/json", origin });
  if (cookie !== undefined) {
    headers.set("cookie", cookie);
  }
  return auth.handler(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

async function messageOf(response: Response): Promise<string> {
  const body = (await response.json()) as { message?: string };
  return body.message ?? "";
}

async function sessionEmail(auth: ReturnType<typeof createAuth>["auth"], cookie: string): Promise<string | null> {
  const response = await auth.handler(
    new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie, origin },
    }),
  );
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("user" in body)) return null;
  const user = body.user;
  if (typeof user !== "object" || user === null || !("email" in user)) return null;
  return typeof user.email === "string" ? user.email : null;
}

async function insertMember(
  orm: Orm,
  input: {
    readonly email: string;
    readonly name: string;
    readonly universityId: string;
    readonly role: string;
    readonly platformRole?: "user" | "super_admin";
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  orm
    .insert(schema.user)
    .values({
      id,
      name: input.name,
      email: input.email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      platformRole: input.platformRole ?? "user",
      role: input.platformRole ?? "user",
      banned: false,
      banReason: null,
      banExpires: null,
    })
    .run();
  orm
    .insert(schema.account)
    .values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashLocalPassword(password),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  orm
    .insert(schema.member)
    .values({
      id: crypto.randomUUID(),
      organizationId: input.universityId,
      userId: id,
      role: input.role,
      createdAt: now,
    })
    .run();
  return id;
}

async function signIn(auth: ReturnType<typeof createAuth>["auth"], email: string): Promise<string> {
  const response = await post(auth, "/api/auth/sign-in/email", { email, password });
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

async function daystarDesk() {
  const database = memoryDatabase();
  const logs: string[] = [];
  await createFirstSuperAdmin(database, {
    email: "platform@example.com",
    name: "Platform Admin",
    password,
  });
  const { auth, orm } = testAuth(database, logs);
  const adminCookie = await signIn(auth, "platform@example.com");
  const schoolId = await insertMember(orm, {
    email: schoolEmail,
    name: "Review Administrator",
    universityId: "uni_daystar",
    role: "school_admin",
  });
  const schoolCookie = await signIn(auth, schoolEmail);
  return { database, auth, orm, logs, adminCookie, schoolCookie, schoolId };
}

describe("deactivation authorization", () => {
  const superAdmin: DeactivateActor = { _tag: "super_admin", userId: "platform" };
  const schoolAdmin: DeactivateActor = { _tag: "school_admin", userId: "school", universityId: "uni_daystar" };

  test("a super admin may deactivate any other account", () => {
    expect(
      decideDeactivate(superAdmin, {
        userId: "school",
        platformRole: "user",
        role: "school_admin",
        universityId: "uni_strathmore",
      }),
    ).toEqual({ _tag: "allow" });
    expect(
      decideDeactivate(superAdmin, {
        userId: "other-platform",
        platformRole: "super_admin",
        role: "student",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "allow" });
  });

  test("a school admin may deactivate department heads and attendants in their university", () => {
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "attendant",
        platformRole: "user",
        role: "attendant",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "allow" });
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "head",
        platformRole: "user",
        role: "dept_head",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "allow" });
  });

  test("a school admin may not deactivate self, another university, a student, or a platform account", () => {
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "school",
        platformRole: "user",
        role: "school_admin",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "deny", reason: "self" });
    expect(
      decideDeactivate(superAdmin, {
        userId: "platform",
        platformRole: "super_admin",
        role: "student",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "deny", reason: "self" });
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "attendant",
        platformRole: "user",
        role: "attendant",
        universityId: "uni_strathmore",
      }),
    ).toEqual({ _tag: "deny", reason: "other-university" });
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "student",
        platformRole: "user",
        role: "student",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "deny", reason: "role" });
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "lead",
        platformRole: "user",
        role: "school_admin",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "deny", reason: "role" });
    expect(
      decideDeactivate(schoolAdmin, {
        userId: "platform-member",
        platformRole: "super_admin",
        role: "student",
        universityId: "uni_daystar",
      }),
    ).toEqual({ _tag: "deny", reason: "platform" });
    expect(DEACTIVATE_OTHER_UNIVERSITY_MESSAGE.length).toBeGreaterThan(0);
    expect(DEACTIVATE_PLATFORM_MESSAGE.length).toBeGreaterThan(0);
  });
});

describe("account deactivation", () => {
  test("a school admin deactivates an attendant, the session dies, and open links close", async () => {
    const desk = await daystarDesk();
    try {
      const attendantId = await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
      });
      const attendantCookie = await signIn(desk.auth, attendantEmail);
      const reset = await post(desk.auth, "/api/auth/password-reset", { email: attendantEmail }, desk.schoolCookie);
      expect(reset.status).toBe(200);
      const resetBody = (await reset.json()) as { link?: string };
      const resetToken = resetBody.link?.split("/reset/")[1];
      if (resetToken === undefined) {
        throw new Error("The reset response did not carry a token.");
      }
      const inviteToken = "pending-invite-token-with-enough-length";
      desk.orm
        .insert(schema.staffInvites)
        .values({
          id: crypto.randomUUID(),
          tokenHash: hashInviteToken(inviteToken),
          email: "pending.review230046@daystar.ac.ke",
          fullName: "Review Pending",
          role: "attendant",
          universityId: "uni_daystar",
          departmentId: null,
          employeeId: null,
          batchId: null,
          invitedBy: desk.schoolId,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          acceptedAt: null,
          revokedAt: null,
        })
        .run();

      const blank = await post(desk.auth, "/api/auth/deactivate-account", { email: attendantEmail, reason: "  " }, desk.schoolCookie);
      expect(blank.status).toBe(422);
      expect(await messageOf(blank)).toBe(DEACTIVATE_REASON_MESSAGE);

      const done = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: "Attendant.Review230041@daystar.ac.ke", reason: `  ${reason}  `, universityId: "uni_strathmore" },
        desk.schoolCookie,
      );
      expect(done.status).toBe(200);
      expect(await sessionEmail(desk.auth, attendantCookie)).toBeNull();
      const signedIn = await post(desk.auth, "/api/auth/sign-in/email", { email: attendantEmail, password });
      expect(signedIn.ok).toBe(false);
      expect(readPasswordReset(desk.orm, resetToken, new Date())).toBeNull();
      expect(readStaffInvite(desk.orm, inviteToken, new Date())?.email).toBe("pending.review230046@daystar.ac.ke");

      const user = desk.orm.select().from(schema.user).where(eq(schema.user.id, attendantId)).get();
      expect(user?.banned).toBe(true);
      expect(user?.banReason).toBe(reason);
      const audit = desk.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "account.deactivate")).all();
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorUserId).toBe(desk.schoolId);
      expect(audit[0]?.reason).toBe(reason);
      expect(audit[0]?.before).toEqual({ banned: false, email: attendantEmail, role: "attendant" });
      expect(audit[0]?.after).toEqual({ banned: true, email: attendantEmail, role: "attendant" });
      expect(JSON.stringify(audit).includes(password)).toBe(false);

      const again = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: attendantEmail, reason },
        desk.schoolCookie,
      );
      expect(again.status).toBe(422);
      expect(await messageOf(again)).toBe(DEACTIVATE_ALREADY_MESSAGE);
      expect(desk.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "account.deactivate")).all()).toHaveLength(1);
    } finally {
      desk.database.close();
    }
  });

  test("deactivating a school admin revokes invites they issued", async () => {
    const desk = await daystarDesk();
    try {
      const inviteToken = "school-issued-invite-token-long-enough";
      desk.orm
        .insert(schema.staffInvites)
        .values({
          id: crypto.randomUUID(),
          tokenHash: hashInviteToken(inviteToken),
          email: "pending.review230047@daystar.ac.ke",
          fullName: "Review Pending",
          role: "dept_head",
          universityId: "uni_daystar",
          departmentId: null,
          employeeId: null,
          batchId: null,
          invitedBy: desk.schoolId,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          acceptedAt: null,
          revokedAt: null,
        })
        .run();
      const done = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: schoolEmail, universityId: "uni_daystar", reason },
        desk.adminCookie,
      );
      expect(done.status).toBe(200);
      expect(readStaffInvite(desk.orm, inviteToken, new Date())).toBeNull();
      const signedIn = await post(desk.auth, "/api/auth/sign-in/email", { email: schoolEmail, password });
      expect(signedIn.ok).toBe(false);
    } finally {
      desk.database.close();
    }
  });

  test("the wrong person, the wrong university, and a blank target are refused", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
      });
      await insertMember(desk.orm, {
        email: departmentEmail,
        name: "Review Department",
        universityId: "uni_daystar",
        role: "dept_head",
      });
      await insertMember(desk.orm, {
        email: studentEmail,
        name: "Review Borrower",
        universityId: "uni_daystar",
        role: "student",
      });
      await insertMember(desk.orm, {
        email: leadEmail,
        name: "Review Lead",
        universityId: "uni_daystar",
        role: "school_admin",
      });
      await insertMember(desk.orm, {
        email: neighbourEmail,
        name: "Review Strathmore",
        universityId: "uni_strathmore",
        role: "attendant",
      });
      const attendantCookie = await signIn(desk.auth, attendantEmail);
      const departmentCookie = await signIn(desk.auth, departmentEmail);

      const attendant = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: departmentEmail, reason },
        attendantCookie,
      );
      const department = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: attendantEmail, reason },
        departmentCookie,
      );
      expect(attendant.status).toBe(403);
      expect(department.status).toBe(403);
      expect(await messageOf(attendant)).toBe(DEACTIVATE_FORBIDDEN_MESSAGE);

      const student = await post(desk.auth, "/api/auth/deactivate-account", { email: studentEmail, reason }, desk.schoolCookie);
      expect(student.status).toBe(422);
      expect(await messageOf(student)).toBe(DEACTIVATE_ROLE_MESSAGE);
      const lead = await post(desk.auth, "/api/auth/deactivate-account", { email: leadEmail, reason }, desk.schoolCookie);
      expect(lead.status).toBe(422);
      expect(await messageOf(lead)).toBe(DEACTIVATE_ROLE_MESSAGE);
      const self = await post(desk.auth, "/api/auth/deactivate-account", { email: schoolEmail, reason }, desk.schoolCookie);
      expect(self.status).toBe(422);
      expect(await messageOf(self)).toBe(DEACTIVATE_SELF_MESSAGE);
      const neighbour = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: neighbourEmail, universityId: "uni_strathmore", reason },
        desk.schoolCookie,
      );
      expect(neighbour.status).toBe(422);
      expect(await messageOf(neighbour)).toBe(DEACTIVATE_UNKNOWN_MESSAGE);
      const unknown = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: "nobody.review230048@daystar.ac.ke", reason },
        desk.schoolCookie,
      );
      expect(unknown.status).toBe(422);
      expect(await messageOf(unknown)).toBe(DEACTIVATE_UNKNOWN_MESSAGE);

      const missingUniversity = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: schoolEmail, reason },
        desk.adminCookie,
      );
      expect(missingUniversity.status).toBe(422);
      expect(await messageOf(missingUniversity)).toBe("Choose a university.");
      const selfAdmin = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: "platform@example.com", universityId: "uni_daystar", reason },
        desk.adminCookie,
      );
      expect(selfAdmin.status).toBe(422);
      expect(await messageOf(selfAdmin)).toBe(DEACTIVATE_UNKNOWN_MESSAGE);
      const unknownUniversity = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: schoolEmail, universityId: "uni_missing", reason },
        desk.adminCookie,
      );
      expect(unknownUniversity.status).toBe(422);
      expect(await messageOf(unknownUniversity)).toBe(DEACTIVATE_UNKNOWN_UNIVERSITY_MESSAGE);

      desk.orm.update(schema.universities).set({ status: "suspended" }).where(eq(schema.universities.id, "uni_daystar")).run();
      const suspended = await post(
        desk.auth,
        "/api/auth/deactivate-account",
        { email: attendantEmail, universityId: "uni_daystar", reason },
        desk.adminCookie,
      );
      expect(suspended.status).toBe(422);
      expect(await messageOf(suspended)).toBe(DEACTIVATE_SUSPENDED_MESSAGE);
      expect(desk.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "account.deactivate")).all()).toHaveLength(0);
    } finally {
      desk.database.close();
    }
  });
});
