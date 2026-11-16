import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import { labelAssetState, parseAssetState, type AssetState } from "@/domain/asset-state";
import { labelCondition, parseCondition } from "@/domain/condition";
import { completedYears, straightLine } from "@/domain/depreciation";

type Orm = BunSQLiteDatabase<typeof schema>;

/** One location a school administrator can attach to an asset. */
export interface ListedLocation {
  /** Location id. */
  readonly id: string;
  /** Name as stored. */
  readonly name: string;
  /** Kind as stored. Older rows may use a word new creates no longer accept. */
  readonly kind: string;
  /** Department name, or null when the location is for the whole university. */
  readonly departmentName: string | null;
}

/** One inventory row. Book value is the written formula at `now`, not a stored column. */
export interface ListedAsset {
  /** Asset id. */
  readonly id: string;
  /** Title recorded at registration. */
  readonly title: string;
  /** Tag unique inside the university. */
  readonly tag: string;
  /** Parsed state, or null when the stored text is not one of the five. */
  readonly state: AssetState | null;
  /** Words for the state. */
  readonly stateLabel: string;
  /** Words for the last check-in grade, or an empty string when none has been recorded. */
  readonly conditionLabel: string;
  /** Location name, or an empty string when the asset has none. */
  readonly locationName: string;
  /** Book value in integer currency units, or null when the stored money cannot be used. */
  readonly bookValue: number | null;
  /** Cost in integer currency units. */
  readonly cost: number;
  /** Salvage in integer currency units. */
  readonly salvage: number;
  /** Useful life in whole years. */
  readonly usefulLifeYears: number;
  /** Purchase date as stored. */
  readonly purchasedOn: Date;
  /** Location id, or null when the asset has none. */
  readonly locationId: string | null;
  /** Last time the asset row changed. */
  readonly updatedAt: Date;
}

/** An open loan the attendant desk is allowed to show, including the borrower. */
export interface OpenLoan {
  /** Custody row id. */
  readonly custodyId: string;
  /** Asset id, used by the check-in action. */
  readonly assetId: string;
  /** Asset title. */
  readonly assetTitle: string;
  /** Asset tag. */
  readonly assetTag: string;
  /** Borrower account name. */
  readonly borrowerName: string;
  /** Official id from the student profile, or null when the profile has none. */
  readonly officialId: string | null;
  /** When the loan started. */
  readonly checkedOutAt: Date;
  /** Due instant, or null when the desk did not set one. */
  readonly dueAt: Date | null;
}

/** One open loan on the student home. No attendant notes and no other student's rows. */
export interface StudentLoanRow {
  /** Asset title. */
  readonly assetTitle: string;
  /** Asset tag. */
  readonly assetTag: string;
  /** Due instant, or null when the desk did not set one. */
  readonly dueAt: Date | null;
}

/** Counts from this student's own custody rows. */
export interface StudentCustodyView {
  /** Loans that are still out. */
  readonly open: readonly StudentLoanRow[];
  /** How many of those are still out. */
  readonly onLoan: number;
  /** Checkouts whose start falls in the current UTC calendar year. */
  readonly loansThisTerm: number;
  /** Closed loans with no due date, or checked in on or before the due instant. */
  readonly returnedOnTime: number;
  /** Open loans whose due instant is already past. */
  readonly overdue: number;
}

/**
 * Inventory for one university, with book value computed at `now`.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University whose assets to list.
 * @param now - Clock reading for the age in years.
 */
export function listAssets(orm: Orm, universityId: string, now: Date): readonly ListedAsset[] {
  const rows = orm
    .select({
      id: schema.assets.id,
      title: schema.assets.title,
      tag: schema.assets.tag,
      state: schema.assets.state,
      cost: schema.assets.cost,
      salvage: schema.assets.salvage,
      usefulLifeYears: schema.assets.usefulLifeYears,
      purchasedOn: schema.assets.purchasedOn,
      lastCondition: schema.assets.lastCondition,
      locationId: schema.assets.locationId,
      locationName: schema.locations.name,
      updatedAt: schema.assets.updatedAt,
    })
    .from(schema.assets)
    .leftJoin(schema.locations, eq(schema.assets.locationId, schema.locations.id))
    .where(eq(schema.assets.universityId, universityId))
    .orderBy(asc(schema.assets.title))
    .all();
  return rows.map((row) => {
    const state = parseAssetState(row.state);
    const condition = row.lastCondition === null ? null : parseCondition(row.lastCondition);
    const ageYears = completedYears(row.purchasedOn, now);
    const money = straightLine({
      cost: row.cost,
      salvage: row.salvage,
      usefulLifeYears: row.usefulLifeYears,
      ageYears,
    });
    return {
      id: row.id,
      title: row.title,
      tag: row.tag,
      state,
      stateLabel: state === null ? row.state : labelAssetState(state),
      conditionLabel: condition === null ? "" : labelCondition(condition),
      locationName: row.locationName ?? "",
      bookValue: money._tag === "ok" ? money.value.bookValue : null,
      cost: row.cost,
      salvage: row.salvage,
      usefulLifeYears: row.usefulLifeYears,
      purchasedOn: row.purchasedOn,
      locationId: row.locationId,
      updatedAt: row.updatedAt,
    };
  });
}

