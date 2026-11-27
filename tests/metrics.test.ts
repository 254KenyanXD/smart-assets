import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { loadSchoolMetrics } from "@/lib/metrics-store";

const daystar = "uni_daystar";
const strathmore = "uni_strathmore";

function memoryDatabase(): Database {
  const database = openDatabase(":memory:");
  applyMigrations(database);
  seed(database);
  return database;
}

function ormOf(database: Database) {
  return drizzle(database, { schema });
}

function addUser(database: Database, id: string, email: string): void {
  const now = new Date();
  ormOf(database)
    .insert(schema.user)
    .values({
      id,
      name: "Metric Person",
      email,
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
}

function addAsset(
  database: Database,
  input: {
    readonly id: string;
    readonly universityId: string;
    readonly state: string;
    readonly category?: string;
    readonly cost: number;
    readonly salvage?: number;
    readonly usefulLifeYears?: number;
    readonly purchasedOn: Date;
  },
): void {
  const now = new Date("2026-11-26T10:00:00Z");
  ormOf(database)
    .insert(schema.assets)
    .values({
      id: input.id,
      universityId: input.universityId,
      locationId: null,
      tag: `TAG-${input.id}`,
      title: `Asset ${input.id}`,
      category: input.category ?? "Uncategorised",
      state: input.state,
      cost: input.cost,
      salvage: input.salvage ?? 0,
      usefulLifeYears: input.usefulLifeYears ?? 5,
      purchasedOn: input.purchasedOn,
      lastCondition: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function addLoan(
  database: Database,
  input: {
    readonly id: string;
    readonly universityId: string;
    readonly assetId: string;
    readonly borrowerUserId: string;
    readonly checkedOutAt: Date;
    readonly checkedInAt: Date | null;
    readonly dueAt: Date | null;
    readonly conditionOnReturn: string | null;
  },
): void {
  ormOf(database)
    .insert(schema.custody)
    .values({
      id: input.id,
      universityId: input.universityId,
      assetId: input.assetId,
      borrowerUserId: input.borrowerUserId,
      attendantUserId: input.borrowerUserId,
      checkedOutAt: input.checkedOutAt,
      checkedInAt: input.checkedInAt,
      dueAt: input.dueAt,
      conditionOnReturn: input.conditionOnReturn,
    })
    .run();
}

describe("school metrics", () => {
  test("counts the operations board from the stored rows", () => {
    const database = memoryDatabase();
    addUser(database, "borrower", "borrower.metrics@daystar.ac.ke");
    addAsset(database, {
      id: "a1",
      universityId: daystar,
      state: "available",
      category: "Laptop",
      cost: 100_000,
      purchasedOn: new Date("2024-01-15T00:00:00Z"),
    });
    addAsset(database, {
      id: "a2",
      universityId: daystar,
      state: "in_custody",
      category: "Projector",
      cost: 50_000,
      purchasedOn: new Date("2024-01-15T00:00:00Z"),
    });
    addAsset(database, {
      id: "a3",
      universityId: daystar,
      state: "under_maintenance",
      category: "Calculator",
      cost: 10_000,
      purchasedOn: new Date("2024-01-15T00:00:00Z"),
    });
    addAsset(database, {
      id: "a4",
      universityId: daystar,
      state: "decommissioned",
      category: "Laptop",
      cost: 20_000,
      usefulLifeYears: 3,
      purchasedOn: new Date("2015-01-15T00:00:00Z"),
    });
    addAsset(database, {
      id: "s1",
      universityId: strathmore,
      state: "available",
      category: "Laptop",
      cost: 999_000,
      purchasedOn: new Date("2024-01-15T00:00:00Z"),
    });
    const now = new Date("2026-11-26T19:40:00Z");
    addLoan(database, {
      id: "l1",
      universityId: daystar,
      assetId: "a2",
      borrowerUserId: "borrower",
      checkedOutAt: new Date("2026-11-25T09:00:00Z"),
      checkedInAt: null,
      dueAt: new Date("2026-11-20T09:00:00Z"),
      conditionOnReturn: null,
    });
    addLoan(database, {
      id: "l2",
      universityId: daystar,
      assetId: "a1",
      borrowerUserId: "borrower",
      checkedOutAt: new Date("2026-11-26T08:00:00Z"),
      checkedInAt: new Date("2026-11-26T12:00:00Z"),
      dueAt: null,
      conditionOnReturn: "good",
    });
    addLoan(database, {
      id: "l3",
      universityId: daystar,
      assetId: "a3",
      borrowerUserId: "borrower",
      checkedOutAt: new Date("2026-11-24T08:00:00Z"),
      checkedInAt: new Date("2026-11-24T15:00:00Z"),
      dueAt: null,
      conditionOnReturn: "damaged",
    });
    addLoan(database, {
      id: "l4",
      universityId: daystar,
      assetId: "a1",
      borrowerUserId: "borrower",
      checkedOutAt: new Date("2025-03-01T08:00:00Z"),
      checkedInAt: new Date("2025-03-02T08:00:00Z"),
      dueAt: null,
      conditionOnReturn: "good",
    });
    addLoan(database, {
      id: "l5",
      universityId: strathmore,
      assetId: "s1",
      borrowerUserId: "borrower",
      checkedOutAt: new Date("2026-11-25T09:00:00Z"),
      checkedInAt: null,
      dueAt: null,
      conditionOnReturn: null,
    });

    const metrics = loadSchoolMetrics(ormOf(database), daystar, now);

    expect(metrics.assets.registered).toBe(4);
    expect(metrics.assets.serviceable).toBe(2);
    expect(metrics.assets.available).toBe(1);
    expect(metrics.assets.onLoan).toBe(1);
    expect(metrics.assets.maintenance).toBe(1);
    expect(metrics.assets.decommissioned).toBe(1);
    expect(metrics.assets.utilisation).toBe(50);
    expect(metrics.custody.open).toBe(1);
    expect(metrics.custody.overdue).toBe(1);
    expect(metrics.custody.oldestOverdueDays).toBe(6);
    expect(metrics.custody.returnsToday).toBe(1);
    expect(metrics.custody.checkoutsToday).toBe(1);
    expect(metrics.conditions).toEqual({ good: 1, wear: 0, damaged: 1 });
    expect(metrics.categories.map((row) => [row.category, row.loans, row.share])).toEqual([
      ["Calculator", 1, 33],
      ["Laptop", 1, 33],
      ["Projector", 1, 33],
    ]);
    expect(metrics.finance.cost).toBe(180_000);
    expect(metrics.finance.pastLife).toBe(1);
    expect(metrics.finance.bookValue).toBe(60_000 + 30_000 + 6_000 - 53_326);
    expect(metrics.finance.accumulated).toBe(40_000 + 20_000 + 4_000 + 73_326);
  });

  test("an empty university reads as zero instead of failing", () => {
    const database = memoryDatabase();
    const metrics = loadSchoolMetrics(ormOf(database), daystar, new Date("2026-11-26T19:40:00Z"));
    expect(metrics.assets.registered).toBe(0);
    expect(metrics.assets.utilisation).toBe(0);
    expect(metrics.categories).toEqual([]);
    expect(metrics.locations).toEqual([]);
    expect(metrics.found.total).toBe(0);
  });
});
