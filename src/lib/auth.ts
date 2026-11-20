import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { hashPassword } from "better-auth/crypto";
import type { AccessControl } from "better-auth/plugins/access";
import { admin } from "better-auth/plugins/admin";
import { defaultAc as adminAccess, userAc } from "better-auth/plugins/admin/access";
import { organization } from "better-auth/plugins/organization";
import { defaultAc as organizationAccess } from "better-auth/plugins/organization/access";
import { eq, and } from "drizzle-orm";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Effect, Layer, Redacted } from "effect";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import * as schema from "@/db/schema";
import { daystarLayer, localLayer, oidcLayer, Service as IdentityAdapter } from "@/lib/identity/adapter";
import {
  InvalidCredentials,
  NotEligible,
  PortalChanged,
  PortalUnavailable,
} from "@/lib/identity/errors";
import { layer as livePortal, Service as PortalTransport } from "@/lib/identity/portal-transport";
import { deactivateFailureMessage, decideDeactivate, type DeactivateActor } from "@/domain/account-deactivation";
import {
  RESET_INVALID_MESSAGE,
  RESET_TOKEN_BYTES,
  resetFailureMessage,
} from "@/domain/password-reset";
import type { ResetActor } from "@/domain/password-reset";
import { CSV_NOTHING_MESSAGE, staffResultsCsv } from "@/domain/staff-csv";
import {
  decideInvite,
  INVITE_FORBIDDEN_MESSAGE,
  INVITE_INVALID_MESSAGE,
  INVITE_OTHER_UNIVERSITY_MESSAGE,
  INVITE_ROLE_MESSAGE,
  INVITE_TOKEN_BYTES,
  parseStaffRole,
  type InviteActor,
} from "@/domain/staff-invite";
import { makeRuntime } from "@/lib/runtime";
import { createWindowLimiter } from "@/lib/resolve-limit";
import { findDeactivationAccount, recordDeactivation } from "@/lib/account-deactivation-store";
import { acceptPasswordReset, mintPasswordReset } from "@/lib/password-reset-store";
import {
  acceptStaffInvite,
  commitStaffImport,
  createStaffInvite,
  previewStaffImport,
  type CreateInviteFailure,
} from "@/lib/staff-invite-store";
import { Service as University } from "@/services/university";

const allowInviteAccept = createWindowLimiter(10, 10 * 60 * 1000);
const allowStaffImport = createWindowLimiter(10, 10 * 60 * 1000);
const allowPasswordReset = createWindowLimiter(10, 10 * 60 * 1000);

const linkBody = z.object({
  email: z.string().trim().email(),
  portalUsername: z.string().trim().min(1),
  portalPassword: z.string().min(1),
  localPassword: z.string().min(8),
  consent: z.literal(true),
});

const createInviteBody = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["school_admin", "dept_head", "attendant"]),
  universityId: z.string().trim().min(1),
  departmentId: z.string().trim().min(1).optional(),
});

const importBody = z.object({
  csv: z.string().min(1),
  universityId: z.string().trim().min(1).optional(),
});

const acceptInviteBody = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(8).max(200),
});

const mintResetBody = z.object({
  email: z.string().trim().email(),
  universityId: z.string().trim().min(1).optional(),
});

const acceptResetBody = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(8).max(200),
});

const deactivateBody = z.object({
  email: z.string().trim().email(),
  reason: z.string(),
  universityId: z.string().trim().min(1).optional(),
});

const noOrganizationPermissions = {
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
} as const;

const schoolAdminRole = organizationAccess.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: [],
  ac: [],
});

const superAdminRole = adminAccess.newRole({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "set-email", "get", "update"],
  session: ["list", "revoke", "delete"],
});

// SAFETY: better-auth types `ac` as AccessControl<Statements>. defaultAc is that
// same runtime object with a narrower Statements parameter, and newRole is
// invariant in the parameter, so the library's own value does not type-check
// against its own option. The plugin reads newRole and statements.
const organizationAc = organizationAccess as AccessControl;
const adminAc = adminAccess as AccessControl;

export function hashLocalPassword(password: string): Promise<string> {
  return hashPassword(password);
}