/**
 * Locations for one university, ordered by name.
 * A missing department stays null. It does not drop the location.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University whose locations to list.
 */
export function listLocations(orm: Orm, universityId: string): readonly ListedLocation[] {
  return orm
    .select({
      id: schema.locations.id,
      name: schema.locations.name,
      kind: schema.locations.kind,
      departmentName: schema.departments.name,
    })
    .from(schema.locations)
    .leftJoin(schema.departments, eq(schema.locations.departmentId, schema.departments.id))
    .where(eq(schema.locations.universityId, universityId))
    .orderBy(asc(schema.locations.name))
    .all();
}

/**
 * Open loans for one university. The borrower name and official id are included for the attendant.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University whose open loans to list.
 */
export function listOpenCustody(orm: Orm, universityId: string): readonly OpenLoan[] {
  const rows = orm
    .select({
      custodyId: schema.custody.id,
      assetId: schema.assets.id,
      assetTitle: schema.assets.title,
      assetTag: schema.assets.tag,
      borrowerName: schema.user.name,
      officialId: schema.studentProfiles.officialId,
      checkedOutAt: schema.custody.checkedOutAt,
      dueAt: schema.custody.dueAt,
    })
    .from(schema.custody)
    .innerJoin(schema.assets, eq(schema.custody.assetId, schema.assets.id))
    .innerJoin(schema.user, eq(schema.custody.borrowerUserId, schema.user.id))
    .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.user.id))
    .where(and(eq(schema.custody.universityId, universityId), sql`${schema.custody.checkedInAt} is null`))
    .orderBy(desc(schema.custody.checkedOutAt))
    .all();
  return rows.map((row) => ({
    custodyId: row.custodyId,
    assetId: row.assetId,
    assetTitle: row.assetTitle,
    assetTag: row.assetTag,
    borrowerName: row.borrowerName,
    officialId: row.officialId,
    checkedOutAt: row.checkedOutAt,
    dueAt: row.dueAt,
  }));
}

/**
 * This student's loans and the three home counts.
 * "This term" is the current UTC calendar year. There is no term table.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University on the session.
 * @param userId - The signed-in student.
 * @param now - Clock reading for overdue and the calendar year.
 */
export function listStudentCustody(orm: Orm, universityId: string, userId: string, now: Date): StudentCustodyView {
  const rows = orm
    .select({
      assetTitle: schema.assets.title,
      assetTag: schema.assets.tag,
      checkedOutAt: schema.custody.checkedOutAt,
      dueAt: schema.custody.dueAt,
      checkedInAt: schema.custody.checkedInAt,
    })
    .from(schema.custody)
    .innerJoin(schema.assets, eq(schema.custody.assetId, schema.assets.id))
    .where(and(eq(schema.custody.universityId, universityId), eq(schema.custody.borrowerUserId, userId)))
    .all();
  const year = now.getUTCFullYear();
  const open: StudentLoanRow[] = [];
  let loansThisTerm = 0;
  let returnedOnTime = 0;
  let overdue = 0;
  for (const row of rows) {
    if (row.checkedOutAt.getUTCFullYear() === year) {
      loansThisTerm += 1;
    }
    if (row.checkedInAt === null) {
      open.push({ assetTitle: row.assetTitle, assetTag: row.assetTag, dueAt: row.dueAt });
      if (row.dueAt !== null && row.dueAt.getTime() < now.getTime()) {
        overdue += 1;
      }
    } else if (row.dueAt === null || row.checkedInAt.getTime() <= row.dueAt.getTime()) {
      returnedOnTime += 1;
    }
  }
  return {
    open,
    onLoan: open.length,
    loansThisTerm,
    returnedOnTime,
    overdue,
  };
}

/**
 * A student member of this university, looked up by login email.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University the checkout is for.
 * @param email - Email typed at the desk.
 * @returns The student, or null when this university has no student with that email.
 */
export function findUniversityStudent(
  orm: Orm,
  universityId: string,
  email: string,
): { readonly userId: string; readonly name: string; readonly officialId: string | null } | null {
  const row = orm
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      officialId: schema.studentProfiles.officialId,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, universityId),
        eq(schema.member.role, "student"),
        sql`lower(${schema.user.email}) = ${email.trim().toLowerCase()}`,
      ),
    )
    .get();
  if (row === undefined) {
    return null;
  }
  return { userId: row.userId, name: row.name, officialId: row.officialId };
}
