import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Layer } from "effect";

import { openDatabase } from "@/db/client";
import { createFirstSuperAdmin } from "@/db/create-admin";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import {
  decideInvite,
  hashInviteToken,
  INVITE_FORBIDDEN_MESSAGE,
  INVITE_INVALID_MESSAGE,
  INVITE_LIFETIME_MS,
  INVITE_OTHER_UNIVERSITY_MESSAGE,
  INVITE_ROLE_MESSAGE,
  inviteExpiresAt,
  inviteLifetimeState,
  tableStaffRole,
  type InviteActor,
} from "@/domain/staff-invite";
import {
  CSV_ADMIN_MESSAGE,
  CSV_NOTHING_MESSAGE,
  CSV_TOO_BIG_MESSAGE,
  CSV_TOO_MANY_MESSAGE,
} from "@/domain/staff-csv";
import { createAuth, hashLocalPassword } from "@/lib/auth";
import { Service as PortalTransport } from "@/lib/identity/portal-transport";
import { listStaffDirectory, listUniversityDepartments } from "@/lib/staff-invite-store";

const origin = "http://localhost:3000";
const password = "local-secret-not-stored";

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
        login: () => Effect.die("An invite must not call the portal."),
        dashboard: () => Effect.die("An invite must not call the portal."),
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

/** One invite request body. `role` stays a string so a test can send a bad one. */
interface InviteBody {
  readonly email: string;
  readonly fullName: string;
  readonly role: string;
  readonly universityId: string;
  readonly departmentId?: string;
}

const grace: InviteBody = {
  email: "grace.wanjiru@daystar.ac.ke",
  fullName: "Grace Wanjiru",
  role: "school_admin",
  universityId: "uni_daystar",
};

const graceAsAttendant: InviteBody = {
  email: "grace.wanjiru@daystar.ac.ke",
  fullName: "Grace Wanjiru",
  role: "attendant",
  universityId: "uni_daystar",
};

const peter: InviteBody = {
  email: "peter.mwangi@daystar.ac.ke",
  fullName: "Peter Mwangi",
  role: "attendant",
  universityId: "uni_daystar",
};

/** Sign in the first super admin and return the cookie plus the live auth handle. */
async function superAdminWorkspace() {
  const database = memoryDatabase();
  const logs: string[] = [];
  await createFirstSuperAdmin(database, {
    email: "platform@example.com",
    name: "Platform Admin",
    password,
  });
  const { auth, orm } = testAuth(database, logs);
  const signedIn = await post(auth, "/api/auth/sign-in/email", {
    email: "platform@example.com",
    password,
  });
  expect(signedIn.status).toBe(200);
  return { database, auth, orm, logs, cookie: cookieHeader(signedIn) };
}

/** Mint one invite through the auth endpoint and return the raw token from the link. */
async function mintInvite(
  auth: ReturnType<typeof createAuth>["auth"],
  cookie: string,
  body: InviteBody,
): Promise<string> {
  const response = await post(auth, "/api/auth/staff-invite", body, cookie);
  expect(response.status).toBe(200);
  const parsed = (await response.json()) as { link?: string };
  const token = parsed.link?.split("/invite/")[1];
  if (token === undefined) {
    throw new Error("The invite response did not carry a token.");
  }
  return token;
}

