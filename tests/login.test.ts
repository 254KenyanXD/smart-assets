import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";

import { openDatabase } from "@/db/client";
import { createFirstSuperAdmin } from "@/db/create-admin";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { deriveDaystarAdmission, suggestDaystarPortal } from "@/domain/daystar-admission";
import { createAuth, hashLocalPassword } from "@/lib/auth";
import { InvalidCredentials } from "@/lib/identity/errors";
import { layer as directoryLayer, Service as Directory } from "@/lib/identity/directory";
import { Service as PortalTransport } from "@/lib/identity/portal-transport";
import { createWindowLimiter } from "@/lib/resolve-limit";
import { makeRuntime } from "@/lib/runtime";
import { NotAllowed, Service as University } from "@/services/university";

const origin = "http://localhost:3000";
const portalPassword = "portal-secret-not-stored";
const localPassword = "local-secret-not-stored";

const portalPhoto = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const dashboardHtml = `
  <div class="row mb-2"><label>Reg. No.</label><span class="badge">23-1670</span></div>
  <div class="row mb-2"><label>Name</label><span class="badge">Sample Student</span></div>
  <div class="row mb-2"><label>Programme</label><span class="badge">BSc Computer Science</span></div>
  <img class="rounded-circle" src="${portalPhoto}" />
`;

function memoryDatabase() {
  const database = openDatabase(":memory:");
  applyMigrations(database);
  seed(database);
  return database;
}

function fakePortal(calls: { login: number }) {
  return Layer.succeed(
    PortalTransport,
    PortalTransport.of({
      login: (input) =>
        Effect.gen(function* () {
          calls.login += 1;
          const password = Redacted.value(input.password);
          if (password !== portalPassword) {
            return yield* Effect.fail(
              new InvalidCredentials({ message: "Check the admission number and the portal password." }),
            );
          }
          return { cookieHeader: "ASP.NET_SessionId=test" };
        }),
      dashboard: () => Effect.succeed(dashboardHtml),
    }),
  );
}

function testAuth(database: ReturnType<typeof memoryDatabase>, calls: { login: number }, logs: string[]) {
  return createAuth({
    database,
    secret: "test-secret-not-a-portal-password-32",
    baseURL: origin,
    trustedOrigins: [origin],
    portal: fakePortal(calls),
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

async function post(auth: ReturnType<typeof createAuth>["auth"], path: string, body: unknown, cookie?: string) {
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

async function localMember(
  database: ReturnType<typeof memoryDatabase>,
  input: { readonly email: string; readonly name: string; readonly password: string; readonly universityId: string },
) {
  const orm = drizzle(database, { schema });
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
      platformRole: "user",
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
      password: await hashLocalPassword(input.password),
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
      role: "student",
      createdAt: now,
    })
    .run();
  orm
    .insert(schema.studentProfiles)
    .values({
      id: crypto.randomUUID(),
      userId: id,
      universityId: input.universityId,
      officialId: "LOCAL-1",
      fullName: input.name,
      programme: null,
      campus: null,
      school: null,
      standing: null,
      email: input.email,
      photoUrl: null,
      source: "local",
      firstVerifiedAt: now,
      lastVerifiedAt: now,
    })
    .run();
  return id;
}

describe("daystar admission", () => {
  test("derives the documented admission number", () => {
    expect(deriveDaystarAdmission("williamkengere231670")).toBe("23-1670");
    expect(suggestDaystarPortal("williamkengere231670")).toBe("student");
    expect(deriveDaystarAdmission("harris")).toBeNull();
    expect(suggestDaystarPortal("harris")).toBe("staff");
  });
});

describe("directory", () => {
  test("loads the vendored counts and finds Daystar", async () => {
    const runtime = ManagedRuntime.make(directoryLayer);
    const found = await runtime.runPromise(
      Effect.gen(function* () {
        const directory = yield* Directory;
        return {
          institutions: yield* directory.institutions(),
          domains: yield* directory.domains(),
          daystar: yield* directory.lookup("daystar.ac.ke"),
          mit: yield* directory.lookup("mit.edu"),
        };
      }),
    );
    expect(found.institutions).toBe(10272);
    expect(found.domains).toBe(10592);
    expect(found.daystar.some((entry) => entry.name === "Daystar University")).toBe(true);
    expect(found.mit.length).toBeGreaterThan(0);
    await runtime.dispose();
  });
});

describe("resolve", () => {
  test("classifies supported, directory, unknown, and a shared domain", async () => {
    const database = memoryDatabase();
    const orm = drizzle(database, { schema });
    orm
      .insert(schema.universityDomains)
      .values([
        { domain: "shared.example", universityId: "uni_daystar" },
        { domain: "shared.example", universityId: "uni_strathmore" },
      ])
      .run();
    const runtime = makeRuntime(database);
    const read = (email: string, slug?: string) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const universities = yield* University;
          return yield* universities.resolve(email, slug);
        }),
      );
    const daystar = await read("sample231670@daystar.ac.ke");
    expect(daystar._tag).toBe("Supported");
    if (daystar._tag === "Supported") {
      expect(daystar.admissionNumber).toBe("23-1670");
      expect(daystar.portal).toBe("student");
      expect(daystar.university.authConfig.adapter).toBe("daystar-portal");
    }
    const strathmore = await read("person@strathmore.edu");
    expect(strathmore._tag).toBe("Supported");
    if (strathmore._tag === "Supported") {
      expect(strathmore.portal).toBeNull();
      expect(strathmore.university.authConfig.adapter).toBe("local");
    }
    const directory = await read("person@mit.edu");
    expect(directory._tag).toBe("DirectoryOnly");
    expect(await read("person@no-such-school.invalid")).toEqual({ _tag: "Unknown" });
    const many = await read("person@shared.example");
    expect(many._tag).toBe("Many");
    if (many._tag === "Many") {
      expect(many.institutions.map((item) => item.name).sort()).toEqual([
        "Daystar University",
        "Strathmore University",
      ]);
    }
    const picked = await read("person@shared.example", "strathmore");
    expect(picked._tag).toBe("Supported");
    if (picked._tag === "Supported") {
      expect(picked.university.slug).toBe("strathmore");
    }
    await runtime.dispose();
    database.close();
  });
});

