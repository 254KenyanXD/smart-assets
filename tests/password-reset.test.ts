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
  decideReset,
  hashResetToken,
  RESET_FORBIDDEN_MESSAGE,
  RESET_INVALID_MESSAGE,
  RESET_LIFETIME_MS,
  RESET_NO_PASSWORD_MESSAGE,
  RESET_OTHER_UNIVERSITY_MESSAGE,
  RESET_PLATFORM_MESSAGE,
  RESET_ROLE_MESSAGE,
  RESET_SUSPENDED_MESSAGE,
  RESET_UNKNOWN_MESSAGE,
  RESET_UNKNOWN_UNIVERSITY_MESSAGE,
  resetExpiresAt,
  resetFailureMessage,
  resetStillOpen,
  type ResetActor,
} from "@/domain/password-reset";
import { createAuth, hashLocalPassword } from "@/lib/auth";
import { Service as PortalTransport } from "@/lib/identity/portal-transport";
import { acceptPasswordReset, mintPasswordReset, readPasswordReset } from "@/lib/password-reset-store";

const origin = "http://localhost:3000";
const password = "local-secret-not-stored";
const replacement = "replacement-secret-value";

const schoolEmail = "school.admin.review230030@daystar.ac.ke";
const attendantEmail = "attendant.review230031@daystar.ac.ke";
const studentEmail = "borrower.review230032@daystar.ac.ke";
const leadEmail = "school.lead.review230033@daystar.ac.ke";
const neighbourEmail = "borrower.review230034@strathmore.edu";
const platformMemberEmail = "platform.member.review230035@daystar.ac.ke";
const departmentEmail = "dept.review230036@daystar.ac.ke";

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
        login: () => Effect.die("A password reset must not call the portal."),
        dashboard: () => Effect.die("A password reset must not call the portal."),
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
    readonly password: string | null;
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
      role: "user",
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
      password: input.password === null ? null : await hashLocalPassword(input.password),
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

async function signIn(auth: ReturnType<typeof createAuth>["auth"], email: string, secret: string): Promise<string> {
  const response = await post(auth, "/api/auth/sign-in/email", { email, password: secret });
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
  const adminCookie = await signIn(auth, "platform@example.com", password);
  const schoolId = await insertMember(orm, {
    email: schoolEmail,
    name: "Review Administrator",
    universityId: "uni_daystar",
    role: "school_admin",
    password,
  });
  const schoolCookie = await signIn(auth, schoolEmail, password);
  return { database, auth, orm, logs, adminCookie, schoolCookie, schoolId };
}

async function mintLink(
  auth: ReturnType<typeof createAuth>["auth"],
  cookie: string,
  body: { readonly email: string; readonly universityId?: string },
): Promise<string> {
  const response = await post(auth, "/api/auth/password-reset", body, cookie);
  expect(response.status).toBe(200);
  const parsed = (await response.json()) as { link?: string };
  const token = parsed.link?.split("/reset/")[1];
  if (token === undefined || token.length === 0) {
    throw new Error("The reset response did not carry a token.");
  }
  return token;
}

describe("reset authorization", () => {
  const superAdmin: ResetActor = { _tag: "super_admin" };
  const schoolAdmin: ResetActor = { _tag: "school_admin", universityId: "uni_daystar" };

  test("a super admin may reset a non-platform account", () => {
    expect(
      decideReset(superAdmin, { platformRole: "user", role: "school_admin", universityId: "uni_strathmore" }),
    ).toEqual({ _tag: "allow" });
    expect(decideReset(superAdmin, { platformRole: "user", role: "student", universityId: "uni_daystar" })).toEqual({
      _tag: "allow",
    });
  });

  test("a school admin may reset staff and students in their own university", () => {
    expect(decideReset(schoolAdmin, { platformRole: "user", role: "attendant", universityId: "uni_daystar" })).toEqual({
      _tag: "allow",
    });
    expect(decideReset(schoolAdmin, { platformRole: "user", role: "dept_head", universityId: "uni_daystar" })).toEqual({
      _tag: "allow",
    });
    expect(decideReset(schoolAdmin, { platformRole: "user", role: "student", universityId: "uni_daystar" })).toEqual({
      _tag: "allow",
    });
  });

  test("a school admin may not reset another university, another school admin, or a platform account", () => {
    expect(
      decideReset(schoolAdmin, { platformRole: "user", role: "attendant", universityId: "uni_strathmore" }),
    ).toEqual({ _tag: "deny", reason: "other-university" });
    expect(decideReset(schoolAdmin, { platformRole: "user", role: "school_admin", universityId: "uni_daystar" })).toEqual(
      { _tag: "deny", reason: "role" },
    );
    expect(
      decideReset(schoolAdmin, { platformRole: "super_admin", role: "student", universityId: "uni_daystar" }),
    ).toEqual({ _tag: "deny", reason: "platform" });
    expect(
      decideReset(superAdmin, { platformRole: "super_admin", role: "school_admin", universityId: "uni_daystar" }),
    ).toEqual({ _tag: "deny", reason: "platform" });
  });

  test("a link lasts 72 hours and closes when used, revoked, or due", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const expiresAt = resetExpiresAt(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(RESET_LIFETIME_MS);
    const open = { usedAt: null, revokedAt: null, expiresAt };
    expect(resetStillOpen(open, now)).toBe(true);
    expect(resetStillOpen({ ...open, usedAt: now }, now)).toBe(false);
    expect(resetStillOpen({ ...open, revokedAt: now }, now)).toBe(false);
    expect(resetStillOpen(open, expiresAt)).toBe(false);
    expect(resetFailureMessage("unknown")).toBe(RESET_UNKNOWN_MESSAGE);
  });
});