/** Accept one invite and return the cookie for the new session. */
async function acceptInvite(
  auth: ReturnType<typeof createAuth>["auth"],
  token: string,
): Promise<string> {
  const response = await post(auth, "/api/auth/accept-invite", { token, password });
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

/** A super admin, plus a signed-in school administrator for Daystar. */
async function schoolAdminWorkspace() {
  const workspace = await superAdminWorkspace();
  const token = await mintInvite(workspace.auth, workspace.cookie, grace);
  const schoolCookie = await acceptInvite(workspace.auth, token);
  return { ...workspace, schoolCookie };
}

describe("invite authorization", () => {
  const superAdmin: InviteActor = { _tag: "super_admin" };
  const schoolAdmin: InviteActor = { _tag: "school_admin", universityId: "uni_daystar" };

  test("a super admin may invite any staff role into any university", () => {
    expect(decideInvite(superAdmin, "school_admin", "uni_strathmore")).toEqual({ _tag: "allow" });
    expect(decideInvite(superAdmin, "dept_head", "uni_daystar")).toEqual({ _tag: "allow" });
    expect(decideInvite(superAdmin, "attendant", "uni_uonbi")).toEqual({ _tag: "allow" });
  });

  test("a school admin may invite staff into their own university", () => {
    expect(decideInvite(schoolAdmin, "attendant", "uni_daystar")).toEqual({ _tag: "allow" });
    expect(decideInvite(schoolAdmin, "dept_head", "uni_daystar")).toEqual({ _tag: "allow" });
  });

  test("a school admin may not invite into another university", () => {
    expect(decideInvite(schoolAdmin, "attendant", "uni_strathmore")).toEqual({
      _tag: "deny",
      reason: "other-university",
    });
    expect(decideInvite(schoolAdmin, "dept_head", "uni_uonbi")).toEqual({
      _tag: "deny",
      reason: "other-university",
    });
  });

  test("a school admin may not invite another school admin", () => {
    expect(decideInvite(schoolAdmin, "school_admin", "uni_daystar")).toEqual({
      _tag: "deny",
      reason: "role",
    });
    expect(decideInvite(schoolAdmin, "school_admin", "uni_strathmore")).toEqual({
      _tag: "deny",
      reason: "other-university",
    });
  });

  test("table labels stay short", () => {
    expect(tableStaffRole("school_admin")).toBe("School admin");
    expect(tableStaffRole("dept_head")).toBe("Dept head");
    expect(tableStaffRole("attendant")).toBe("Attendant");
  });
});

describe("invite lifetime", () => {
  test("expires 72 hours after it is minted", () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    expect(inviteExpiresAt(now).getTime() - now.getTime()).toBe(INVITE_LIFETIME_MS);
  });

  test("treats used, revoked, and expired as not pending", () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    const live = { acceptedAt: null, revokedAt: null, expiresAt: inviteExpiresAt(now) };
    expect(inviteLifetimeState(live, now)).toBe("pending");
    expect(inviteLifetimeState({ ...live, acceptedAt: now }, now)).toBe("used");
    expect(inviteLifetimeState({ ...live, revokedAt: now }, now)).toBe("revoked");
    expect(inviteLifetimeState({ ...live, expiresAt: now }, now)).toBe("expired");
  });
});

