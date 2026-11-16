import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { findBorrower } from "@/lib/asset-store";

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

function insertAccount(
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

function insertProfile(
  database: Database,
  input: {
    readonly userId: string;
    readonly universityId: string;
    readonly officialId: string;
    readonly photoUrl: string | null;
  },
): void {
  const now = new Date();
  ormOf(database)
    .insert(schema.studentProfiles)
    .values({
      id: `profile_${input.userId}`,
      userId: input.userId,
      universityId: input.universityId,
      officialId: input.officialId,
      fullName: "Harris Wesley Mwasi",
      programme: "Applied Computer Science",
      campus: "Athi River",
      school: "School of Science and Technology",
      standing: "Active",
      email: null,
      photoUrl: input.photoUrl,
      source: "daystar-portal",
      firstVerifiedAt: now,
      lastVerifiedAt: now,
    })
    .run();
}

/** One linked Daystar student with an admission number and no photo. */
function plantStudent(database: Database): void {
  insertAccount(database, {
    id: "user_harris",
    email: "harris.mwasi@daystar.ac.ke",
    name: "Harris Wesley Mwasi",
  });
  insertMember(database, "mem_harris", daystar, "user_harris", "student");
  insertProfile(database, {
    userId: "user_harris",
    universityId: daystar,
    officialId: "23-1943",
    photoUrl: null,
  });
}

describe("findBorrower", () => {
  test("resolves an admission number exactly as the university issues it", () => {
    const database = memoryDatabase();
    plantStudent(database);

    const borrower = findBorrower(ormOf(database), daystar, "23-1943");
    expect(borrower).not.toBeNull();
    expect(borrower?.userId).toBe("user_harris");
    expect(borrower?.name).toBe("Harris Wesley Mwasi");
    expect(borrower?.officialId).toBe("23-1943");
    expect(borrower?.photoUrl).toBeNull();

    expect(findBorrower(ormOf(database), daystar, "  23-1943  ")?.userId).toBe("user_harris");
  });

  test("never returns a borrower from another university", () => {
    const database = memoryDatabase();
    plantStudent(database);

    expect(findBorrower(ormOf(database), strathmore, "23-1943")).toBeNull();
    expect(findBorrower(ormOf(database), strathmore, "harris.mwasi@daystar.ac.ke")).toBeNull();
  });

  test("still resolves an email, case-insensitively", () => {
    const database = memoryDatabase();
    plantStudent(database);

    const borrower = findBorrower(ormOf(database), daystar, "HARRIS.MWASI@Daystar.ac.ke");
    expect(borrower?.userId).toBe("user_harris");
    expect(borrower?.officialId).toBe("23-1943");
  });

  test("reads an empty key as nobody and a blank photo as no photo", () => {
    const database = memoryDatabase();
    insertAccount(database, {
      id: "user_grace",
      email: "grace.wanjiru@daystar.ac.ke",
      name: "Grace Wanjiru",
    });
    insertMember(database, "mem_grace", daystar, "user_grace", "student");
    insertProfile(database, {
      userId: "user_grace",
      universityId: daystar,
      officialId: "23-0002",
      photoUrl: "   ",
    });

    expect(findBorrower(ormOf(database), daystar, "   ")).toBeNull();
    expect(findBorrower(ormOf(database), daystar, "23-0002")?.photoUrl).toBeNull();
  });

  test("returns the profile photo when the portal gave one", () => {
    const database = memoryDatabase();
    insertAccount(database, {
      id: "user_peter",
      email: "peter.mwangi@daystar.ac.ke",
      name: "Peter Mwangi",
    });
    insertMember(database, "mem_peter", daystar, "user_peter", "student");
    insertProfile(database, {
      userId: "user_peter",
      universityId: daystar,
      officialId: "23-0003",
      photoUrl: "https://student.daystar.ac.ke/photo/231943.jpg",
    });

    expect(findBorrower(ormOf(database), daystar, "23-0003")?.photoUrl).toBe(
      "https://student.daystar.ac.ke/photo/231943.jpg",
    );
  });

  test("does not name a staff member as a borrower", () => {
    const database = memoryDatabase();
    insertAccount(database, {
      id: "user_desk",
      email: "desk@daystar.ac.ke",
      name: "Desk Attendant",
    });
    insertMember(database, "mem_desk", daystar, "user_desk", "attendant");

    expect(findBorrower(ormOf(database), daystar, "desk@daystar.ac.ke")).toBeNull();
  });
});