function httpError(
  status: "FORBIDDEN" | "BAD_GATEWAY" | "UNPROCESSABLE_ENTITY" | "INTERNAL_SERVER_ERROR",
  code: string,
  message: string,
): APIError {
  return APIError.from(status, { code, message });
}

export interface CreateAuthOptions {
  readonly database: Database;

  readonly secret: string;

  readonly baseURL: string;

  readonly trustedOrigins: readonly string[];

  readonly portal?: Layer.Layer<PortalTransport>;

  readonly captureLog?: (line: string) => void;

  readonly rateLimit?: boolean;
}

function adapterLayer(adapter: "daystar-portal" | "local" | "oidc") {
  switch (adapter) {
    case "daystar-portal":
      return daystarLayer;
    case "local":
      return localLayer;
    case "oidc":
      return oidcLayer;
  }
}

function authError(cause: unknown): APIError | null {
  if (cause instanceof InvalidCredentials) {
    return httpError("FORBIDDEN", "INVALID_CREDENTIALS", cause.message);
  }
  if (cause instanceof NotEligible) {
    return httpError("FORBIDDEN", "NOT_ELIGIBLE", cause.message);
  }
  if (cause instanceof PortalUnavailable) {
    return httpError("BAD_GATEWAY", "PORTAL_UNAVAILABLE", cause.message);
  }
  if (cause instanceof PortalChanged) {
    return httpError("BAD_GATEWAY", "PORTAL_CHANGED", cause.message);
  }
  return null;
}