describe("staff invite", () => {
  test("a super admin mints one link, acceptance signs in, and the link dies", async () => {
    const database = memoryDatabase();
    const logs: string[] = [];
    await createFirstSuperAdmin(database, {
      email: "platform@example.com",
      name: "Platform Admin",
      password,
    });
    const { auth } = testAuth(database, logs);
    const admin = await post(auth, "/api/auth/sign-in/email", {
      email: "platform@example.com",
      password,
    });
    expect(admin.status).toBe(200);
    const created = await post(
      auth,
      "/api/auth/staff-invite",
      {
        email: "Grace.Wanjiru@daystar.ac.ke",
        fullName: "Grace Wanjiru",
        role: "school_admin",
        universityId: "uni_daystar",
      },
      cookieHeader(admin),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { link?: string };
    const token = createdBody.link?.split("/invite/")[1];
    expect(token).toBeDefined();
    if (token === undefined) {
      return;
    }

    const orm = drizzle(database, { schema });
    const stored = orm.select().from(schema.staffInvites).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashInviteToken(token));
    expect(stored[0]?.tokenHash.includes(token)).toBe(false);
    expect(stored[0]?.email).toBe("grace.wanjiru@daystar.ac.ke");
    expect(JSON.stringify(stored)).not.toContain(token);
    const audit = orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.invite")).all();
    expect(audit).toHaveLength(1);

    const accepted = await post(auth, "/api/auth/accept-invite", { token, password });
    expect(accepted.status).toBe(200);
    const session = await auth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie: cookieHeader(accepted), origin },
      }),
    );
    const sessionBody = (await session.json()) as {
      user?: { email?: string };
      session?: { activeOrganizationId?: string };
    };
    expect(sessionBody.user?.email).toBe("grace.wanjiru@daystar.ac.ke");
    expect(sessionBody.session?.activeOrganizationId).toBe("uni_daystar");
    const member = orm.select().from(schema.member).all();
    expect(member).toHaveLength(1);
    expect(member[0]?.role).toBe("school_admin");
    const account = orm.select({ password: schema.account.password }).from(schema.account).all();
    expect(account.some((row) => row.password === password)).toBe(false);
    expect(orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.invite.accept")).all()).toHaveLength(
      1,
    );

    const again = await post(auth, "/api/auth/accept-invite", { token, password: "another-secret-password" });
    const unknown = await post(auth, "/api/auth/accept-invite", {
      token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      password,
    });
    expect(again.status).toBe(unknown.status);
    expect(await messageOf(again)).toBe(INVITE_INVALID_MESSAGE);
    expect(await messageOf(unknown)).toBe(INVITE_INVALID_MESSAGE);
    expect(logs.join("\n").includes(password)).toBe(false);
    expect(logs.join("\n").includes(token)).toBe(false);
    database.close();
  });

  test("expired and revoked links use the same message as an unknown link", async () => {
    const database = memoryDatabase();
    await createFirstSuperAdmin(database, {
      email: "platform@example.com",
      name: "Platform Admin",
      password,
    });
    const { auth, orm } = testAuth(database, []);
    const now = new Date();
    const admin = orm
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, "platform@example.com"))
      .get();
    expect(admin).toBeDefined();
    if (admin === undefined) {
      return;
    }
    orm
      .insert(schema.staffInvites)
      .values([
        {
          id: "invite-expired",
          tokenHash: hashInviteToken("expired-token-value-with-enough-length"),
          email: "expired@daystar.ac.ke",
          fullName: "Expired Person",
          role: "attendant",
          universityId: "uni_daystar",
          departmentId: null,
          employeeId: null,
          batchId: null,
          invitedBy: admin.id,
          createdAt: now,
          expiresAt: new Date(now.getTime() - 1000),
          acceptedAt: null,
          revokedAt: null,
        },
        {
          id: "invite-revoked",
          tokenHash: hashInviteToken("revoked-token-value-with-enough-length"),
          email: "revoked@daystar.ac.ke",
          fullName: "Revoked Person",
          role: "dept_head",
          universityId: "uni_daystar",
          departmentId: null,
          employeeId: null,
          batchId: null,
          invitedBy: admin.id,
          createdAt: now,
          expiresAt: inviteExpiresAt(now),
          acceptedAt: null,
          revokedAt: now,
        },
      ])
      .run();

    const expired = await post(auth, "/api/auth/accept-invite", {
      token: "expired-token-value-with-enough-length",
      password,
    });
    const revoked = await post(auth, "/api/auth/accept-invite", {
      token: "revoked-token-value-with-enough-length",
      password,
    });
    const unknown = await post(auth, "/api/auth/accept-invite", {
      token: "unknown-token-value-with-enough-length",
      password,
    });
    expect(await messageOf(expired)).toBe(INVITE_INVALID_MESSAGE);
    expect(await messageOf(revoked)).toBe(INVITE_INVALID_MESSAGE);
    expect(await messageOf(unknown)).toBe(INVITE_INVALID_MESSAGE);
    expect(expired.status).toBe(unknown.status);
    expect(revoked.status).toBe(unknown.status);
    expect(orm.select().from(schema.user).all()).toHaveLength(1);
    database.close();
  });

  test("refuses an invite from someone who is not a super admin", async () => {
    const database = memoryDatabase();
    const { auth } = testAuth(database, []);
    const response = await post(auth, "/api/auth/staff-invite", {
      email: "grace.wanjiru@daystar.ac.ke",
      fullName: "Grace Wanjiru",
      role: "school_admin",
      universityId: "uni_daystar",
    });
    expect(response.status).toBe(403);
    const orm = drizzle(database, { schema });
    expect(orm.select().from(schema.staffInvites).all()).toHaveLength(0);
    database.close();
  });
});

