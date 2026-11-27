import { and, asc, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import { labelAssetState, parseAssetState } from "@/domain/asset-state";
import { labelCondition, parseCondition } from "@/domain/condition";
import { completedYears, straightLine } from "@/domain/depreciation";
import { reportTitle, type ReportKind, type ReportScope } from "@/domain/reports";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface ReportTable {
  readonly kind: ReportKind;

  readonly title: string;

  readonly department: string;

  readonly period: string;

  readonly notes: readonly string[];

  readonly header: readonly string[];

  readonly rows: readonly (readonly string[])[];
}

export function loadReport(
  orm: Orm,
  input: {
    readonly universityId: string;
    readonly kind: ReportKind;
    readonly scope: ReportScope;
    readonly borrowerUserId: string | null;
    readonly now: Date;
  },
): ReportTable {
  const department = input.scope === "borrower" ? "Your own loans" : "Whole university";
  const shared = {
    kind: input.kind,
    title: reportTitle(input.kind),
    department,
    period: periodLine(input.kind, input.scope, input.now),
    notes: notesFor(input.kind),
  };
  switch (input.kind) {
    case "inventory":
      return { ...shared, header: inventoryHeader, rows: inventoryRows(orm, input.universityId) };
    case "custody":
      return {
        ...shared,
        header: custodyHeader,
        rows: custodyRows(orm, input.universityId, input.scope, input.borrowerUserId, input.now),
      };
    case "demand":
      return { ...shared, header: demandHeader, rows: demandRows(orm, input.universityId) };
    case "depreciation":
      return { ...shared, header: depreciationHeader, rows: depreciationRows(orm, input.universityId, input.now) };
  }
}

const inventoryHeader = ["Asset", "Tag", "Location", "Status", "Last condition"] as const;
const custodyHeader = ["Asset", "Tag", "Held by", "From", "Until", "Condition on return"] as const;
const demandHeader = ["Asset", "Tag", "Times out", "Minor wear", "Damaged"] as const;
const depreciationHeader = ["Asset", "Tag", "Acquired", "Cost", "Salvage", "Life", "Charge per year", "Book value"] as const;

function periodLine(kind: ReportKind, scope: ReportScope, now: Date): string {
  if (scope === "day") {
    return `UTC day ${utcDay(now)}.`;
  }
  if (scope === "borrower") {
    return "Your own loans.";
  }
  if (kind === "inventory" || kind === "depreciation") {
    return `As of ${utcDay(now)}. Whole university.`;
  }
  if (kind === "demand") {
    return "All recorded loans. Counts are loans, not unique students.";
  }
  return "All recorded loans. Whole university.";
}

function notesFor(kind: ReportKind): readonly string[] {
  switch (kind) {
    case "inventory":
      return ["Assets at a location, with status and last condition. A blank location means none is recorded."];
    case "custody":
      return ["Who held the asset, from when, until when, and the condition on return. Still out means the loan is open."];
    case "demand":
      return [
        "Each row is one asset. Assets have no class column.",
        "Damaged is the stored grade. There is no defaced grade.",
      ];
    case "depreciation":
      return [
        "Annual charge equals cost minus salvage, divided by useful life in years. Division truncates.",
        "Book value equals cost minus that charge times the completed years. It is not floored at salvage.",
        "These figures are a management aid. They are not audited financial statements.",
      ];
  }
}

function inventoryRows(orm: Orm, universityId: string): string[][] {
  const stored = orm
    .select({
      title: schema.assets.title,
      tag: schema.assets.tag,
      state: schema.assets.state,
      lastCondition: schema.assets.lastCondition,
      locationName: schema.locations.name,
    })
    .from(schema.assets)
    .leftJoin(schema.locations, eq(schema.assets.locationId, schema.locations.id))
    .where(eq(schema.assets.universityId, universityId))
    .orderBy(asc(schema.assets.tag))
    .all();
  return stored.map((row) => {
    const state = parseAssetState(row.state);
    const condition = row.lastCondition === null ? null : parseCondition(row.lastCondition);
    return [
      row.title,
      row.tag,
      row.locationName ?? "",
      state === null ? row.state : labelAssetState(state),
      condition === null ? (row.lastCondition ?? "") : labelCondition(condition),
    ];
  });
}

function custodyRows(
  orm: Orm,
  universityId: string,
  scope: ReportScope,
  borrowerUserId: string | null,
  now: Date,
): string[][] {
  const stored = orm
    .select({
      title: schema.assets.title,
      tag: schema.assets.tag,
      borrowerName: schema.user.name,
      borrowerUserId: schema.custody.borrowerUserId,
      officialId: schema.studentProfiles.officialId,
      checkedOutAt: schema.custody.checkedOutAt,
      checkedInAt: schema.custody.checkedInAt,
      conditionOnReturn: schema.custody.conditionOnReturn,
    })
    .from(schema.custody)
    .innerJoin(schema.assets, eq(schema.custody.assetId, schema.assets.id))
    .innerJoin(schema.user, eq(schema.custody.borrowerUserId, schema.user.id))
    .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.user.id))
    .where(eq(schema.custody.universityId, universityId))
    .all();
  const start = utcStart(now);
  const end = start + 86_400_000;
  const visible = stored.filter((row) => {
    if (scope === "borrower") {
      return borrowerUserId !== null && row.borrowerUserId === borrowerUserId;
    }
    if (scope === "day") {
      if (row.checkedInAt === null) {
        return true;
      }
      const out = row.checkedOutAt.getTime();
      const back = row.checkedInAt.getTime();
      return (out >= start && out < end) || (back >= start && back < end);
    }
    return true;
  });
  visible.sort((left, right) => {
    const byTime = left.checkedOutAt.getTime() - right.checkedOutAt.getTime();
    return byTime === 0 ? left.tag.localeCompare(right.tag) : byTime;
  });
  return visible.map((row) => {
    const condition = row.conditionOnReturn === null ? null : parseCondition(row.conditionOnReturn);
    const heldBy = row.officialId === null ? row.borrowerName : `${row.borrowerName} (${row.officialId})`;
    return [
      row.title,
      row.tag,
      heldBy,
      utcMinute(row.checkedOutAt),
      row.checkedInAt === null ? "Still out" : utcMinute(row.checkedInAt),
      condition === null ? (row.conditionOnReturn ?? "") : labelCondition(condition),
    ];
  });
}

