import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import { previewStaffCsv, type StaffCsvRow } from "@/domain/staff-csv";
import {
  hashInviteToken,
  inviteExpiresAt,
  inviteLifetimeState,
  labelStaffRole,
  parseStaffRole,
  type StaffRole,
} from "@/domain/staff-invite";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface PendingInvite {
  readonly fullName: string;

  readonly email: string;

  readonly role: StaffRole;

  readonly roleLabel: string;

  readonly universityName: string;
}

export type CreateInviteFailure = "duplicate" | "unknown-university" | "unknown-department" | "suspended";

export type AcceptInviteFailure = "invalid" | "email-taken" | "suspended";

export function createStaffInvite(
  orm: Orm,
  input: {
    readonly email: string;
    readonly fullName: string;
    readonly role: StaffRole;
    readonly universityId: string;
    readonly departmentId?: string | null;
    readonly employeeId?: string | null;
    readonly batchId?: string | null;
    readonly invitedBy: string;
    readonly token: string;
    readonly now: Date;
  },
): { readonly _tag: "created"; readonly token: string } | { readonly _tag: "failed"; readonly reason: CreateInviteFailure } {
  const email = input.email.trim().toLowerCase();
  const university = orm
    .select({ id: schema.universities.id, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, input.universityId))
    .get();
  if (university === undefined) {
    return { _tag: "failed", reason: "unknown-university" };
  }
  if (university.status !== "active") {
    return { _tag: "failed", reason: "suspended" };
  }
  const departmentId = input.departmentId ?? null;
  if (departmentId !== null) {
    const department = orm
      .select({ id: schema.departments.id })
      .from(schema.departments)
      .innerJoin(schema.faculties, eq(schema.departments.facultyId, schema.faculties.id))
      .where(
        and(
          eq(schema.departments.id, departmentId),
          eq(schema.faculties.universityId, input.universityId),
        ),
      )
      .get();
    if (department === undefined) {
      return { _tag: "failed", reason: "unknown-department" };
    }
  }
  const existingUser = orm
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();

  const pending = orm
    .select({ id: schema.staffInvites.id })
    .from(schema.staffInvites)
    .where(
      and(
        eq(schema.staffInvites.email, email),
        isNull(schema.staffInvites.acceptedAt),
        isNull(schema.staffInvites.revokedAt),
        gt(schema.staffInvites.expiresAt, input.now),
      ),
    )
    .get();
  if (existingUser !== undefined || pending !== undefined) {
    return { _tag: "failed", reason: "duplicate" };
  }

  const id = crypto.randomUUID();
  const expiresAt = inviteExpiresAt(input.now);
  orm.transaction((tx) => {
    tx.insert(schema.staffInvites)
      .values({
        id,
        tokenHash: hashInviteToken(input.token),
        email,
        fullName: input.fullName.trim(),
        role: input.role,
        universityId: input.universityId,
        departmentId,
        employeeId: input.employeeId ?? null,
        batchId: input.batchId ?? null,
        invitedBy: input.invitedBy,
        createdAt: input.now,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      })
      .run();
    tx.insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        actorUserId: input.invitedBy,
        universityId: input.universityId,
        action: "staff.invite",
        target: `staff_invite:${id}`,
        reason: null,
        before: null,
        after: { email, role: input.role, universityId: input.universityId, departmentId },
        createdAt: input.now,
      })
      .run();
  });
  return { _tag: "created", token: input.token };
}

export function readStaffInvite(orm: Orm, token: string, now: Date): PendingInvite | null {
  const row = findByToken(orm, token);
  if (row === null || row.universityId === null) {
    return null;
  }
  const state = inviteLifetimeState(
    { acceptedAt: row.acceptedAt, revokedAt: row.revokedAt, expiresAt: row.expiresAt },
    now,
  );
  if (state !== "pending") {
    return null;
  }
  const role = parseStaffRole(row.role);
  if (role === null) {
    return null;
  }
  const university = orm
    .select({ name: schema.universities.name, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, row.universityId))
    .get();
  if (university === undefined || university.status !== "active") {
    return null;
  }
  return {
    fullName: row.fullName,
    email: row.email,
    role,
    roleLabel: labelStaffRole(role),
    universityName: university.name,
  };
}