export function createAuth(options: CreateAuthOptions) {
  const orm = drizzle(options.database, { schema });
  const runtime = makeRuntime(options.database, options.portal ?? livePortal);

  const auth = betterAuth({
    database: drizzleAdapter(orm, {
      provider: "sqlite",
      schema,
    }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [...options.trustedOrigins],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
    },
    rateLimit: {
      enabled: options.rateLimit !== false,
      window: 60,
      max: 30,
    },
    logger: options.captureLog
      ? {
          level: "error",
          log: (level, message, ...args) => {
            const extra = args
              .map((arg) => {
                try {
                  return JSON.stringify(arg);
                } catch {
                  return "[unprintable]";
                }
              })
              .join(" ");
            options.captureLog?.(`${level} ${message} ${extra}`);
          },
        }
      : undefined,
    user: {
      additionalFields: {
        platformRole: {
          type: "string",
          required: true,
          defaultValue: "user",
          input: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const actor = orm.select().from(schema.user).where(eq(schema.user.id, session.userId)).get();
            if (actor?.platformRole === "super_admin") {
              return;
            }
            const membership = orm
              .select({
                organizationId: schema.member.organizationId,
                status: schema.universities.status,
              })
              .from(schema.member)
              .innerJoin(schema.universities, eq(schema.member.organizationId, schema.universities.id))
              .where(eq(schema.member.userId, session.userId))
              .all()
              .find((row) => row.status === "active");
            if (membership === undefined) {
              return false;
            }
            return {
              data: {
                ...session,
                activeOrganizationId: membership.organizationId,
              },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: false,
        creatorRole: "school_admin",
        ac: organizationAc,
        roles: {
          school_admin: schoolAdminRole,
          dept_head: organizationAccess.newRole(noOrganizationPermissions),
          attendant: organizationAccess.newRole(noOrganizationPermissions),
          student: organizationAccess.newRole(noOrganizationPermissions),
        },
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["super_admin"],
        ac: adminAc,
        roles: {
          super_admin: superAdminRole,
          user: userAc,
        },
      }),
      {
        id: "link-university",
        endpoints: {
          linkUniversity: createAuthEndpoint(
            "/link-university",
            {
              method: "POST",
              body: linkBody,
            },
            async (ctx) => {
              const secret = Redacted.make(ctx.body.portalPassword);
              try {
                const identity = await runtime.runPromise(
                  Effect.gen(function* () {
                    const universities = yield* University;
                    const resolved = yield* universities.resolve(ctx.body.email);
                    if (resolved._tag !== "Supported") {
                      return yield* Effect.fail(
                        new NotEligible({
                          message:
                            resolved._tag === "DirectoryOnly"
                              ? "This university is not supported yet."
                              : "This email domain is not recognised.",
                        }),
                      );
                    }
                    if (resolved.university.status === "suspended") {
                      return yield* Effect.fail(
                        new NotEligible({ message: "This university is suspended." }),
                      );
                    }
                    if (resolved.university.authConfig.adapter !== "daystar-portal") {
                      return yield* Effect.fail(
                        new NotEligible({
                          message: "Staff at this university sign in with an invite, not a portal password.",
                        }),
                      );
                    }
                    const adapter = yield* IdentityAdapter;
                    return yield* adapter.verify({
                      email: ctx.body.email,
                      portalUsername: ctx.body.portalUsername,
                      portalPassword: secret,
                      portalBase: resolved.university.authConfig.portalBase,
                      loginBody: resolved.university.authConfig.loginBody,
                    });
                  }).pipe(Effect.provide(adapterLayer("daystar-portal"))),
                );

                const email = ctx.body.email.trim().toLowerCase();
                const existing = await ctx.context.internalAdapter.findUserByEmail(email);
                if (existing) {
                  throw httpError(
                    "UNPROCESSABLE_ENTITY",
                    "ALREADY_LINKED",
                    "This email is already linked. Sign in with the local password.",
                  );
                }

                const created = await ctx.context.internalAdapter.createUser(
                  {
                    email,
                    name: identity.fullName,
                    emailVerified: true,
                    platformRole: "user",
                    role: "user",
                    ...(identity.photoUrl === null ? {} : { image: identity.photoUrl }),
                  },
                  { method: "email-password" },
                );
                if (!created) {
                  throw httpError(
                    "INTERNAL_SERVER_ERROR",
                    "ACCOUNT_NOT_CREATED",
                    "The account could not be created.",
                  );
                }

                try {
                  const hash = await ctx.context.password.hash(ctx.body.localPassword);
                  await ctx.context.internalAdapter.linkAccount({
                    userId: created.id,
                    providerId: "credential",
                    accountId: created.id,
                    password: hash,
                  });
                  const now = new Date();
                  const resolved = orm
                    .select()
                    .from(schema.universityDomains)
                    .where(eq(schema.universityDomains.domain, email.slice(email.lastIndexOf("@") + 1)))
                    .get();
                  if (resolved === undefined) {
                    throw new Error("The university domain disappeared during link.");
                  }
                  orm
                    .insert(schema.studentProfiles)
                    .values({
                      id: crypto.randomUUID(),
                      userId: created.id,
                      universityId: resolved.universityId,
                      officialId: identity.officialId,
                      fullName: identity.fullName,
                      programme: identity.programme,
                      campus: identity.campus,
                      school: identity.school,
                      standing: identity.standing,
                      email: identity.email,
                      photoUrl: identity.photoUrl,
                      source: identity.source,
                      firstVerifiedAt: now,
                      lastVerifiedAt: now,
                    })
                    .run();
                  orm
                    .insert(schema.member)
                    .values({
                      id: crypto.randomUUID(),
                      organizationId: resolved.universityId,
                      userId: created.id,
                      role: "student",
                      createdAt: now,
                    })
                    .run();
                } catch (cause) {
                  orm.delete(schema.user).where(eq(schema.user.id, created.id)).run();
                  const mapped = authError(cause);
                  if (mapped !== null) {
                    throw mapped;
                  }
                  throw httpError(
                    "INTERNAL_SERVER_ERROR",
                    "LINK_FAILED",
                    "The account could not be linked.",
                  );
                }

                const session = await ctx.context.internalAdapter.createSession(created.id);
                if (!session) {
                  throw httpError(
                    "INTERNAL_SERVER_ERROR",
                    "SESSION_NOT_CREATED",
                    "The session could not be created.",
                  );
                }
                await setSessionCookie(ctx, { session, user: created });
                return ctx.json({
                  user: { id: created.id, email: created.email, name: created.name },
                });
              } catch (cause) {
                const mapped = authError(cause);
                if (mapped !== null) {
                  throw mapped;
                }
                throw cause;
              } finally {
                Redacted.wipeUnsafe(secret);
              }
            },
          ),
        },
      },
      {
        id: "staff-invite",
        endpoints: {
          createStaffInvite: createAuthEndpoint(
            "/staff-invite",
            {
              method: "POST",
              body: createInviteBody,
            },
            async (ctx) => {
              const session = await getSessionFromCtx(ctx);
              if (session === null) {
                throw httpError("FORBIDDEN", "FORBIDDEN", INVITE_FORBIDDEN_MESSAGE);
              }
              let actor: InviteActor;
              if (session.user.platformRole === "super_admin") {
                actor = { _tag: "super_admin" };
              } else {
                const organizationId = session.session.activeOrganizationId;
                const membership =
                  typeof organizationId === "string"
                    ? orm
                        .select({ role: schema.member.role })
                        .from(schema.member)
                        .where(
                          and(
                            eq(schema.member.organizationId, organizationId),
                            eq(schema.member.userId, session.user.id),
                          ),
                        )
                        .get()
                    : undefined;
                if (typeof organizationId !== "string" || membership?.role !== "school_admin") {
                  throw httpError("FORBIDDEN", "FORBIDDEN", INVITE_FORBIDDEN_MESSAGE);
                }
                actor = { _tag: "school_admin", universityId: organizationId };
              }
              const role = parseStaffRole(ctx.body.role);
              if (role === null) {
                throw httpError("UNPROCESSABLE_ENTITY", "ROLE_NOT_INVITED", "That role is not invited from here.");
              }
              const decision = decideInvite(actor, role, ctx.body.universityId);
              if (decision._tag === "deny") {
                switch (decision.reason) {
                  case "other-university":
                    throw httpError(
                      "UNPROCESSABLE_ENTITY",
                      "OTHER_UNIVERSITY",
                      INVITE_OTHER_UNIVERSITY_MESSAGE,
                    );
                  case "role":
                    throw httpError("UNPROCESSABLE_ENTITY", "INVITE_ROLE", INVITE_ROLE_MESSAGE);
                  case "forbidden":
                    throw httpError("FORBIDDEN", "FORBIDDEN", INVITE_FORBIDDEN_MESSAGE);
                }
              }
              const token = mintInviteToken();
              const created = createStaffInvite(orm, {
                email: ctx.body.email,
                fullName: ctx.body.fullName,
                role,
                universityId: ctx.body.universityId,
                departmentId: ctx.body.departmentId ?? null,
                invitedBy: session.user.id,
                token,
                now: new Date(),
              });
              if (created._tag === "failed") {
                throw httpError("UNPROCESSABLE_ENTITY", "INVITE_NOT_CREATED", createInviteMessage(created.reason));
              }
              const origin = trustedRequestOrigin(ctx.headers ?? new Headers(), options.baseURL, options.trustedOrigins);
              return ctx.json({ link: `${origin}/invite/${created.token}` });
            },
          ),
          validateStaffImport: createAuthEndpoint(
            "/staff-import/validate",
            { method: "POST", body: importBody },
            async (ctx) => {
              const target = await importTarget(ctx, orm, options.rateLimit !== false);
              const preview = previewStaffImport(orm, {
                csv: ctx.body.csv,
                universityId: target.universityId,
                now: new Date(),
              });
              if (preview._tag === "rejected") {
                throw httpError("UNPROCESSABLE_ENTITY", "IMPORT_REJECTED", preview.message);
              }
              return ctx.json({
                inviteCount: preview.inviteCount,
                skipCount: preview.skipCount,
                rows: preview.rows,
              });
            },
          ),
          commitStaffImportEndpoint: createAuthEndpoint(
            "/staff-import/commit",
            { method: "POST", body: importBody },
            async (ctx) => {
              const target = await importTarget(ctx, orm, options.rateLimit !== false);
              const imported = commitStaffImport(orm, {
                csv: ctx.body.csv,
                universityId: target.universityId,
                invitedBy: target.userId,
                now: new Date(),
                mintToken: mintInviteToken,
              });
              if (imported._tag === "rejected") {
                throw httpError("UNPROCESSABLE_ENTITY", "IMPORT_REJECTED", imported.message);
              }
              if (imported._tag === "empty") {
                throw httpError("UNPROCESSABLE_ENTITY", "IMPORT_EMPTY", CSV_NOTHING_MESSAGE);
              }
              const origin = trustedRequestOrigin(ctx.headers ?? new Headers(), options.baseURL, options.trustedOrigins);
              const rows = imported.rows.map((row) => ({
                line: row.line,
                fullName: row.fullName,
                email: row.email,
                roleLabel: row.roleLabel,
                departmentName: row.departmentName,
                employeeId: row.employeeId,
                result: row.result,
                reason: row.reason,
                link: row.token === null ? "" : `${origin}/invite/${row.token}`,
              }));
              const inviteCount = rows.filter((row) => row.result === "invite" && row.link.length > 0).length;
              return ctx.json({
                inviteCount,
                skipCount: rows.length - inviteCount,
                rows,
                resultsCsv: staffResultsCsv(
                  imported.rows.map((row) => ({
                    ...row,
                    link: row.token === null ? "" : `${origin}/invite/${row.token}`,
                  })),
                ),
              });
            },
          ),
          deactivateAccountEndpoint: createAuthEndpoint(
            "/deactivate-account",
            { method: "POST", body: deactivateBody },
            async (ctx) => {
              const reason = ctx.body.reason.trim();
              if (reason.length === 0) {
                throw httpError("UNPROCESSABLE_ENTITY", "REASON_REQUIRED", deactivateFailureMessage("reason"));
              }
              if (reason.length > 500) {
                throw httpError("UNPROCESSABLE_ENTITY", "REASON_TOO_LONG", deactivateFailureMessage("reason-long"));
              }
              const session = await getSessionFromCtx(ctx);
              if (session === null) {
                throw httpError("FORBIDDEN", "FORBIDDEN", deactivateFailureMessage("forbidden"));
              }
              let actor: DeactivateActor;
              let universityId: string;
              if (session.user.platformRole === "super_admin") {
                const named = ctx.body.universityId;
                if (named === undefined) {
                  throw httpError("UNPROCESSABLE_ENTITY", "UNIVERSITY_REQUIRED", "Choose a university.");
                }
                actor = { _tag: "super_admin", userId: session.user.id };
                universityId = named;
              } else {
                const organizationId = session.session.activeOrganizationId;
                const membership =
                  typeof organizationId === "string"
                    ? orm
                        .select({ role: schema.member.role })
                        .from(schema.member)
                        .where(
                          and(
                            eq(schema.member.organizationId, organizationId),
                            eq(schema.member.userId, session.user.id),
                          ),
                        )
                        .get()
                    : undefined;
                if (typeof organizationId !== "string" || membership?.role !== "school_admin") {
                  throw httpError("FORBIDDEN", "FORBIDDEN", deactivateFailureMessage("forbidden"));
                }
                actor = { _tag: "school_admin", userId: session.user.id, universityId: organizationId };
                universityId = organizationId;
              }
              const found = findDeactivationAccount(orm, { email: ctx.body.email, universityId });
              if (found._tag === "failed") {
                const status = found.reason === "forbidden" ? "FORBIDDEN" : "UNPROCESSABLE_ENTITY";
                throw httpError(status, "DEACTIVATE_NOT_DONE", deactivateFailureMessage(found.reason));
              }
              const decision = decideDeactivate(actor, found.account);
              if (decision._tag === "deny") {
                const status = decision.reason === "forbidden" ? "FORBIDDEN" : "UNPROCESSABLE_ENTITY";
                throw httpError(status, "DEACTIVATE_NOT_DONE", deactivateFailureMessage(decision.reason));
              }
              if (found.account.banned) {
                throw httpError("UNPROCESSABLE_ENTITY", "DEACTIVATE_NOT_DONE", deactivateFailureMessage("already"));
              }
              // Not the admin ban route: that permission is global, so a school administrator could ban any account.
              await ctx.context.internalAdapter.updateUser(found.account.userId, {
                banned: true,
                banReason: reason,
                banExpires: null,
                updatedAt: new Date(),
              });
              await ctx.context.internalAdapter.deleteUserSessions(found.account.userId);
              recordDeactivation(orm, {
                userId: found.account.userId,
                email: found.account.email,
                role: found.account.role,
                universityId,
                actorUserId: session.user.id,
                reason,
                now: new Date(),
              });
              return ctx.json({ email: found.account.email });
            },
          ),
          mintPasswordResetEndpoint: createAuthEndpoint(
            "/password-reset",
            { method: "POST", body: mintResetBody },
            async (ctx) => {
              const session = await getSessionFromCtx(ctx);
              if (session === null) {
                throw httpError("FORBIDDEN", "FORBIDDEN", resetFailureMessage("forbidden"));
              }
              let actor: ResetActor;
              let universityId: string;
              if (session.user.platformRole === "super_admin") {
                const named = ctx.body.universityId;
                if (named === undefined) {
                  throw httpError("UNPROCESSABLE_ENTITY", "UNIVERSITY_REQUIRED", "Choose a university.");
                }
                actor = { _tag: "super_admin" };
                universityId = named;
              } else {
                const organizationId = session.session.activeOrganizationId;
                const membership =
                  typeof organizationId === "string"
                    ? orm
                        .select({ role: schema.member.role })
                        .from(schema.member)
                        .where(
                          and(
                            eq(schema.member.organizationId, organizationId),
                            eq(schema.member.userId, session.user.id),
                          ),
                        )
                        .get()
                    : undefined;
                if (typeof organizationId !== "string" || membership?.role !== "school_admin") {
                  throw httpError("FORBIDDEN", "FORBIDDEN", resetFailureMessage("forbidden"));
                }
                actor = { _tag: "school_admin", universityId: organizationId };
                universityId = organizationId;
              }
              const token = mintResetToken();
              const minted = mintPasswordReset(orm, {
                actor,
                email: ctx.body.email,
                universityId,
                mintedBy: session.user.id,
                token,
                now: new Date(),
              });
              if (minted._tag === "failed") {
                const status = minted.reason === "forbidden" ? "FORBIDDEN" : "UNPROCESSABLE_ENTITY";
                throw httpError(status, "RESET_NOT_CREATED", resetFailureMessage(minted.reason));
              }
              const origin = trustedRequestOrigin(ctx.headers ?? new Headers(), options.baseURL, options.trustedOrigins);
              return ctx.json({ link: `${origin}/reset/${minted.token}` });
            },
          ),
          acceptPasswordResetEndpoint: createAuthEndpoint(
            "/accept-password-reset",
            { method: "POST", body: acceptResetBody },
            async (ctx) => {
              const secret = Redacted.make(ctx.body.password);
              try {
                const headers = ctx.headers ?? new Headers();
                if (options.rateLimit !== false) {
                  const allowed = allowPasswordReset(clientAddress(headers), Date.now());
                  if (!allowed) {
                    throw httpError("FORBIDDEN", "RATE_LIMITED", "Too many attempts. Wait and try again.");
                  }
                }
                const passwordHash = await ctx.context.password.hash(Redacted.value(secret));
                const accepted = acceptPasswordReset(orm, {
                  token: ctx.body.token,
                  passwordHash,
                  now: new Date(),
                });
                if (accepted._tag === "failed") {
                  throw httpError("FORBIDDEN", "RESET_NOT_ACCEPTED", RESET_INVALID_MESSAGE);
                }
                const account = await ctx.context.internalAdapter.findUserById(accepted.userId);
                if (!account) {
                  throw httpError("INTERNAL_SERVER_ERROR", "ACCOUNT_NOT_CREATED", "The account could not be updated.");
                }
                const signedIn = await ctx.context.internalAdapter.createSession(account.id);
                if (!signedIn) {
                  throw httpError("INTERNAL_SERVER_ERROR", "SESSION_NOT_CREATED", "The session could not be created.");
                }
                await setSessionCookie(ctx, { session: signedIn, user: account });
                return ctx.json({ user: { id: account.id, email: account.email, name: account.name } });
              } finally {
                Redacted.wipeUnsafe(secret);
              }
            },
          ),
          acceptStaffInvite: createAuthEndpoint(
            "/accept-invite",
            {
              method: "POST",
              body: acceptInviteBody,
            },
            async (ctx) => {
              const secret = Redacted.make(ctx.body.password);
              try {
                const headers = ctx.headers ?? new Headers();
                if (options.rateLimit !== false) {
                  const allowed = allowInviteAccept(clientAddress(headers), Date.now());
                  if (!allowed) {
                    throw httpError("FORBIDDEN", "RATE_LIMITED", "Too many attempts. Wait and try again.");
                  }
                }
                const passwordHash = await ctx.context.password.hash(Redacted.value(secret));
                const accepted = acceptStaffInvite(orm, {
                  token: ctx.body.token,
                  passwordHash,
                  now: new Date(),
                });
                if (accepted._tag === "failed") {
                  throw httpError("FORBIDDEN", "INVITE_NOT_ACCEPTED", acceptInviteMessage(accepted.reason));
                }
                const created = await ctx.context.internalAdapter.findUserById(accepted.userId);
                if (!created) {
                  throw httpError("INTERNAL_SERVER_ERROR", "ACCOUNT_NOT_CREATED", "The account could not be created.");
                }
                const signedIn = await ctx.context.internalAdapter.createSession(created.id);
                if (!signedIn) {
                  throw httpError("INTERNAL_SERVER_ERROR", "SESSION_NOT_CREATED", "The session could not be created.");
                }
                await setSessionCookie(ctx, { session: signedIn, user: created });
                return ctx.json({ user: { id: created.id, email: created.email, name: created.name } });
              } finally {
                Redacted.wipeUnsafe(secret);
              }
            },
          ),
        },
      },
    ],
  });

  return { auth, orm, runtime, database: options.database };
}

async function importTarget(
  ctx: GenericEndpointContext,
  orm: BunSQLiteDatabase<typeof schema>,
  rateLimit: boolean,
): Promise<{ readonly userId: string; readonly universityId: string }> {
  if (rateLimit) {
    const allowed = allowStaffImport(clientAddress(ctx.headers ?? new Headers()), Date.now());
    if (!allowed) {
      throw httpError("FORBIDDEN", "RATE_LIMITED", "Too many attempts. Wait and try again.");
    }
  }
  const session = await getSessionFromCtx(ctx);
  if (session === null) {
    throw httpError("FORBIDDEN", "FORBIDDEN", INVITE_FORBIDDEN_MESSAGE);
  }
  if (session.user.platformRole === "super_admin") {
    const universityId = readUniversityId(ctx.body);
    if (universityId === null) {
      throw httpError("UNPROCESSABLE_ENTITY", "UNIVERSITY_REQUIRED", "Choose a university.");
    }
    return { userId: session.user.id, universityId };
  }
  const organizationId = session.session.activeOrganizationId;
  const membership =
    typeof organizationId === "string"
      ? orm
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, session.user.id)))
          .get()
      : undefined;
  if (typeof organizationId !== "string" || membership?.role !== "school_admin") {
    throw httpError("FORBIDDEN", "FORBIDDEN", INVITE_FORBIDDEN_MESSAGE);
  }
  return { userId: session.user.id, universityId: organizationId };
}