describe("limiter", () => {
  test("allows 30 calls in a window and the 31st waits", () => {
    const allow = createWindowLimiter(30, 60_000);
    for (let index = 0; index < 30; index += 1) {
      expect(allow("ip", 1_000)).toBe(true);
    }
    expect(allow("ip", 1_000)).toBe(false);
    expect(allow("ip", 61_000)).toBe(true);
  });
});

describe("login", () => {
  test("links once, stores no portal password, and the next sign-in skips the portal", async () => {
    const database = memoryDatabase();
    const calls = { login: 0 };
    const logs: string[] = [];
    const { auth } = testAuth(database, calls, logs);
    const linked = await post(auth, "/api/auth/link-university", {
      email: "sample231670@daystar.ac.ke",
      portalUsername: "23-1670",
      portalPassword,
      localPassword,
      consent: true,
    });
    expect(linked.status).toBe(200);
    expect(calls.login).toBe(1);

    const dump = Buffer.from(database.serialize()).toString("latin1");
    expect(dump.includes(portalPassword)).toBe(false);
    expect(dump.includes(localPassword)).toBe(false);
    expect(logs.join("\n").includes(portalPassword)).toBe(false);
    expect(logs.join("\n").includes(localPassword)).toBe(false);

    const orm = drizzle(database, { schema });
    const account = orm.select({ password: schema.account.password }).from(schema.account).get();
    expect(account?.password === portalPassword).toBe(false);
    expect(account?.password === localPassword).toBe(false);
    const profile = orm.select().from(schema.studentProfiles).get();
    expect(profile?.officialId).toBe("23-1670");
    expect(profile?.fullName).toBe("Sample Student");
    expect(profile?.photoUrl).toBe(portalPhoto);
    const linkedUser = orm
      .select({ image: schema.user.image })
      .from(schema.user)
      .where(eq(schema.user.email, "sample231670@daystar.ac.ke"))
      .get();
    expect(linkedUser?.image).toBe(portalPhoto);

    const signedIn = await post(auth, "/api/auth/sign-in/email", {
      email: "sample231670@daystar.ac.ke",
      password: localPassword,
    });
    expect(signedIn.status).toBe(200);
    expect(calls.login).toBe(1);
    const session = await auth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie: cookieHeader(signedIn), origin },
      }),
    );
    const sessionBody = (await session.json()) as { session?: { activeOrganizationId?: string } };
    expect(sessionBody.session?.activeOrganizationId).toBe("uni_daystar");
    database.close();
  });

  test("creates one super admin and lets that account sign in with no membership", async () => {
    const database = memoryDatabase();
    await createFirstSuperAdmin(database, {
      email: "platform@example.com",
      name: "Platform Admin",
      password: localPassword,
    });
    await expect(
      createFirstSuperAdmin(database, {
        email: "other@example.com",
        name: "Other",
        password: localPassword,
      }),
    ).rejects.toThrow("A super admin already exists.");

    const calls = { login: 0 };
    const { auth } = testAuth(database, calls, []);
    const signedIn = await post(auth, "/api/auth/sign-in/email", {
      email: "platform@example.com",
      password: localPassword,
    });
    expect(signedIn.status).toBe(200);
    expect(calls.login).toBe(0);
    const orm = drizzle(database, { schema });
    expect(orm.select().from(schema.member).all()).toHaveLength(0);
    database.close();
  });

  test("blocks a member of a suspended university", async () => {
    const database = memoryDatabase();
    await localMember(database, {
      email: "person@strathmore.edu",
      name: "Strathmore Student",
      password: localPassword,
      universityId: "uni_strathmore",
    });
    const orm = drizzle(database, { schema });
    orm
      .update(schema.universities)
      .set({ status: "suspended" })
      .where(eq(schema.universities.id, "uni_strathmore"))
      .run();
    const { auth } = testAuth(database, { login: 0 }, []);
    const signedIn = await post(auth, "/api/auth/sign-in/email", {
      email: "person@strathmore.edu",
      password: localPassword,
    });
    expect(signedIn.ok).toBe(false);
    database.close();
  });

  test("keeps the session when sign-out has a body and no content type, then deletes it for JSON", async () => {
    const database = memoryDatabase();
    await localMember(database, {
      email: "person@strathmore.edu",
      name: "Strathmore Student",
      password: localPassword,
      universityId: "uni_strathmore",
    });
    const { auth } = testAuth(database, { login: 0 }, []);
    const signedIn = await post(auth, "/api/auth/sign-in/email", {
      email: "person@strathmore.edu",
      password: localPassword,
    });
    expect(signedIn.status).toBe(200);
    const cookie = cookieHeader(signedIn);
    const orm = drizzle(database, { schema });
    const before = orm.select().from(schema.session).all();
    expect(before.length).toBeGreaterThan(0);

    const rejected = await auth.handler(
      new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { origin, cookie },
        body: "{}",
      }),
    );
    expect(rejected.status).toBe(415);
    expect(orm.select().from(schema.session).all()).toHaveLength(before.length);

    const signedOut = await auth.handler(
      new Request(`${origin}/api/auth/sign-out`, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(signedOut.status).toBe(200);
    expect(orm.select().from(schema.session).all()).toHaveLength(0);
    const session = await auth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie, origin },
      }),
    );
    expect(await session.json()).toBeNull();
    database.close();
  });

  test("refuses a profile read across universities", async () => {
    const database = memoryDatabase();
    const daystar = await localMember(database, {
      email: "one@daystar.ac.ke",
      name: "Daystar Student",
      password: localPassword,
      universityId: "uni_daystar",
    });
    await localMember(database, {
      email: "two@strathmore.edu",
      name: "Strathmore Student",
      password: localPassword,
      universityId: "uni_strathmore",
    });
    const runtime = makeRuntime(database);
    const read = (userId: string, platformRole: string, universityId: string) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const universities = yield* University;
          return yield* universities.listProfiles({ userId, platformRole, universityId });
        }).pipe(Effect.result),
      );
    const denied = await read(daystar, "user", "uni_strathmore");
    expect(denied._tag).toBe("Failure");
    if (denied._tag === "Failure") {
      expect(denied.failure).toBeInstanceOf(NotAllowed);
    }
    const allowed = await read(daystar, "user", "uni_daystar");
    expect(allowed._tag).toBe("Success");
    if (allowed._tag === "Success") {
      expect(allowed.success.map((profile) => profile.fullName)).toEqual(["Daystar Student"]);
    }
    const admin = await read("missing", "super_admin", "uni_strathmore");
    expect(admin._tag).toBe("Success");
    if (admin._tag === "Success") {
      expect(admin.success.map((profile) => profile.fullName)).toEqual(["Strathmore Student"]);
    }
    await runtime.dispose();
    database.close();
  });
});