describe("staff invite authorization over http", () => {
  test("a school admin invites an attendant into their own university", async () => {
    const workspace = await schoolAdminWorkspace();
    const token = await mintInvite(workspace.auth, workspace.schoolCookie, peter);

    const rows = workspace.orm.select().from(schema.staffInvites).all();
    expect(rows).toHaveLength(2);
    const stored = rows.find((row) => row.email === "peter.mwangi@daystar.ac.ke");
    if (stored === undefined) {
      throw new Error("The attendant invite was not stored.");
    }
    expect(stored.role).toBe("attendant");
    expect(stored.universityId).toBe("uni_daystar");
    expect(stored.departmentId).toBeNull();
    expect(stored.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    workspace.database.close();
  });

  test("a school admin cannot invite into another university", async () => {
    const workspace = await schoolAdminWorkspace();
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-invite",
      {
        email: "peter.mwangi@daystar.ac.ke",
        fullName: "Peter Mwangi",
        role: "attendant",
        universityId: "uni_strathmore",
      },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(INVITE_OTHER_UNIVERSITY_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    workspace.database.close();
  });

  test("a school admin cannot invite another school admin", async () => {
    const workspace = await schoolAdminWorkspace();
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-invite",
      {
        email: "peter.mwangi@daystar.ac.ke",
        fullName: "Peter Mwangi",
        role: "school_admin",
        universityId: "uni_daystar",
      },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(INVITE_ROLE_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    workspace.database.close();
  });

  test("an attendant cannot invite staff", async () => {
    const workspace = await schoolAdminWorkspace();
    const token = await mintInvite(workspace.auth, workspace.schoolCookie, peter);
    const attendantCookie = await acceptInvite(workspace.auth, token);
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-invite",
      {
        email: "other.person@daystar.ac.ke",
        fullName: "Other Person",
        role: "attendant",
        universityId: "uni_daystar",
      },
      attendantCookie,
    );
    expect(response.status).toBe(403);
    expect(await messageOf(response)).toBe(INVITE_FORBIDDEN_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    workspace.database.close();
  });

  test("the directory lists staff and pending invites for one university only", async () => {
    const workspace = await schoolAdminWorkspace();
    await mintInvite(workspace.auth, workspace.schoolCookie, peter);
    const now = new Date();
    const admin = workspace.orm
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, "platform@example.com"))
      .get();
    if (admin === undefined) {
      throw new Error("The super admin row is missing.");
    }
    workspace.orm
      .insert(schema.user)
      .values({
        id: "student-user",
        name: "Alice Student",
        email: "alice.student@daystar.ac.ke",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        platformRole: "user",
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
      })
      .run();
    workspace.orm
      .insert(schema.member)
      .values({
        id: "student-member",
        organizationId: "uni_daystar",
        userId: "student-user",
        role: "student",
        createdAt: now,
      })
      .run();
    workspace.orm
      .insert(schema.staffInvites)
      .values({
        id: "invite-strathmore",
        tokenHash: hashInviteToken("strathmore-token-value-with-enough-length"),
        email: "other.person@strathmore.edu",
        fullName: "Other Person",
        role: "attendant",
        universityId: "uni_strathmore",
        departmentId: null,
        employeeId: null,
        batchId: null,
        invitedBy: admin.id,
        createdAt: now,
        expiresAt: inviteExpiresAt(now),
        acceptedAt: null,
        revokedAt: null,
      })
      .run();

    const directory = listStaffDirectory(workspace.orm, "uni_daystar", now);
    expect(directory).toHaveLength(2);
    expect(directory[0]).toEqual({
      name: "Grace Wanjiru",
      email: "grace.wanjiru@daystar.ac.ke",
      role: "school_admin",
      department: null,
      status: "active",
      banned: false,
    });
    expect(directory[1]).toEqual({
      name: "Peter Mwangi",
      email: "peter.mwangi@daystar.ac.ke",
      role: "attendant",
      department: null,
      status: "pending",
      banned: false,
    });
    expect(directory.some((entry) => entry.name === "Alice Student")).toBe(false);
    expect(directory.some((entry) => entry.email === "other.person@strathmore.edu")).toBe(false);
    workspace.database.close();
  });

  test("a department must belong to the invite university", async () => {
    const workspace = await superAdminWorkspace();
    workspace.orm
      .insert(schema.faculties)
      .values({
        id: "fac-strathmore",
        universityId: "uni_strathmore",
        name: "School of Computing",
        code: "SC",
      })
      .run();
    workspace.orm
      .insert(schema.departments)
      .values({
        id: "dept-strathmore",
        facultyId: "fac-strathmore",
        name: "Computer Science",
        code: "CS",
      })
      .run();

    const refused = await post(
      workspace.auth,
      "/api/auth/staff-invite",
      {
        email: "peter.mwangi@daystar.ac.ke",
        fullName: "Peter Mwangi",
        role: "attendant",
        universityId: "uni_daystar",
        departmentId: "dept-strathmore",
      },
      workspace.cookie,
    );
    expect(refused.status).toBe(422);
    expect(await messageOf(refused)).toBe("That department is not part of this university.");
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(0);

    workspace.orm
      .insert(schema.faculties)
      .values({
        id: "fac-daystar",
        universityId: "uni_daystar",
        name: "School of Science",
        code: "SS",
      })
      .run();
    workspace.orm
      .insert(schema.departments)
      .values({
        id: "dept-daystar",
        facultyId: "fac-daystar",
        name: "Computer Science",
        code: "CS",
      })
      .run();

    const token = await mintInvite(workspace.auth, workspace.cookie, {
      email: "peter.mwangi@daystar.ac.ke",
      fullName: "Peter Mwangi",
      role: "attendant",
      universityId: "uni_daystar",
      departmentId: "dept-daystar",
    });
    const stored = workspace.orm.select().from(schema.staffInvites).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.departmentId).toBe("dept-daystar");
    expect(stored[0]?.tokenHash).toBe(hashInviteToken(token));

    const departments = listUniversityDepartments(workspace.orm, "uni_daystar");
    expect(departments).toEqual([{ id: "dept-daystar", name: "Computer Science" }]);
    workspace.database.close();
  });
});

