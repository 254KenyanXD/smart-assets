import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { listAudit } from "@/lib/audit-store";

function memoryDatabase(): Database {
  const database = openDatabase(":memory:");
  applyMigrations(database);
  seed(database);
  return database;
}

describe("audit trail", () => {
  test("a university sees its own rows and not another university or a platform row", () => {
    const database = memoryDatabase();
    const orm = drizzle(database, { schema });
    const now = new Date("2026-11-10T09:05:00.000Z");
    orm
      .insert(schema.user)
      .values({
        id: "user_admin",
        name: "Review Administrator",
        email: "admin.audit@daystar.ac.ke",
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
      .insert(schema.auditLog)
      .values([
        {
          id: "audit_daystar",
          actorUserId: "user_admin",
          universityId: "uni_daystar",
          action: "asset.move",
          target: "asset_1",
          reason: null,
          before: { state: "procured" },
          after: { state: "available" },
          createdAt: now,
        },
        {
          id: "audit_strath",
          actorUserId: "user_admin",
          universityId: "uni_strathmore",
          action: "asset.register",
          target: "asset_other",
          reason: null,
          before: null,
          after: { tag: "TAG-STRATH-ONLY" },
          createdAt: new Date("2026-11-10T10:00:00.000Z"),
        },
        {
          id: "audit_platform",
          actorUserId: null,
          universityId: null,
          action: "platform.note",
          target: "platform",
          reason: null,
          before: null,
          after: null,
          createdAt: now,
        },
      ])
      .run();

    const rows = listAudit(orm, "uni_daystar");
    expect(rows.map((row) => row.action)).toEqual(["asset.move"]);
    expect(rows[0]?.actorName).toBe("Review Administrator");
    expect(rows[0]?.at).toBe("2026-11-10 09:05");
    expect(rows[0]?.detail).toBe('{"state":"procured"} -> {"state":"available"}');
    expect(JSON.stringify(rows)).not.toContain("TAG-STRATH-ONLY");
    expect(JSON.stringify(rows)).not.toContain("platform.note");
    expect(listAudit(orm, "uni_strathmore").map((row) => row.target)).toEqual(["asset_other"]);
    expect(listAudit(orm, "uni_uonbi")).toEqual([]);
  });
});