function demandRows(orm: Orm, universityId: string): string[][] {
  const timesOut = sql<number>`count(${schema.custody.id})`;
  const minorWear = sql<number>`coalesce(sum(case when ${schema.custody.conditionOnReturn} = 'wear' then 1 else 0 end), 0)`;
  const damaged = sql<number>`coalesce(sum(case when ${schema.custody.conditionOnReturn} = 'damaged' then 1 else 0 end), 0)`;
  const stored = orm
    .select({
      title: schema.assets.title,
      tag: schema.assets.tag,
      timesOut,
      minorWear,
      damaged,
    })
    .from(schema.assets)
    .innerJoin(
      schema.custody,
      and(eq(schema.custody.assetId, schema.assets.id), eq(schema.custody.universityId, universityId)),
    )
    .where(eq(schema.assets.universityId, universityId))
    .groupBy(schema.assets.id, schema.assets.title, schema.assets.tag)
    .all();
  const ranked = stored
    .map((row) => ({
      title: row.title,
      tag: row.tag,
      timesOut: Number(row.timesOut),
      minorWear: Number(row.minorWear),
      damaged: Number(row.damaged),
    }))
    .sort((left, right) => right.timesOut - left.timesOut || left.tag.localeCompare(right.tag));
  return ranked.map((row) => [row.title, row.tag, String(row.timesOut), String(row.minorWear), String(row.damaged)]);
}

function depreciationRows(orm: Orm, universityId: string, now: Date): string[][] {
  const stored = orm
    .select({
      title: schema.assets.title,
      tag: schema.assets.tag,
      cost: schema.assets.cost,
      salvage: schema.assets.salvage,
      usefulLifeYears: schema.assets.usefulLifeYears,
      purchasedOn: schema.assets.purchasedOn,
    })
    .from(schema.assets)
    .where(eq(schema.assets.universityId, universityId))
    .orderBy(asc(schema.assets.tag))
    .all();
  return stored.map((row) => {
    const ageYears = completedYears(row.purchasedOn, now);
    const money = straightLine({
      cost: row.cost,
      salvage: row.salvage,
      usefulLifeYears: row.usefulLifeYears,
      ageYears,
    });
    const charge = money._tag === "ok" ? String(money.value.annualCharge) : "";
    const book = money._tag === "ok" ? String(money.value.bookValue) : "";
    const life = row.usefulLifeYears === 1 ? "1 year" : `${row.usefulLifeYears} years`;
    return [row.title, row.tag, utcDay(row.purchasedOn), String(row.cost), String(row.salvage), life, charge, book];
  });
}

function utcDay(value: Date): string {
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

function utcMinute(value: Date): string {
  const hour = String(value.getUTCHours()).padStart(2, "0");
  const minute = String(value.getUTCMinutes()).padStart(2, "0");
  return `${utcDay(value)} ${hour}:${minute}`;
}

function utcStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}