const staffHeader = "full_name,email,role,department,employee_id";

function staffCsv(rows: readonly string[]): string {
  return [staffHeader, ...rows].join("\r\n");
}

function addDepartment(
  orm: ReturnType<typeof createAuth>["orm"],
  input: { readonly facultyId: string; readonly departmentId: string; readonly universityId: string; readonly name: string },
) {
  orm
    .insert(schema.faculties)
    .values({
      id: input.facultyId,
      universityId: input.universityId,
      name: input.name,
      code: input.facultyId,
    })
    .run();
  orm
    .insert(schema.departments)
    .values({
      id: input.departmentId,
      facultyId: input.facultyId,
      name: input.name,
      code: input.departmentId,
    })
    .run();
}

describe("staff csv import", () => {
  test("validate shows the preview and writes nothing", async () => {
    const workspace = await schoolAdminWorkspace();
    const beforeInvites = workspace.orm.select().from(schema.staffInvites).all().length;
    const beforeAudit = workspace.orm.select().from(schema.auditLog).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/validate",
      { csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,,"]) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { inviteCount?: number; skipCount?: number };
    expect(body.inviteCount).toBe(1);
    expect(body.skipCount).toBe(0);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(beforeInvites);
    expect(workspace.orm.select().from(schema.auditLog).all()).toHaveLength(beforeAudit);
    workspace.database.close();
  });

  test("501 rows are refused before any invite is written", async () => {
    const workspace = await schoolAdminWorkspace();
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const rows = Array.from({ length: 501 }, (_, index) => `Person ${index},person${index}@daystar.ac.ke,attendant,,`);
    const response = await post(workspace.auth, "/api/auth/staff-import/validate", { csv: staffCsv(rows) }, workspace.schoolCookie);
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(CSV_TOO_MANY_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    workspace.database.close();
  });

  test("a 2 MB file is refused before any invite is written", async () => {
    const workspace = await schoolAdminWorkspace();
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      { csv: "x".repeat(2 * 1024 * 1024) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(CSV_TOO_BIG_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    expect(workspace.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.import")).all()).toHaveLength(0);
    workspace.database.close();
  });

  test("a school admin row is skipped and does not create an administrator", async () => {
    const workspace = await schoolAdminWorkspace();
    const csv = staffCsv([
      "New Admin,new.admin230011@daystar.ac.ke,school_admin,,",
      "Ada Review,ada.review230010@daystar.ac.ke,attendant,,",
    ]);
    const response = await post(workspace.auth, "/api/auth/staff-import/commit", { csv }, workspace.schoolCookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { inviteCount?: number; skipCount?: number; resultsCsv?: string };
    expect(body.inviteCount).toBe(1);
    expect(body.skipCount).toBe(1);
    expect(body.resultsCsv).toContain(CSV_ADMIN_MESSAGE);
    const invites = workspace.orm.select().from(schema.staffInvites).all();
    expect(invites.filter((row) => row.email === "new.admin230011@daystar.ac.ke")).toHaveLength(0);
    expect(invites.filter((row) => row.email === "ada.review230010@daystar.ac.ke")).toHaveLength(1);
    const admins = workspace.orm.select().from(schema.member).where(eq(schema.member.role, "school_admin")).all();
    expect(admins).toHaveLength(1);
    workspace.database.close();
  });

  test("a duplicate email is skipped and the rest of the file still commits", async () => {
    const workspace = await schoolAdminWorkspace();
    const csv = staffCsv([
      "Grace Wanjiru,grace.wanjiru@daystar.ac.ke,attendant,,",
      "Ada Review,ada.review230010@daystar.ac.ke,dept_head,,",
    ]);
    const response = await post(workspace.auth, "/api/auth/staff-import/commit", { csv }, workspace.schoolCookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { inviteCount?: number; resultsCsv?: string };
    expect(body.inviteCount).toBe(1);
    expect(body.resultsCsv).toContain("An account or a pending invite already uses this email.");
    const invites = workspace.orm.select().from(schema.staffInvites).all();
    expect(invites.filter((row) => row.email === "ada.review230010@daystar.ac.ke" && row.role === "dept_head")).toHaveLength(1);
    workspace.database.close();
  });

  test("a department from another university is not attached", async () => {
    const workspace = await schoolAdminWorkspace();
    addDepartment(workspace.orm, {
      facultyId: "fac-strathmore-lib",
      departmentId: "dept-strathmore-lib",
      universityId: "uni_strathmore",
      name: "Library",
    });
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      { csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,Library,"]) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(CSV_NOTHING_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).where(eq(schema.staffInvites.email, "ada.review230010@daystar.ac.ke")).all()).toHaveLength(0);
    expect(workspace.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.import")).all()).toHaveLength(0);
    workspace.database.close();
  });

  test("commit stores the hash and returns each link once", async () => {
    const workspace = await schoolAdminWorkspace();
    addDepartment(workspace.orm, {
      facultyId: "fac-daystar-lib",
      departmentId: "dept-daystar-lib",
      universityId: "uni_daystar",
      name: "Library",
    });
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      { csv: staffCsv(["=Ada Review,ada.review230010@daystar.ac.ke,attendant,Library,EMP-010"]) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { resultsCsv?: string };
    const results = body.resultsCsv ?? "";
    expect(results.startsWith(`full_name,email,role,department,employee_id,result,link\r\n`)).toBe(true);
    expect(results).toContain("'=Ada Review");
    const link = results.split(",").find((cell) => cell.includes("/invite/"));
    const token = link?.split("/invite/")[1]?.trim();
    if (token === undefined || token.length === 0) {
      throw new Error("The results file did not carry a token.");
    }
    expect(results.split(token).length - 1).toBe(1);
    const stored = workspace.orm.select().from(schema.staffInvites).where(eq(schema.staffInvites.email, "ada.review230010@daystar.ac.ke")).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashInviteToken(token));
    expect(stored[0]?.tokenHash).not.toBe(token);
    expect(stored[0]?.departmentId).toBe("dept-daystar-lib");
    expect(stored[0]?.employeeId).toBe("EMP-010");
    expect(stored[0]?.universityId).toBe("uni_daystar");
    const audits = workspace.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.import")).all();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.universityId).toBe("uni_daystar");
    expect(audits[0]?.target).toBe(`staff_import:${stored[0]?.batchId}`);
    const actor = workspace.orm.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, "grace.wanjiru@daystar.ac.ke")).get();
    expect(audits[0]?.actorUserId).toBe(actor?.id);
    const after = audits[0]?.after;
    if (typeof after !== "object" || after === null) {
      throw new Error("The import audit did not store the batch counts.");
    }
    expect(after).toMatchObject({ invited: 1, skipped: 0, universityId: "uni_daystar", batchId: stored[0]?.batchId });
    workspace.database.close();
  });

  test("a school admin file lands in the session university", async () => {
    const workspace = await schoolAdminWorkspace();
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      {
        csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,,"]),
        universityId: "uni_strathmore",
      },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(200);
    const stored = workspace.orm.select().from(schema.staffInvites).where(eq(schema.staffInvites.email, "ada.review230010@daystar.ac.ke")).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.universityId).toBe("uni_daystar");
    workspace.database.close();
  });

  test("a super admin must name the university", async () => {
    const workspace = await superAdminWorkspace();
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/validate",
      { csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,,"]) },
      workspace.cookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe("Choose a university.");
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(0);
    workspace.database.close();
  });

  test("a file with nothing to invite writes no audit", async () => {
    const workspace = await schoolAdminWorkspace();
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      { csv: staffCsv(["New Admin,new.admin230011@daystar.ac.ke,school_admin,,"]) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(422);
    expect(await messageOf(response)).toBe(CSV_NOTHING_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    expect(workspace.orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "staff.import")).all()).toHaveLength(0);
    workspace.database.close();
  });

  test("a student cannot invite staff or import a file", async () => {
    const workspace = await schoolAdminWorkspace();
    const now = new Date();
    const id = crypto.randomUUID();
    workspace.orm
      .insert(schema.user)
      .values({
        id,
        name: "Review Student",
        email: "review.student230012@daystar.ac.ke",
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        platformRole: "user",
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
      })
      .run();
    workspace.orm
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
    workspace.orm
      .insert(schema.member)
      .values({
        id: crypto.randomUUID(),
        organizationId: "uni_daystar",
        userId: id,
        role: "student",
        createdAt: now,
      })
      .run();
    const signedIn = await post(workspace.auth, "/api/auth/sign-in/email", {
      email: "review.student230012@daystar.ac.ke",
      password,
    });
    expect(signedIn.status).toBe(200);
    const studentCookie = cookieHeader(signedIn);
    const before = workspace.orm.select().from(schema.staffInvites).all().length;
    const invite = await post(
      workspace.auth,
      "/api/auth/staff-invite",
      {
        email: "ada.review230010@daystar.ac.ke",
        fullName: "Ada Review",
        role: "attendant",
        universityId: "uni_daystar",
      },
      studentCookie,
    );
    expect(invite.status).toBe(403);
    expect(await messageOf(invite)).toBe(INVITE_FORBIDDEN_MESSAGE);
    const imported = await post(
      workspace.auth,
      "/api/auth/staff-import/validate",
      { csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,,"]) },
      studentCookie,
    );
    expect(imported.status).toBe(403);
    expect(await messageOf(imported)).toBe(INVITE_FORBIDDEN_MESSAGE);
    expect(workspace.orm.select().from(schema.staffInvites).all()).toHaveLength(before);
    workspace.database.close();
  });

  test("an accepted invite keeps its department on the staff desk", async () => {
    const workspace = await schoolAdminWorkspace();
    addDepartment(workspace.orm, {
      facultyId: "fac-daystar-cs",
      departmentId: "dept-daystar-cs",
      universityId: "uni_daystar",
      name: "Computer Science",
    });
    const response = await post(
      workspace.auth,
      "/api/auth/staff-import/commit",
      { csv: staffCsv(["Ada Review,ada.review230010@daystar.ac.ke,attendant,Computer Science,"]) },
      workspace.schoolCookie,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { resultsCsv?: string };
    const token = body.resultsCsv?.split("/invite/")[1]?.split(/[\r\n,]/)[0];
    if (token === undefined || token.length === 0) {
      throw new Error("The results file did not carry a token.");
    }
    await acceptInvite(workspace.auth, token);
    const directory = listStaffDirectory(workspace.orm, "uni_daystar", new Date());
    expect(directory).toContainEqual({
      name: "Ada Review",
      email: "ada.review230010@daystar.ac.ke",
      role: "attendant",
      department: "Computer Science",
      status: "active",
      banned: false,
    });
    workspace.database.close();
  });
});
