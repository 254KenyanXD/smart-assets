import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, ManagedRuntime } from "effect";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { FoundQueue } from "@/app/desk/found-queue";
import { listFoundReports } from "@/lib/found-store";
import { layer as custodyLayer, Service as Custody, type Actor } from "@/services/custody";

const daystar = "uni_daystar";
const strathmore = "uni_strathmore";
const borrowerEmail = "student.found@daystar.ac.ke";
const finderEmail = "finder.found@daystar.ac.ke";
const attendantEmail = "attendant.found@daystar.ac.ke";

function memoryDatabase(): Database {
  const database = openDatabase(":memory:");
  applyMigrations(database);
  seed(database);
  return database;
}

function ormOf(database: Database) {
  return drizzle(database, { schema });
}

async function run<A, E>(database: Database, effect: Effect.Effect<A, E, Custody>): Promise<A> {
  const runtime = ManagedRuntime.make(custodyLayer(database));
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

function insertUser(
  database: Database,
  input: { readonly id: string; readonly email: string; readonly name: string },
): void {
  const now = new Date();
  ormOf(database)
    .insert(schema.user)
    .values({
      id: input.id,
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
}

function insertMember(database: Database, id: string, organizationId: string, userId: string, role: string): void {
  ormOf(database)
    .insert(schema.member)
    .values({ id, organizationId, userId, role, createdAt: new Date() })
    .run();
}

function actor(userId: string, universityId: string): Actor {
  return { userId, platformRole: "user", universityId };
}

function plantPeople(database: Database): void {
  insertUser(database, { id: "user_admin", email: "admin.found@daystar.ac.ke", name: "Found Administrator" });
  insertUser(database, { id: "user_attendant", email: attendantEmail, name: "Found Attendant" });
  insertUser(database, { id: "user_student", email: borrowerEmail, name: "Found Borrower" });
  insertUser(database, { id: "user_finder", email: finderEmail, name: "Found Reporter" });
  insertUser(database, { id: "user_strath", email: "admin.found@strathmore.edu", name: "Found Strathmore" });
  insertMember(database, "mem_admin", daystar, "user_admin", "school_admin");
  insertMember(database, "mem_attendant", daystar, "user_attendant", "attendant");
  insertMember(database, "mem_student", daystar, "user_student", "student");
  insertMember(database, "mem_finder", daystar, "user_finder", "student");
  insertMember(database, "mem_strath", strathmore, "user_strath", "school_admin");
  ormOf(database)
    .insert(schema.locations)
    .values({
      id: "loc_counter",
      universityId: daystar,
      departmentId: null,
      name: "Review counter",
      kind: "counter",
    })
    .run();
}

const purchasedOn = new Date("2024-01-15T00:00:00.000Z");

function register(database: Database, tag: string) {
  return run(
    database,
    Effect.gen(function* () {
      const custody = yield* Custody;
      return yield* custody.register({
        actor: actor("user_admin", daystar),
        tag,
        title: "Lab cable",
        cost: 100000,
        salvage: 10000,
        usefulLifeYears: 5,
        purchasedOn,
        locationId: "loc_counter",
      });
    }),
  );
}

describe("found queue", () => {
  test("lists a reported tag for one university without the reporter or the borrower", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const asset = await register(database, "TAG-FOUND-1");

    const receipt = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.reportFound({
          actor: actor("user_finder", daystar),
          tag: "TAG-FOUND-1",
          note: "Left at the counter",
        });
      }),
    );
    expect(receipt.assetTag).toBe("TAG-FOUND-1");

    const rows = listFoundReports(ormOf(database), daystar);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (row === undefined) {
      return;
    }
    expect(row.assetTitle).toBe("Lab cable");
    expect(row.assetTag).toBe("TAG-FOUND-1");
    expect(row.locationName).toBe("Review counter");
    expect(row.note).toBe("Left at the counter");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(Object.keys(row).sort()).toEqual(["assetTag", "assetTitle", "createdAt", "id", "locationName", "note"]);

    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain(borrowerEmail);
    expect(serialised).not.toContain(finderEmail);
    expect(serialised).not.toContain(attendantEmail);
    expect(serialised).not.toContain("user_finder");
    expect(serialised).not.toContain("user_student");

    expect(listFoundReports(ormOf(database), strathmore)).toEqual([]);

    await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.recordMove({
          actor: actor("user_admin", daystar),
          assetId: asset.id,
          to: "available",
        });
      }),
    );
    await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkout({
          actor: actor("user_attendant", daystar),
          tag: "TAG-FOUND-1",
          borrowerUserId: "user_student",
          dueAt: null,
        });
      }),
    );

    const onLoan = listFoundReports(ormOf(database), daystar);
    expect(onLoan).toHaveLength(1);
    expect(onLoan[0]?.assetTag).toBe("TAG-FOUND-1");
    const serialisedOnLoan = JSON.stringify(onLoan);
    expect(serialisedOnLoan).not.toContain(borrowerEmail);
    expect(serialisedOnLoan).not.toContain(finderEmail);
    expect(serialisedOnLoan).not.toContain("user_student");
  });

  test("reads a blank note as no note and holds an asset without a location", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.register({
          actor: actor("user_admin", daystar),
          tag: "TAG-FOUND-2",
          title: "Loose cable",
          cost: 1000,
          salvage: 0,
          usefulLifeYears: 2,
          purchasedOn,
          locationId: null,
        });
      }),
    );
    await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.reportFound({
          actor: actor("user_finder", daystar),
          tag: "TAG-FOUND-2",
          note: "   ",
        });
      }),
    );

    const rows = listFoundReports(ormOf(database), daystar);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBeNull();
    expect(rows[0]?.locationName).toBeNull();
    expect(rows[0]?.assetTitle).toBe("Loose cable");
  });

  test("the desk list names the item and hides an empty queue behind the search sentence", () => {
    const filled = renderToStaticMarkup(
      createElement(FoundQueue, {
        rows: [
          {
            id: "found_1",
            assetTag: "TAG-FOUND-1",
            assetTitle: "Lab cable",
            locationName: null,
            note: "Left at the counter",
            createdAt: new Date("2026-11-16T08:05:00.000Z"),
          },
        ],
      }),
    );
    expect(filled).toContain("Found tags");
    expect(filled).toContain("Lab cable");
    expect(filled).toContain("TAG-FOUND-1");
    expect(filled).toContain("No location");
    expect(filled).toContain("Left at the counter");
    expect(filled).toContain("2026-11-16 08:05");
    expect(filled).not.toContain("student.found@");

    const missed = renderToStaticMarkup(
      createElement(FoundQueue, { rows: [], emptyLabel: "No found tags match that search." }),
    );
    expect(missed).toContain("No found tags match that search.");
    expect(missed).not.toContain("Lab cable");
  });
});
