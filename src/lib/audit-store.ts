import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface AuditEntry {
  readonly id: string;

  readonly at: string;

  readonly action: string;

  readonly actorName: string;

  readonly target: string;

  readonly detail: string;
}

export function listAudit(orm: Orm, universityId: string): AuditEntry[] {
  const stored = orm
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      target: schema.auditLog.target,
      reason: schema.auditLog.reason,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      createdAt: schema.auditLog.createdAt,
      actorName: schema.user.name,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.auditLog.actorUserId, schema.user.id))
    .where(eq(schema.auditLog.universityId, universityId))
    .orderBy(desc(schema.auditLog.createdAt))
    .all();
  return stored.map((row) => ({
    id: row.id,
    at: utcMinute(row.createdAt),
    action: row.action,
    actorName: row.actorName ?? "",
    target: row.target,
    detail: detail(row.reason, row.before, row.after),
  }));
}

function detail(reason: string | null, before: unknown, after: unknown): string {
  if (reason !== null && reason.length > 0) {
    return reason;
  }
  if (before !== null && before !== undefined && after !== null && after !== undefined) {
    return `${JSON.stringify(before)} -> ${JSON.stringify(after)}`;
  }
  if (after !== null && after !== undefined) {
    return JSON.stringify(after);
  }
  if (before !== null && before !== undefined) {
    return JSON.stringify(before);
  }
  return "";
}

function utcMinute(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day} ${hour}:${minute}`;
}