export type AppAuth = ReturnType<typeof createAuth>;

function readUniversityId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("universityId" in body)) {
    return null;
  }
  const universityId = body.universityId;
  if (typeof universityId !== "string") {
    return null;
  }
  const trimmed = universityId.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function mintInviteToken(): string {
  return mintToken(INVITE_TOKEN_BYTES);
}

function mintResetToken(): string {
  return mintToken(RESET_TOKEN_BYTES);
}

function mintToken(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function createInviteMessage(reason: CreateInviteFailure): string {
  switch (reason) {
    case "duplicate":
      return "An account or a pending invite already uses this email.";
    case "unknown-university":
      return "That university is not supported.";
    case "unknown-department":
      return "That department is not part of this university.";
    case "suspended":
      return "This university is suspended.";
  }
}

function acceptInviteMessage(reason: "invalid" | "email-taken" | "suspended"): string {
  switch (reason) {
    case "invalid":
      return INVITE_INVALID_MESSAGE;
    case "email-taken":
      return "This email is already linked. Sign in with the local password.";
    case "suspended":
      return "This university is suspended.";
  }
}

function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first !== undefined && first.length > 0) {
      return first;
    }
  }
  return headers.get("x-real-ip") ?? "local";
}

function trustedRequestOrigin(headers: Headers, baseURL: string, trusted: readonly string[]): string {
  const origin = headers.get("origin");
  if (origin !== null && trusted.includes(origin)) {
    return origin;
  }
  return baseURL;
}
