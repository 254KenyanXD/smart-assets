import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, ManagedRuntime } from "effect";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { straightLine, completedYears } from "@/domain/depreciation";
import { listAssets, listLocations, listOpenCustody, listStudentCustody } from "@/lib/asset-store";
import { layer as custodyLayer, Service as Custody, type Actor } from "@/services/custody";

const daystar = "uni_daystar";
const strathmore = "uni_strathmore";
const borrowerEmail = "student.custody@daystar.ac.ke";

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
  input: { readonly id: string; readonly email: string; readonly name: string; readonly platformRole?: string },
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
      platformRole: input.platformRole ?? "user",
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

function actor(userId: string, universityId: string, platformRole = "user"): Actor {
  return { userId, platformRole, universityId };
}

function plantPeople(database: Database): void {
  insertUser(database, { id: "user_admin", email: "admin.custody@daystar.ac.ke", name: "Review Administrator" });
  insertUser(database, { id: "user_attendant", email: "attendant.custody@daystar.ac.ke", name: "Review Attendant" });
  insertUser(database, { id: "user_student", email: borrowerEmail, name: "Review Student" });
  insertUser(database, { id: "user_head", email: "head.custody@daystar.ac.ke", name: "Review Head" });
  insertUser(database, { id: "user_strath", email: "admin.custody@strathmore.edu", name: "Review Strathmore" });
  insertUser(database, { id: "user_finder", email: "finder.custody@daystar.ac.ke", name: "Review Finder" });
  insertUser(database, {
    id: "user_platform",
    email: "platform.custody@daystar.ac.ke",
    name: "Review Platform",
    platformRole: "super_admin",
  });
  insertMember(database, "mem_admin", daystar, "user_admin", "school_admin");
  insertMember(database, "mem_attendant", daystar, "user_attendant", "attendant");
  insertMember(database, "mem_student", daystar, "user_student", "student");
  insertMember(database, "mem_head", daystar, "user_head", "dept_head");
  insertMember(database, "mem_strath", strathmore, "user_strath", "school_admin");
  insertMember(database, "mem_finder", daystar, "user_finder", "student");
  ormOf(database)
    .insert(schema.studentProfiles)
    .values({
      id: "profile_student",
      userId: "user_student",
      universityId: daystar,
      officialId: "23-0101",
      fullName: "Review Student",
      programme: null,
      campus: null,
      school: null,
      standing: null,
      email: borrowerEmail,
      photoUrl: null,
      source: "local",
      firstVerifiedAt: new Date(),
      lastVerifiedAt: new Date(),
    })
    .run();
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

function register(database: Database, input: { readonly universityId?: string; readonly userId?: string; readonly tag?: string }) {
  const universityId = input.universityId ?? daystar;
  const userId = input.userId ?? "user_admin";
  return run(
    database,
    Effect.gen(function* () {
      const custody = yield* Custody;
      return yield* custody.register({
        actor: actor(userId, universityId, userId === "user_platform" ? "super_admin" : "user"),
        tag: input.tag ?? "TAG-1001",
        title: "Lab cable",
        cost: 100000,
        salvage: 10000,
        usefulLifeYears: 5,
        purchasedOn,
        locationId: universityId === daystar ? "loc_counter" : null,
      });
    }),
  );
}

describe("straight-line depreciation", () => {
  test("uses the written formula and drops the remainder", () => {
    const known = straightLine({ cost: 100000, salvage: 10000, usefulLifeYears: 5, ageYears: 2 });
    expect(known._tag).toBe("ok");
    if (known._tag === "ok") {
      expect(known.value.annualCharge).toBe(18000);
      expect(known.value.bookValue).toBe(64000);
    }
    const remainder = straightLine({ cost: 10, salvage: 0, usefulLifeYears: 3, ageYears: 1 });
    expect(remainder._tag).toBe("ok");
    if (remainder._tag === "ok") {
      expect(remainder.value.annualCharge).toBe(3);
      expect(remainder.value.bookValue).toBe(7);
    }
    expect(completedYears(new Date("2020-06-15T00:00:00.000Z"), new Date("2022-06-14T00:00:00.000Z"))).toBe(1);
    expect(completedYears(new Date("2020-06-15T00:00:00.000Z"), new Date("2022-06-15T00:00:00.000Z"))).toBe(2);
  });
});

describe("custody", () => {
  test("registers, isolates tags, checks out, rejects an illegal move, and checks in", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const daystarAsset = await register(database, {});
    expect(daystarAsset.state).toBe("procured");
    const other = await register(database, { universityId: strathmore, userId: "user_strath", tag: "TAG-1001" });
    expect(other.tag).toBe("TAG-1001");

    const duplicate = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.register({
            actor: actor("user_admin", daystar),
            tag: "TAG-1001",
            title: "Lab cable",
            cost: 100000,
            salvage: 10000,
            usefulLifeYears: 5,
            purchasedOn,
          });
        }),
      ),
    );
    expect(duplicate._tag).toBe("Failure");
    if (duplicate._tag === "Failure") {
      expect(duplicate.failure._tag).toBe("DuplicateTag");
    }

    const released = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.recordMove({
          actor: actor("user_admin", daystar),
          assetId: daystarAsset.id,
          to: "available",
        });
      }),
    );
    expect(released.state).toBe("available");

    const staffBorrower = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.checkout({
            actor: actor("user_attendant", daystar),
            tag: "TAG-1001",
            borrowerUserId: "user_admin",
            dueAt: null,
          });
        }),
      ),
    );
    expect(staffBorrower._tag).toBe("Failure");
    if (staffBorrower._tag === "Failure") {
      expect(staffBorrower.failure._tag).toBe("NotAStudent");
    }

    const adminCheckout = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.checkout({
            actor: actor("user_admin", daystar),
            tag: "TAG-1001",
            borrowerUserId: "user_student",
            dueAt: null,
          });
        }),
      ),
    );
    expect(adminCheckout._tag).toBe("Failure");
    if (adminCheckout._tag === "Failure") {
      expect(adminCheckout.failure._tag).toBe("NotAllowed");
    }

    const foreign = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.checkout({
            actor: actor("user_attendant", daystar),
            tag: "TAG-STRATH",
            borrowerUserId: "user_student",
            dueAt: null,
          });
        }),
      ),
    );
    expect(foreign._tag).toBe("Failure");
    if (foreign._tag === "Failure") {
      expect(foreign.failure._tag).toBe("UnknownAsset");
    }
    await register(database, { universityId: strathmore, userId: "user_strath", tag: "TAG-STRATH" });

    const loan = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkout({
          actor: actor("user_attendant", daystar),
          tag: "TAG-1001",
          borrowerUserId: "user_student",
          dueAt: null,
        });
      }),
    );
    expect(loan.state).toBe("in_custody");

    const receipt = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.reportFound({
          actor: actor("user_finder", daystar),
          tag: "TAG-1001",
          note: "Left at the counter",
        });
      }),
    );
    expect(JSON.stringify(receipt)).not.toContain(borrowerEmail);
    expect(JSON.stringify(receipt)).not.toContain("user_student");
    expect(receipt).toEqual({
      assetTag: "TAG-1001",
      assetTitle: "Lab cable",
      locationName: "Review counter",
    });
    const foundAudit = ormOf(database)
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "asset.found"))
      .all();
    expect(JSON.stringify(foundAudit)).not.toContain(borrowerEmail);

    const illegal = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.recordMove({
            actor: actor("user_admin", daystar),
            assetId: daystarAsset.id,
            to: "decommissioned",
          });
        }),
      ),
    );
    expect(illegal._tag).toBe("Failure");
    if (illegal._tag === "Failure") {
      expect(illegal.failure._tag).toBe("IllegalMove");
    }
    const stillOut = ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, daystarAsset.id)).get();
    expect(stillOut?.state).toBe("in_custody");
    const rejected = ormOf(database)
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "asset.move.rejected"))
      .all();
    expect(rejected.length).toBeGreaterThan(0);

    const returned = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkIn({
          actor: actor("user_attendant", daystar),
          assetId: daystarAsset.id,
          condition: "wear",
        });
      }),
    );
    expect(returned.state).toBe("available");
    const back = ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, daystarAsset.id)).get();
    expect(back?.lastCondition).toBe("wear");
    const closed = ormOf(database).select().from(schema.custody).where(eq(schema.custody.id, loan.custodyId)).get();
    expect(closed?.conditionOnReturn).toBe("wear");
    expect(closed?.checkedInAt).not.toBeNull();

    const listed = listAssets(ormOf(database), daystar, new Date("2026-01-15T00:00:00.000Z"));
    const cable = listed.find((row) => row.id === daystarAsset.id);
    expect(cable?.bookValue).toBe(64000);
    expect(cable?.conditionLabel).toBe("Minor wear");
    const home = listStudentCustody(ormOf(database), daystar, "user_student", new Date("2026-11-10T00:00:00.000Z"));
    expect(home.onLoan).toBe(0);
    expect(home.returnedOnTime).toBe(1);
    expect(listOpenCustody(ormOf(database), strathmore)).toEqual([]);
  });

  test("rolls a checkout back when the audit insert fails", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const asset = await register(database, { tag: "TAG-2002" });
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
    database.exec(`
      CREATE TRIGGER custody_audit_fail BEFORE INSERT ON audit_log
      WHEN NEW.action = 'asset.move'
      BEGIN
        SELECT RAISE(ROLLBACK, 'audit failed');
      END;
    `);
    let failed = false;
    try {
      await run(
        database,
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.checkout({
            actor: actor("user_attendant", daystar),
            tag: "TAG-2002",
            borrowerUserId: "user_student",
            dueAt: null,
          });
        }),
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    const row = ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, asset.id)).get();
    expect(row?.state).toBe("available");
    expect(ormOf(database).select().from(schema.custody).all()).toEqual([]);
    const moves = ormOf(database)
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "asset.move"))
      .all();
    expect(moves.length).toBe(1);
    expect(JSON.stringify(moves)).not.toContain("in_custody");

    database.exec("DROP TRIGGER custody_audit_fail");
    const loan = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.checkout({
          actor: actor("user_attendant", daystar),
          tag: "TAG-2002",
          borrowerUserId: "user_student",
          dueAt: null,
        });
      }),
    );
    expect(loan.state).toBe("in_custody");
    const after = ormOf(database).select().from(schema.auditLog).where(eq(schema.auditLog.action, "asset.move")).all();
    expect(after.length).toBe(2);
    expect(JSON.stringify(after)).toContain("in_custody");
    expect(ormOf(database).select().from(schema.custody).all().length).toBe(1);
    const open = listOpenCustody(ormOf(database), daystar);
    expect(open[0]?.officialId).toBe("23-0101");
    expect(open[0]?.borrowerName).toBe("Review Student");
  });

  test("a suspended university cannot register an asset", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    ormOf(database).update(schema.universities).set({ status: "suspended" }).where(eq(schema.universities.id, daystar)).run();
    const result = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.register({
            actor: actor("user_admin", daystar),
            tag: "TAG-3003",
            title: "Lab cable",
            cost: 1000,
            salvage: 0,
            usefulLifeYears: 2,
            purchasedOn,
          });
        }),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("SuspendedUniversity");
    }
    expect(ormOf(database).select().from(schema.assets).all()).toEqual([]);
  });

  test("a school administrator can add a lab and point an asset at it", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const orm = ormOf(database);
    orm.insert(schema.faculties).values({ id: "fac_review", universityId: daystar, name: "Review Faculty", code: "RF" }).run();
    orm
      .insert(schema.departments)
      .values({ id: "dept_review", facultyId: "fac_review", name: "Review Department", code: "RD" })
      .run();
    orm
      .insert(schema.faculties)
      .values({ id: "fac_strath", universityId: strathmore, name: "Review Strathmore Faculty", code: "SF" })
      .run();
    orm
      .insert(schema.departments)
      .values({ id: "dept_strath", facultyId: "fac_strath", name: "Review Strathmore Department", code: "SD" })
      .run();

    const before = listLocations(orm, daystar);
    expect(before.map((row) => row.name)).toEqual(["Review counter"]);
    expect(before[0]?.kind).toBe("counter");
    expect(before[0]?.departmentName).toBeNull();

    const lab = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.createLocation({
          actor: actor("user_admin", daystar),
          name: "  Review lab  ",
          kind: "lab",
          departmentId: "dept_review",
        });
      }),
    );
    expect(lab.kind).toBe("lab");
    expect(lab.name).toBe("Review lab");

    const desk = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.createLocation({
          actor: actor("user_admin", daystar),
          name: "Review desk",
          kind: "desk",
          departmentId: null,
        });
      }),
    );
    expect(desk.kind).toBe("desk");

    const audits = orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "location.create")).all();
    expect(audits).toHaveLength(2);
    const labAudit = audits.find((row) => row.target === lab.id);
    expect(labAudit?.actorUserId).toBe("user_admin");
    expect(labAudit?.universityId).toBe(daystar);
    expect(labAudit?.reason).toBeNull();
    expect(labAudit?.before).toBeNull();
    expect(labAudit?.after).toEqual({ name: "Review lab", kind: "lab", departmentId: "dept_review" });

    const listed = listLocations(orm, daystar);
    expect(listed.map((row) => [row.name, row.kind, row.departmentName])).toEqual([
      ["Review counter", "counter", null],
      ["Review desk", "desk", null],
      ["Review lab", "lab", "Review Department"],
    ]);

    const asset = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.register({
          actor: actor("user_admin", daystar),
          tag: "TAG-LAB",
          title: "Review cable",
          cost: 1000,
          salvage: 0,
          usefulLifeYears: 2,
          purchasedOn,
          locationId: lab.id,
        });
      }),
    );
    const rows = listAssets(orm, daystar, new Date("2026-01-15T00:00:00.000Z"));
    expect(rows.find((row) => row.id === asset.id)?.locationName).toBe("Review lab");

    const daystarCount = () => orm.select().from(schema.locations).where(eq(schema.locations.universityId, daystar)).all().length;
    expect(daystarCount()).toBe(3);
    for (const userId of ["user_head", "user_attendant", "user_student"] as const) {
      const refused = await run(
        database,
        Effect.result(
          Effect.gen(function* () {
            const custody = yield* Custody;
            return yield* custody.createLocation({
              actor: actor(userId, daystar),
              name: "Should not land",
              kind: "library",
              departmentId: null,
            });
          }),
        ),
      );
      expect(refused._tag).toBe("Failure");
      if (refused._tag === "Failure") {
        expect(refused.failure._tag).toBe("NotAllowed");
        expect(refused.failure.message).toBe("You cannot record that change.");
      }
    }
    expect(daystarCount()).toBe(3);
    expect(orm.select().from(schema.auditLog).where(eq(schema.auditLog.action, "location.create")).all()).toHaveLength(2);

    const foreignDepartment = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.createLocation({
            actor: actor("user_admin", daystar),
            name: "Review library",
            kind: "library",
            departmentId: "dept_strath",
          });
        }),
      ),
    );
    expect(foreignDepartment._tag).toBe("Failure");
    if (foreignDepartment._tag === "Failure") {
      expect(foreignDepartment.failure._tag).toBe("InvalidAsset");
      expect(foreignDepartment.failure.message).toBe("That department is not part of this university.");
    }
    expect(daystarCount()).toBe(3);

    const foreignLocation = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.createLocation({
          actor: actor("user_strath", strathmore),
          name: "Review counter",
          kind: "library",
          departmentId: null,
        });
      }),
    );
    const wrongDoor = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.register({
            actor: actor("user_admin", daystar),
            tag: "TAG-FOREIGN",
            title: "Review cable",
            cost: 1000,
            salvage: 0,
            usefulLifeYears: 2,
            purchasedOn,
            locationId: foreignLocation.id,
          });
        }),
      ),
    );
    expect(wrongDoor._tag).toBe("Failure");
    if (wrongDoor._tag === "Failure") {
      expect(wrongDoor.failure.message).toBe("That location is not part of this university.");
    }
    expect(orm.select().from(schema.assets).where(eq(schema.assets.tag, "TAG-FOREIGN")).all()).toEqual([]);

    for (const input of [
      { name: "   ", kind: "lab", message: "The location name is required." },
      { name: "x".repeat(81), kind: "desk", message: "The location name is too long." },
      { name: "Review store", kind: "counter", message: "Choose a lab, a desk, or a library counter." },
      { name: "Review store", kind: "warehouse", message: "Choose a lab, a desk, or a library counter." },
    ]) {
      const refused = await run(
        database,
        Effect.result(
          Effect.gen(function* () {
            const custody = yield* Custody;
            return yield* custody.createLocation({
              actor: actor("user_admin", daystar),
              name: input.name,
              kind: input.kind,
              departmentId: null,
            });
          }),
        ),
      );
      expect(refused._tag).toBe("Failure");
      if (refused._tag === "Failure") {
        expect(refused.failure.message).toBe(input.message);
      }
    }
    expect(daystarCount()).toBe(3);
  });

  test("a suspended university cannot add a location", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    ormOf(database).update(schema.universities).set({ status: "suspended" }).where(eq(schema.universities.id, daystar)).run();
    const result = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.createLocation({
            actor: actor("user_admin", daystar),
            name: "Review lab",
            kind: "lab",
            departmentId: null,
          });
        }),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("SuspendedUniversity");
    }
    const names = listLocations(ormOf(database), daystar).map((row) => row.name);
    expect(names).toEqual(["Review counter"]);
  });

  test("refuses checkout until a school administrator marks the asset available", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const asset = await register(database, { tag: "TAG-PROCURED" });
    const refused = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.checkout({
            actor: actor("user_attendant", daystar),
            tag: "TAG-PROCURED",
            borrowerUserId: "user_student",
            dueAt: null,
          });
        }),
      ),
    );
    expect(refused._tag).toBe("Failure");
    if (refused._tag === "Failure") {
      expect(refused.failure._tag).toBe("IllegalMove");
      expect(refused.failure.message).toBe(
        "This asset is Procured. A school administrator has to mark it available before checkout.",
      );
    }
    const stored = ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, asset.id)).get();
    expect(stored?.state).toBe("procured");
    expect(ormOf(database).select().from(schema.custody).all()).toEqual([]);
  });

  test("a school administrator can correct an asset without changing its state or condition", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const asset = await register(database, { tag: "TAG-EDIT" });
    const purchased = new Date("2025-03-01T00:00:00.000Z");
    const updated = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        return yield* custody.update({
          actor: actor("user_admin", daystar),
          assetId: asset.id,
          tag: "TAG-EDITED",
          title: "Edited cable",
          cost: 80000,
          salvage: 5000,
          usefulLifeYears: 4,
          purchasedOn: purchased,
          locationId: null,
        });
      }),
    );
    expect(updated.state).toBe("procured");
    expect(updated.tag).toBe("TAG-EDITED");
    const stored = ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, asset.id)).get();
    expect(stored?.title).toBe("Edited cable");
    expect(stored?.tag).toBe("TAG-EDITED");
    expect(stored?.state).toBe("procured");
    expect(stored?.lastCondition).toBeNull();
    expect(stored?.cost).toBe(80000);
    expect(stored?.salvage).toBe(5000);
    expect(stored?.usefulLifeYears).toBe(4);
    expect(stored?.locationId).toBeNull();
    expect(stored?.purchasedOn.toISOString()).toBe(purchased.toISOString());
    const audit = ormOf(database).select().from(schema.auditLog).where(eq(schema.auditLog.action, "asset.update")).get();
    expect(audit?.target).toBe(asset.id);
    expect(audit?.before).toMatchObject({ state: "procured", tag: "TAG-EDIT", lastCondition: null });
    expect(audit?.after).toMatchObject({ state: "procured", tag: "TAG-EDITED", lastCondition: null });

    await register(database, { tag: "TAG-TAKEN" });
    const clash = await run(
      database,
      Effect.result(
        Effect.gen(function* () {
          const custody = yield* Custody;
          return yield* custody.update({
            actor: actor("user_admin", daystar),
            assetId: asset.id,
            tag: "TAG-TAKEN",
            title: "Edited cable",
            cost: 80000,
            salvage: 5000,
            usefulLifeYears: 4,
            purchasedOn: purchased,
            locationId: null,
          });
        }),
      ),
    );
    expect(clash._tag).toBe("Failure");
    if (clash._tag === "Failure") {
      expect(clash.failure._tag).toBe("DuplicateTag");
    }
    expect(ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, asset.id)).get()?.tag).toBe("TAG-EDITED");

    for (const userId of ["user_attendant", "user_head"] as const) {
      const refused = await run(
        database,
        Effect.result(
          Effect.gen(function* () {
            const custody = yield* Custody;
            return yield* custody.update({
              actor: actor(userId, daystar),
              assetId: asset.id,
              tag: "TAG-NO",
              title: "Should not land",
              cost: 1,
              salvage: 0,
              usefulLifeYears: 1,
              purchasedOn,
              locationId: null,
            });
          }),
        ),
      );
      expect(refused._tag).toBe("Failure");
      if (refused._tag === "Failure") {
        expect(refused.failure._tag).toBe("NotAllowed");
        expect(refused.failure.message).toBe("You cannot record that change.");
      }
    }
    expect(ormOf(database).select().from(schema.assets).where(eq(schema.assets.id, asset.id)).get()?.tag).toBe("TAG-EDITED");
  });
});