export function acceptStaffInvite(
  orm: Orm,
  input: {
    readonly token: string;
    readonly passwordHash: string;
    readonly now: Date;
  },
): { readonly _tag: "accepted"; readonly userId: string } | { readonly _tag: "failed"; readonly reason: AcceptInviteFailure } {
  const row = findByToken(orm, input.token);
  if (row === null || row.universityId === null) {
    return { _tag: "failed", reason: "invalid" };
  }
  const state = inviteLifetimeState(
    { acceptedAt: row.acceptedAt, revokedAt: row.revokedAt, expiresAt: row.expiresAt },
    input.now,
  );
  if (state !== "pending") {
    return { _tag: "failed", reason: "invalid" };
  }
  const role = parseStaffRole(row.role);
  if (role === null) {
    return { _tag: "failed", reason: "invalid" };
  }
  const university = orm
    .select({ status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, row.universityId))
    .get();
  if (university === undefined) {
    return { _tag: "failed", reason: "invalid" };
  }
  if (university.status !== "active") {
    return { _tag: "failed", reason: "suspended" };
  }
  const existingUser = orm
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, row.email))
    .get();
  if (existingUser !== undefined) {
    return { _tag: "failed", reason: "email-taken" };
  }

  const userId = crypto.randomUUID();
  const universityId = row.universityId;
  try {
    orm.transaction((tx) => {
      const claimed = tx
        .update(schema.staffInvites)
        .set({ acceptedAt: input.now })
        .where(
          and(
            eq(schema.staffInvites.id, row.id),
            isNull(schema.staffInvites.acceptedAt),
            isNull(schema.staffInvites.revokedAt),
            gt(schema.staffInvites.expiresAt, input.now),
          ),
        )
        .returning({ id: schema.staffInvites.id })
        .all();
      if (claimed.length !== 1) {
        throw new Error("The invite was already taken.");
      }
      tx.insert(schema.user)
        .values({
          id: userId,
          name: row.fullName,
          email: row.email,
          emailVerified: true,
          image: null,
          createdAt: input.now,
          updatedAt: input.now,
          platformRole: "user",
          role: "user",
          banned: false,
          banReason: null,
          banExpires: null,
        })
        .run();
      tx.insert(schema.account)
        .values({
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: input.passwordHash,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
      tx.insert(schema.member)
        .values({
          id: crypto.randomUUID(),
          organizationId: universityId,
          userId,
          role,
          createdAt: input.now,
        })
        .run();
      tx.insert(schema.auditLog)
        .values({
          id: crypto.randomUUID(),
          actorUserId: userId,
          universityId,
          action: "staff.invite.accept",
          target: `staff_invite:${row.id}`,
          reason: null,
          before: null,
          after: { email: row.email, role, universityId },
          createdAt: input.now,
        })
        .run();
    });
  } catch {
    return { _tag: "failed", reason: "invalid" };
  }
  return { _tag: "accepted", userId };
}

export interface StaffDirectoryEntry {
  readonly name: string;

  readonly email: string;

  readonly role: StaffRole;

  readonly department: string | null;

  readonly status: "active" | "pending";

  readonly banned: boolean;
}

export interface UniversityDepartment {
  readonly id: string;

  readonly name: string;
}

export function listStaffDirectory(
  orm: Orm,
  universityId: string,
  now: Date,
): readonly StaffDirectoryEntry[] {
  const memberRows = orm
    .select({
      name: schema.user.name,
      email: schema.user.email,
      role: schema.member.role,
      banned: schema.user.banned,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, universityId))
    .all();
  const acceptedDepartments = orm
    .select({
      email: schema.staffInvites.email,
      department: schema.departments.name,
      acceptedAt: schema.staffInvites.acceptedAt,
    })
    .from(schema.staffInvites)
    .leftJoin(schema.departments, eq(schema.staffInvites.departmentId, schema.departments.id))
    .where(and(eq(schema.staffInvites.universityId, universityId), isNotNull(schema.staffInvites.acceptedAt)))
    .all();
  const departmentByEmail = new Map<string, { readonly name: string | null; readonly at: number }>();
  for (const row of acceptedDepartments) {
    const at = row.acceptedAt === null ? 0 : row.acceptedAt.getTime();
    const current = departmentByEmail.get(row.email);
    if (current === undefined || at >= current.at) {
      departmentByEmail.set(row.email, { name: row.department, at });
    }
  }
  const active: StaffDirectoryEntry[] = [];
  for (const row of memberRows) {
    const role = parseStaffRole(row.role);
    if (role === null) {
      continue;
    }
    active.push({
      name: row.name,
      email: row.email,
      role,
      department: departmentByEmail.get(row.email)?.name ?? null,
      status: "active",
      banned: row.banned === true,
    });
  }

  const inviteRows = orm
    .select({
      name: schema.staffInvites.fullName,
      email: schema.staffInvites.email,
      role: schema.staffInvites.role,
      department: schema.departments.name,
    })
    .from(schema.staffInvites)
    .leftJoin(schema.departments, eq(schema.staffInvites.departmentId, schema.departments.id))
    .where(
      and(
        eq(schema.staffInvites.universityId, universityId),
        isNull(schema.staffInvites.acceptedAt),
        isNull(schema.staffInvites.revokedAt),
        gt(schema.staffInvites.expiresAt, now),
      ),
    )
    .all();
  const pending: StaffDirectoryEntry[] = [];
  for (const row of inviteRows) {
    const role = parseStaffRole(row.role);
    if (role === null) {
      continue;
    }
    pending.push({
      name: row.name,
      email: row.email,
      role,
      department: row.department,
      status: "pending",
      banned: false,
    });
  }

  const entries = [...active, ...pending];
  entries.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  return entries;
}

export function listUniversityDepartments(orm: Orm, universityId: string): readonly UniversityDepartment[] {
  return orm
    .select({ id: schema.departments.id, name: schema.departments.name })
    .from(schema.departments)
    .innerJoin(schema.faculties, eq(schema.departments.facultyId, schema.faculties.id))
    .where(eq(schema.faculties.universityId, universityId))
    .all()
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function previewStaffImport(
  orm: Orm,
  input: { readonly csv: string; readonly universityId: string; readonly now: Date },
):
  | { readonly _tag: "ready"; readonly rows: readonly StaffCsvRow[]; readonly inviteCount: number; readonly skipCount: number }
  | { readonly _tag: "rejected"; readonly message: string } {
  const university = orm
    .select({ status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, input.universityId))
    .get();
  if (university === undefined) {
    return { _tag: "rejected", message: "That university is not supported." };
  }
  if (university.status !== "active") {
    return { _tag: "rejected", message: "This university is suspended." };
  }
  return previewStaffCsv(input.csv, departmentNames(orm, input.universityId), takenEmails(orm, input.now));
}

export interface ImportedStaffRow extends StaffCsvRow {
  readonly token: string | null;
}

export function commitStaffImport(
  orm: Orm,
  input: {
    readonly csv: string;
    readonly universityId: string;
    readonly invitedBy: string;
    readonly now: Date;
    readonly mintToken: () => string;
  },
):
  | { readonly _tag: "rejected"; readonly message: string }
  | { readonly _tag: "empty" }
  | { readonly _tag: "imported"; readonly batchId: string; readonly rows: readonly ImportedStaffRow[] } {
  const preview = previewStaffImport(orm, input);
  if (preview._tag === "rejected") {
    return preview;
  }
  if (preview.inviteCount === 0) {
    return { _tag: "empty" };
  }
  const departments = uniqueDepartmentIds(listUniversityDepartments(orm, input.universityId));
  const batchId = crypto.randomUUID();
  const written: ImportedStaffRow[] = [];
  orm.transaction((tx) => {
    let invited = 0;
    for (const row of preview.rows) {
      if (row.result !== "invite" || row.role === null) {
        written.push({ ...row, token: null });
        continue;
      }
      const email = row.email;
      const existingUser = tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).get();
      const pending = tx
        .select({ id: schema.staffInvites.id })
        .from(schema.staffInvites)
        .where(
          and(
            eq(schema.staffInvites.email, email),
            isNull(schema.staffInvites.acceptedAt),
            isNull(schema.staffInvites.revokedAt),
            gt(schema.staffInvites.expiresAt, input.now),
          ),
        )
        .get();
      if (existingUser !== undefined || pending !== undefined) {
        written.push({
          ...row,
          role: null,
          result: "skip",
          reason: "An account or a pending invite already uses this email.",
          token: null,
        });
        continue;
      }
      const departmentId = row.departmentName.length === 0 ? null : departments.get(row.departmentName.toLowerCase());
      if (departmentId === undefined) {
        written.push({
          ...row,
          role: null,
          result: "skip",
          reason: "That department is not part of this university.",
          token: null,
        });
        continue;
      }
      const token = input.mintToken();
      const id = crypto.randomUUID();
      tx.insert(schema.staffInvites)
        .values({
          id,
          tokenHash: hashInviteToken(token),
          email,
          fullName: row.fullName,
          role: row.role,
          universityId: input.universityId,
          departmentId,
          employeeId: row.employeeId.length === 0 ? null : row.employeeId,
          batchId,
          invitedBy: input.invitedBy,
          createdAt: input.now,
          expiresAt: inviteExpiresAt(input.now),
          acceptedAt: null,
          revokedAt: null,
        })
        .run();
      invited += 1;
      written.push({ ...row, token });
    }
    tx.insert(schema.auditLog)
      .values({
        id: crypto.randomUUID(),
        actorUserId: input.invitedBy,
        universityId: input.universityId,
        action: "staff.import",
        target: `staff_import:${batchId}`,
        reason: null,
        before: null,
        after: { batchId, invited, skipped: written.length - invited, universityId: input.universityId },
        createdAt: input.now,
      })
      .run();
  });
  return { _tag: "imported", batchId, rows: written };
}

function uniqueDepartmentIds(
  departments: readonly { readonly id: string; readonly name: string }[],
): Map<string, string> {
  const counts = new Map<string, number>();
  const ids = new Map<string, string>();
  for (const department of departments) {
    const key = department.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    ids.set(key, department.id);
  }
  const unique = new Map<string, string>();
  for (const [key, count] of counts) {
    const id = ids.get(key);
    if (count === 1 && id !== undefined) {
      unique.set(key, id);
    }
  }
  return unique;
}

function departmentNames(orm: Orm, universityId: string): string[] {
  return listUniversityDepartments(orm, universityId).map((department) => department.name);
}

function takenEmails(orm: Orm, now: Date): string[] {
  const accounts = orm.select({ email: schema.user.email }).from(schema.user).all();
  const pending = orm
    .select({ email: schema.staffInvites.email })
    .from(schema.staffInvites)
    .where(
      and(isNull(schema.staffInvites.acceptedAt), isNull(schema.staffInvites.revokedAt), gt(schema.staffInvites.expiresAt, now)),
    )
    .all();
  return [...accounts.map((row) => row.email), ...pending.map((row) => row.email)];
}

function findByToken(orm: Orm, token: string) {
  return (
    orm
      .select()
      .from(schema.staffInvites)
      .where(eq(schema.staffInvites.tokenHash, hashInviteToken(token)))
      .get() ?? null
  );
}
