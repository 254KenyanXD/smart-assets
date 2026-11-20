import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import {
  parseUniversityRole,
  type DeactivateTarget,
} from "@/domain/account-deactivation";

type Orm = BunSQLiteDatabase<typeof schema>;

export type FindDeactivationFailure = "unknown" | "suspended" | "unknown-university" | "forbidden";

export interface DeactivationAccount extends DeactivateTarget {
  readonly email: string;

  readonly banned: boolean;
}

export function findDeactivationAccount(
  orm: Orm,
  input: { readonly email: string; readonly universityId: string },
): { readonly _tag: "found"; readonly account: DeactivationAccount } | { readonly _tag: "failed"; readonly reason: FindDeactivationFailure } {
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
      banned: schema.user.banned,
    })
    .from(schema.user)
    .innerJoin(schema.member, eq(schema.member.userId, schema.user.id))
    .where(and(eq(sql`lower(${schema.user.email})`, email), eq(schema.member.organizationId, input.universityId)))
    .get();
  if (account === undefined) return { _tag: "failed", reason: "unknown" };
  const role = parseUniversityRole(account.role);
  if (role === null) return { _tag: "failed", reason: "forbidden" };
  const platformRole = account.platformRole === "super_admin" ? "super_admin" : "user";
  return {
    _tag: "found",
    account: {
      userId: account.userId,
      email,
      platformRole,
      role,
      universityId: input.universityId,
      banned: account.banned === true,
    },
  };
}

export function recordDeactivation(
  orm: Orm,
  input: {
    readonly userId: string;
    readonly email: string;
    readonly role: string;
    readonly universityId: string;
    readonly actorUserId: string;
    readonly reason: string;
    readonly now: Date;
  },
): void {
  orm.transaction((tx) => {
    tx.update(schema.staffInvites)
      .set({ revokedAt: input.now })
      .where(
        and(
          eq(schema.staffInvites.universityId, input.universityId),
          isNull(schema.staffInvites.acceptedAt),
          isNull(schema.staffInvites.revokedAt),
          or(eq(sql`lower(${schema.staffInvites.email})`, input.email), eq(schema.staffInvites.invitedBy, input.userId)),
        ),
      )
      .run();
    tx.update(schema.passwordResets)
      .set({ revokedAt: input.now })
      .where(
        and(
          eq(schema.passwordResets.userId, input.userId),
          isNull(schema.passwordResets.usedAt),
          isNull(schema.passwordResets.revokedAt),
        ),
      )
      .run();
    tx.insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        actorUserId: input.actorUserId,
        universityId: input.universityId,
        action: "account.deactivate",
        target: `user:${input.userId}`,
        reason: input.reason,
        before: { banned: false, email: input.email, role: input.role },
        after: { banned: true, email: input.email, role: input.role },
        createdAt: input.now,
      })
      .run();
  });
}