describe("password reset", () => {
  test("a school admin resets an attendant, the old session dies, and the link cannot be reused", async () => {
    const desk = await daystarDesk();
    try {
      const attendantId = await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password,
      });
      const oldCookie = await signIn(desk.auth, attendantEmail, password);
      const token = await mintLink(desk.auth, desk.schoolCookie, { email: "Attendant.Review230031@daystar.ac.ke" });

      const stored = desk.orm.select().from(schema.passwordResets).all();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.tokenHash).toBe(hashResetToken(token));
      expect(JSON.stringify(stored).includes(token)).toBe(false);

      const open = readPasswordReset(desk.orm, token, new Date());
      expect(open).toEqual({
        fullName: "Review Attendant",
        email: attendantEmail,
        roleLabel: "Attendant",
        universityName: "Daystar University",
      });
      const row = stored[0];
      if (row === undefined) return;
      expect(readPasswordReset(desk.orm, token, row.expiresAt)).toBeNull();
      expect(
        acceptPasswordReset(desk.orm, { token, passwordHash: "unused-hash-value", now: row.expiresAt })._tag,
      ).toBe("failed");
      expect(readPasswordReset(desk.orm, token, new Date(row.expiresAt.getTime() - 1000))?.email).toBe(attendantEmail);

      const accepted = await post(desk.auth, "/api/auth/accept-password-reset", { token, password: replacement });
      expect(accepted.status).toBe(200);
      expect(await sessionEmail(desk.auth, cookieHeader(accepted))).toBe(attendantEmail);
      expect(await sessionEmail(desk.auth, oldCookie)).toBeNull();

      const again = await post(desk.auth, "/api/auth/accept-password-reset", { token, password: replacement });
      expect(again.status).toBe(403);
      expect(await messageOf(again)).toBe(RESET_INVALID_MESSAGE);

      const oldSignIn = await post(desk.auth, "/api/auth/sign-in/email", { email: attendantEmail, password });
      expect(oldSignIn.ok).toBe(false);
      const newSignIn = await post(desk.auth, "/api/auth/sign-in/email", {
        email: attendantEmail,
        password: replacement,
      });
      expect(newSignIn.status).toBe(200);

      const audit = desk.orm.select().from(schema.auditLog).all();
      const minted = audit.find((entry) => entry.action === "password.reset");
      const used = audit.find((entry) => entry.action === "password.reset.accept");
      expect(minted?.actorUserId).toBe(desk.schoolId);
      expect(minted?.target).toBe(`user:${attendantId}`);
      expect(minted?.universityId).toBe("uni_daystar");
      expect(used?.actorUserId).toBe(attendantId);
      expect(used?.after).toEqual({ userId: attendantId });
      const auditText = JSON.stringify(audit);
      expect(auditText.includes(replacement)).toBe(false);
      expect(auditText.includes(password)).toBe(false);
      expect(auditText.includes(token)).toBe(false);
      expect(desk.logs.join("\n").includes(replacement)).toBe(false);
      expect(desk.logs.join("\n").includes(token)).toBe(false);
    } finally {
      desk.database.close();
    }
  });

  test("a second mint revokes the first link", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password,
      });
      const first = await mintLink(desk.auth, desk.schoolCookie, { email: attendantEmail });
      const second = await mintLink(desk.auth, desk.schoolCookie, { email: attendantEmail });
      const rows = desk.orm.select().from(schema.passwordResets).all();
      const revoked = rows.find((row) => row.tokenHash === hashResetToken(first));
      const live = rows.find((row) => row.tokenHash === hashResetToken(second));
      expect(revoked?.revokedAt).not.toBeNull();
      expect(live?.revokedAt).toBeNull();
      const stale = await post(desk.auth, "/api/auth/accept-password-reset", { token: first, password: replacement });
      expect(stale.status).toBe(403);
      expect(await messageOf(stale)).toBe(RESET_INVALID_MESSAGE);
      const fresh = await post(desk.auth, "/api/auth/accept-password-reset", { token: second, password: replacement });
      expect(fresh.status).toBe(200);
    } finally {
      desk.database.close();
    }
  });

  test("an expired link is the same sentence as an unknown link", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password,
      });
      const token = await mintLink(desk.auth, desk.schoolCookie, { email: attendantEmail });
      desk.orm
        .update(schema.passwordResets)
        .set({ expiresAt: new Date(0) })
        .where(eq(schema.passwordResets.tokenHash, hashResetToken(token)))
        .run();
      const accepted = await post(desk.auth, "/api/auth/accept-password-reset", { token, password: replacement });
      const unknown = await post(desk.auth, "/api/auth/accept-password-reset", {
        token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        password: replacement,
      });
      expect(accepted.status).toBe(unknown.status);
      expect(await messageOf(accepted)).toBe(RESET_INVALID_MESSAGE);
      expect(await messageOf(unknown)).toBe(RESET_INVALID_MESSAGE);
      const still = await post(desk.auth, "/api/auth/sign-in/email", { email: attendantEmail, password });
      expect(still.status).toBe(200);
    } finally {
      desk.database.close();
    }
  });

  test("a school admin resets a linked student", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: studentEmail,
        name: "Review Borrower",
        universityId: "uni_daystar",
        role: "student",
        password,
      });
      const token = await mintLink(desk.auth, desk.schoolCookie, { email: studentEmail });
      expect(readPasswordReset(desk.orm, token, new Date())?.roleLabel).toBe("Student");
      const accepted = await post(desk.auth, "/api/auth/accept-password-reset", { token, password: replacement });
      expect(accepted.status).toBe(200);
      const signedIn = await post(desk.auth, "/api/auth/sign-in/email", { email: studentEmail, password: replacement });
      expect(signedIn.status).toBe(200);
    } finally {
      desk.database.close();
    }
  });

  test("an attendant or a department head cannot mint a reset", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password,
      });
      await insertMember(desk.orm, {
        email: departmentEmail,
        name: "Review Department",
        universityId: "uni_daystar",
        role: "dept_head",
        password,
      });
      const attendantCookie = await signIn(desk.auth, attendantEmail, password);
      const departmentCookie = await signIn(desk.auth, departmentEmail, password);
      const attendant = await post(desk.auth, "/api/auth/password-reset", { email: studentEmail }, attendantCookie);
      const department = await post(desk.auth, "/api/auth/password-reset", { email: attendantEmail }, departmentCookie);
      expect(attendant.status).toBe(403);
      expect(department.status).toBe(403);
      expect(await messageOf(attendant)).toBe(RESET_FORBIDDEN_MESSAGE);
      expect(await messageOf(department)).toBe(RESET_FORBIDDEN_MESSAGE);
      expect(desk.orm.select().from(schema.passwordResets).all()).toHaveLength(0);
    } finally {
      desk.database.close();
    }
  });

  test("a school admin cannot reset another school admin or a person outside the university", async () => {
    const desk = await daystarDesk();
    try {
      await insertMember(desk.orm, {
        email: leadEmail,
        name: "Review Lead",
        universityId: "uni_daystar",
        role: "school_admin",
        password,
      });
      await insertMember(desk.orm, {
        email: neighbourEmail,
        name: "Review Strathmore",
        universityId: "uni_strathmore",
        role: "student",
        password,
      });
      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password,
      });
      const lead = await post(desk.auth, "/api/auth/password-reset", { email: leadEmail }, desk.schoolCookie);
      expect(lead.status).toBe(422);
      expect(await messageOf(lead)).toBe(RESET_ROLE_MESSAGE);
      const neighbour = await post(
        desk.auth,
        "/api/auth/password-reset",
        { email: neighbourEmail, universityId: "uni_strathmore" },
        desk.schoolCookie,
      );
      expect(neighbour.status).toBe(422);
      expect(await messageOf(neighbour)).toBe(RESET_UNKNOWN_MESSAGE);
      const ignored = await mintLink(desk.auth, desk.schoolCookie, {
        email: attendantEmail,
        universityId: "uni_strathmore",
      });
      const row = desk.orm
        .select()
        .from(schema.passwordResets)
        .where(eq(schema.passwordResets.tokenHash, hashResetToken(ignored)))
        .get();
      expect(row?.universityId).toBe("uni_daystar");
      const direct = mintPasswordReset(desk.orm, {
        actor: { _tag: "school_admin", universityId: "uni_daystar" },
        email: neighbourEmail,
        universityId: "uni_strathmore",
        mintedBy: desk.schoolId,
        token: "direct-token-not-from-the-endpoint",
        now: new Date(),
      });
      expect(direct).toEqual({ _tag: "failed", reason: "other-university" });
      expect(resetFailureMessage("other-university")).toBe(RESET_OTHER_UNIVERSITY_MESSAGE);
    } finally {
      desk.database.close();
    }
  });

  test("a super admin resets a school admin and cannot reset a platform account", async () => {
    const desk = await daystarDesk();
    try {
      const missing = await post(desk.auth, "/api/auth/password-reset", { email: schoolEmail }, desk.adminCookie);
      expect(missing.status).toBe(422);
      expect(await messageOf(missing)).toBe("Choose a university.");
      const token = await mintLink(desk.auth, desk.adminCookie, {
        email: schoolEmail,
        universityId: "uni_daystar",
      });
      const accepted = await post(desk.auth, "/api/auth/accept-password-reset", { token, password: replacement });
      expect(accepted.status).toBe(200);
      const oldSignIn = await post(desk.auth, "/api/auth/sign-in/email", { email: schoolEmail, password });
      expect(oldSignIn.ok).toBe(false);

      await insertMember(desk.orm, {
        email: platformMemberEmail,
        name: "Review Platform",
        universityId: "uni_daystar",
        role: "student",
        password,
        platformRole: "super_admin",
      });
      const platform = await post(
        desk.auth,
        "/api/auth/password-reset",
        { email: platformMemberEmail, universityId: "uni_daystar" },
        desk.adminCookie,
      );
      expect(platform.status).toBe(422);
      expect(await messageOf(platform)).toBe(RESET_PLATFORM_MESSAGE);
      const unknownUniversity = await post(
        desk.auth,
        "/api/auth/password-reset",
        { email: schoolEmail, universityId: "uni_missing" },
        desk.adminCookie,
      );
      expect(unknownUniversity.status).toBe(422);
      expect(await messageOf(unknownUniversity)).toBe(RESET_UNKNOWN_UNIVERSITY_MESSAGE);
    } finally {
      desk.database.close();
    }
  });

  test("an unknown email, a missing password, and a suspended university are refused", async () => {
    const desk = await daystarDesk();
    try {
      const unknown = await post(
        desk.auth,
        "/api/auth/password-reset",
        { email: "nobody.review230037@daystar.ac.ke" },
        desk.schoolCookie,
      );
      expect(unknown.status).toBe(422);
      expect(await messageOf(unknown)).toBe(RESET_UNKNOWN_MESSAGE);

      await insertMember(desk.orm, {
        email: attendantEmail,
        name: "Review Attendant",
        universityId: "uni_daystar",
        role: "attendant",
        password: null,
      });
      const noPassword = await post(desk.auth, "/api/auth/password-reset", { email: attendantEmail }, desk.schoolCookie);
      expect(noPassword.status).toBe(422);
      expect(await messageOf(noPassword)).toBe(RESET_NO_PASSWORD_MESSAGE);

      desk.orm.update(schema.universities).set({ status: "suspended" }).where(eq(schema.universities.id, "uni_daystar")).run();
      await insertMember(desk.orm, {
        email: studentEmail,
        name: "Review Borrower",
        universityId: "uni_daystar",
        role: "student",
        password,
      });
      const suspended = await post(desk.auth, "/api/auth/password-reset", { email: studentEmail }, desk.schoolCookie);
      expect(suspended.status).toBe(422);
      expect(await messageOf(suspended)).toBe(RESET_SUSPENDED_MESSAGE);
      expect(desk.orm.select().from(schema.passwordResets).all()).toHaveLength(0);
    } finally {
      desk.database.close();
    }
  });
});
