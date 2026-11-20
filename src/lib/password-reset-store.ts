import { and, eq, isNull, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import {
  decideReset,
  hashResetToken,
  parseUniversityRole,
  resetExpiresAt,
  resetStillOpen,
  type ResetActor,
  type ResetDenial,
} from "@/domain/password-reset";
import { labelStaffRole, parseStaffRole } from "@/domain/staff-invite";

type Orm = BunSQLiteDatabase<typeof schema>;

export type MintResetFailure = ResetDenial | "unknown" | "no-password" | "suspended" | "unknown-university";

export interface OpenReset {
  readonly fullName: string;

  readonly email: string;

  readonly roleLabel: string;

  readonly universityName: string;
}

export function mintPasswordReset(
  orm: Orm,
  input: {
    readonly actor: ResetActor;
    readonly email: string;
    readonly universityId: string;
    readonly mintedBy: string;
    readonly token: string;
    readonly now: Date;
  },
): { readonly _tag: "minted"; readonly token: string } | { readonly _tag: "failed"; readonly reason: MintResetFailure } {
  const email = input.email.trim().toLowerCase();
  const university = orm
    .select({ id: schema.universities.id, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, input.universityId))
    .get();
  if (university === undefined) return { _tag: "failed", reason: "unknown-university" };
  if (university.status !== "active") return { _tag: "failed", reason: "suspended" };

  const account = orm
    .select({
      userId: schema.user.id,
      platformRole: schema.user.platformRole,
      role: schema.member.role,
      password: schema.account.password,
    })
    .from(schema.user)
    .innerJoin(schema.member, eq(schema.member.userId, schema.user.id))
    .leftJoin(
      schema.account,
      and(eq(schema.account.userId, schema.user.id), eq(schema.account.providerId, "credential")),
    )
    .where(and(eq(sql`lower(${schema.user.email})`, email), eq(schema.member.organizationId, input.universityId)))
    .get();
  if (account === undefined) return { _tag: "failed", reason: "unknown" };

  const role = parseUniversityRole(account.role);
  const platformRole = account.platformRole === "super_admin" ? "super_admin" : "user";
  if (role === null) return { _tag: "failed", reason: "forbidden" };
  const decision = decideReset(input.actor, {
    platformRole,
    role,
    universityId: input.universityId,
  });
  if (decision._tag === "deny") return { _tag: "failed", reason: decision.reason };
  if (account.password === null || account.password.length === 0) {
    return { _tag: "failed", reason: "no-password" };
  }

  const id = crypto.randomUUID();
  const expiresAt = resetExpiresAt(input.now);
  orm.transaction((tx) => {
    tx.update(schema.passwordResets)
      .set({ revokedAt: input.now })
      .where(
        and(
          eq(schema.passwordResets.userId, account.userId),
          isNull(schema.passwordResets.usedAt),
          isNull(schema.passwordResets.revokedAt),
        ),
      )
      .run();
    tx.insert(schema.passwordResets)
      .values({
        id,
        tokenHash: hashResetToken(input.token),
        userId: account.userId,
        universityId: input.universityId,
        mintedBy: input.mintedBy,
        createdAt: input.now,
        expiresAt,
        usedAt: null,
        revokedAt: null,
      })
      .run();
    tx.insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        actorUserId: input.mintedBy,
        universityId: input.universityId,
        action: "password.reset",
        target: `user:${account.userId}`,
        reason: null,
        before: null,
        after: { email, role, expiresAt: expiresAt.toISOString() },
        createdAt: input.now,
      })
      .run();
  });
  return { _tag: "minted", token: input.token };
}

export function readPasswordReset(orm: Orm, token: string, now: Date): OpenReset | null {
  const row = openRow(orm, token, now);
  if (row === null) return null;
  const staffRole = parseStaffRole(row.role);
  return {
    fullName: row.fullName,
    email: row.email,
    roleLabel: staffRole === null ? "Student" : labelStaffRole(staffRole),
    universityName: row.universityName,
  };
}

export function acceptPasswordReset(
  orm: Orm,
  input: { readonly token: string; readonly passwordHash: string; readonly now: Date },
): { readonly _tag: "accepted"; readonly userId: string } | { readonly _tag: "failed"; readonly reason: "invalid" } {
  const row = openRow(orm, input.token, input.now);
  if (row === null) return { _tag: "failed", reason: "invalid" };
  const credential = orm
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.userId, row.userId), eq(schema.account.providerId, "credential")))
    .get();
  if (credential === undefined) return { _tag: "failed", reason: "invalid" };

  orm.transaction((tx) => {
    const claimed = tx
      .update(schema.passwordResets)
      .set({ usedAt: input.now })
      .where(and(eq(schema.passwordResets.id, row.id), isNull(schema.passwordResets.usedAt)))
      .returning({ id: schema.passwordResets.id })
      .all();
    if (claimed.length !== 1) {
      throw new Error("The reset link was already used.");
    }
    tx.update(schema.account)
      .set({ password: input.passwordHash, updatedAt: input.now })
      .where(eq(schema.account.id, credential.id))
      .run();
    tx.delete(schema.session).where(eq(schema.session.userId, row.userId)).run();
    tx.insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        actorUserId: row.userId,
        universityId: row.universityId,
        action: "password.reset.accept",
        target: `user:${row.userId}`,
        reason: null,
        before: null,
        after: { userId: row.userId },
        createdAt: input.now,
      })
      .run();
  });
  return { _tag: "accepted", userId: row.userId };
}

interface OpenResetRow {
  readonly id: string;
  readonly userId: string;
  readonly universityId: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: string;
  readonly universityName: string;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date;
}

function openRow(orm: Orm, token: string, now: Date): OpenResetRow | null {
  const row = orm
    .select({
      id: schema.passwordResets.id,
      userId: schema.passwordResets.userId,
      universityId: schema.passwordResets.universityId,
      fullName: schema.user.name,
      email: schema.user.email,
      role: schema.member.role,
      universityName: schema.universities.name,
      usedAt: schema.passwordResets.usedAt,
      revokedAt: schema.passwordResets.revokedAt,
      expiresAt: schema.passwordResets.expiresAt,
    })
    .from(schema.passwordResets)
    .innerJoin(schema.user, eq(schema.passwordResets.userId, schema.user.id))
    .innerJoin(schema.universities, eq(schema.passwordResets.universityId, schema.universities.id))
    .innerJoin(
      schema.member,
      and(
        eq(schema.member.userId, schema.passwordResets.userId),
        eq(schema.member.organizationId, schema.passwordResets.universityId),
      ),
    )
    .where(eq(schema.passwordResets.tokenHash, hashResetToken(token)))
    .get();
  if (row === undefined) return null;
  if (!resetStillOpen(row, now)) return null;
  if (row.universityName.length === 0) return null;
  return row;
}
