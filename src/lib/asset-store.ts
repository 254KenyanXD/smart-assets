import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import { labelAssetState, parseAssetState, type AssetState } from "@/domain/asset-state";
import { labelCondition, parseCondition } from "@/domain/condition";
import { completedYears, straightLine } from "@/domain/depreciation";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface ListedLocation {
  readonly id: string;

  readonly name: string;

  readonly kind: string;

  readonly departmentName: string | null;
}

export interface ListedAsset {
  readonly id: string;

  readonly title: string;

  readonly tag: string;

  readonly category: string;

  readonly state: AssetState | null;

  readonly stateLabel: string;

  readonly conditionLabel: string;

  readonly locationName: string;

  readonly bookValue: number | null;

  readonly cost: number;

  readonly salvage: number;

  readonly usefulLifeYears: number;

  readonly purchasedOn: Date;

  readonly locationId: string | null;

  readonly updatedAt: Date;
}

export interface OpenLoan {
  readonly custodyId: string;

  readonly assetId: string;

  readonly assetTitle: string;

  readonly assetTag: string;

  readonly borrowerName: string;

  readonly officialId: string | null;

  readonly checkedOutAt: Date;

  readonly dueAt: Date | null;
}

export interface StudentLoanRow {
  readonly assetTitle: string;

  readonly assetTag: string;

  readonly dueAt: Date | null;
}

export interface StudentCustodyView {
  readonly open: readonly StudentLoanRow[];

  readonly onLoan: number;

  readonly loansThisTerm: number;

  readonly returnedOnTime: number;

  readonly overdue: number;
}

export function listAssets(orm: Orm, universityId: string, now: Date): readonly ListedAsset[] {
  const rows = orm
    .select({
      id: schema.assets.id,
      title: schema.assets.title,
      tag: schema.assets.tag,
      category: schema.assets.category,
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
      category: row.category,
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

export interface BorrowerLookup {
  readonly userId: string;

  readonly name: string;

  readonly officialId: string | null;

  readonly photoUrl: string | null;
}

export function findBorrower(orm: Orm, universityId: string, key: string): BorrowerLookup | null {
  const typed = key.trim();
  if (typed.length === 0) {
    return null;
  }
  const identity = typed.includes("@")
    ? sql`lower(${schema.user.email}) = ${typed.toLowerCase()}`
    : sql`${schema.studentProfiles.officialId} = ${typed}`;
  const row = orm
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      officialId: schema.studentProfiles.officialId,
      photoUrl: schema.studentProfiles.photoUrl,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.user.id))
    .where(and(eq(schema.member.organizationId, universityId), eq(schema.member.role, "student"), identity))
    .get();
  if (row === undefined) {
    return null;
  }
  const photo = row.photoUrl;
  return {
    userId: row.userId,
    name: row.name,
    officialId: row.officialId,
    photoUrl: typeof photo === "string" && photo.trim().length > 0 ? photo : null,
  };
}

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
