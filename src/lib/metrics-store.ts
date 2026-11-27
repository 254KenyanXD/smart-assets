import { and, eq, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";
import { parseAssetState } from "@/domain/asset-state";
import { completedYears, straightLine } from "@/domain/depreciation";
import { categoryFromInput, categoryName, currentPeriod, type AssetCategory } from "@/domain/metrics";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface CategoryCount {
  readonly category: AssetCategory;
  readonly name: string;
  readonly loans: number;
  readonly share: number;
}

export interface LocationCount {
  readonly id: string | null;
  readonly name: string;
  readonly assets: number;
  readonly out: number;
  readonly overdue: number;
  readonly lastReturn: Date | null;
}

export interface SchoolMetrics {
  readonly period: { readonly label: string; readonly from: Date; readonly to: Date };
  readonly assets: {
    readonly registered: number;
    readonly serviceable: number;
    readonly available: number;
    readonly onLoan: number;
    readonly maintenance: number;
    readonly decommissioned: number;
    readonly utilisation: number;
  };
  readonly custody: {
    readonly open: number;
    readonly overdue: number;
    readonly oldestOverdueDays: number;
    readonly dueToday: number;
    readonly returnsToday: number;
    readonly checkoutsToday: number;
  };
  readonly conditions: { readonly good: number; readonly wear: number; readonly damaged: number };
  readonly categories: readonly CategoryCount[];
  readonly locations: readonly LocationCount[];
  readonly finance: {
    readonly cost: number;
    readonly accumulated: number;
    readonly bookValue: number;
    readonly pastLife: number;
    readonly locations: number;
    readonly staff: number;
    readonly pendingInvites: number;
  };
  readonly found: { readonly total: number; readonly lastWeek: number };
  readonly activity: readonly number[];
}

const day = 86_400_000;

export function loadSchoolMetrics(orm: Orm, universityId: string, now: Date): SchoolMetrics {
  const period = currentPeriod(now);
  const stored = orm
    .select({
      id: schema.assets.id,
      state: schema.assets.state,
      category: schema.assets.category,
      locationId: schema.assets.locationId,
      cost: schema.assets.cost,
      salvage: schema.assets.salvage,
      usefulLifeYears: schema.assets.usefulLifeYears,
      purchasedOn: schema.assets.purchasedOn,
    })
    .from(schema.assets)
    .where(eq(schema.assets.universityId, universityId))
    .all();
  const loans = orm
    .select({
      assetId: schema.custody.assetId,
      checkedOutAt: schema.custody.checkedOutAt,
      checkedInAt: schema.custody.checkedInAt,
      dueAt: schema.custody.dueAt,
      conditionOnReturn: schema.custody.conditionOnReturn,
    })
    .from(schema.custody)
    .where(eq(schema.custody.universityId, universityId))
    .all();
  const places = orm
    .select({ id: schema.locations.id, name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.universityId, universityId))
    .all();
  const foundRows = orm
    .select({ createdAt: schema.foundReports.createdAt })
    .from(schema.foundReports)
    .where(eq(schema.foundReports.universityId, universityId))
    .all();
  const staff = orm
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, universityId),
        sql`${schema.member.role} in ('school_admin', 'dept_head', 'attendant')`,
      ),
    )
    .all().length;
  const pending = orm
    .select({ id: schema.staffInvites.id })
    .from(schema.staffInvites)
    .where(
      and(
        eq(schema.staffInvites.universityId, universityId),
        sql`${schema.staffInvites.acceptedAt} is null`,
        sql`${schema.staffInvites.revokedAt} is null`,
        sql`${schema.staffInvites.expiresAt} > ${now.getTime()}`,
      ),
    )
    .all().length;

  let available = 0;
  let onLoan = 0;
  let maintenance = 0;
  let decommissioned = 0;
  let cost = 0;
  let accumulated = 0;
  let bookValue = 0;
  let pastLife = 0;
  for (const asset of stored) {
    const state = parseAssetState(asset.state);
    if (state === "available") {
      available += 1;
    } else if (state === "in_custody") {
      onLoan += 1;
    } else if (state === "under_maintenance") {
      maintenance += 1;
    } else if (state === "decommissioned") {
      decommissioned += 1;
    }
    const ageYears = completedYears(asset.purchasedOn, now);
    const money = straightLine({
      cost: asset.cost,
      salvage: asset.salvage,
      usefulLifeYears: asset.usefulLifeYears,
      ageYears,
    });
    cost += asset.cost;
    if (money._tag === "ok") {
      bookValue += money.value.bookValue;
      accumulated += money.value.annualCharge * ageYears;
    }
    if (ageYears >= asset.usefulLifeYears) {
      pastLife += 1;
    }
  }
  const serviceable = available + onLoan;

  const open = loans.filter((loan) => loan.checkedInAt === null);
  const overdueLoans = open.filter((loan) => loan.dueAt !== null && loan.dueAt.getTime() < now.getTime());
  const oldestOverdueDays =
    overdueLoans.length === 0
      ? 0
      : Math.floor(
          Math.max(...overdueLoans.map((loan) => now.getTime() - (loan.dueAt?.getTime() ?? now.getTime()))) / day,
        );
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const todayEnd = todayStart + day;
  const dueToday = open.filter(
    (loan) => loan.dueAt !== null && loan.dueAt.getTime() >= todayStart && loan.dueAt.getTime() < todayEnd,
  ).length;
  const returnsToday = loans.filter(
    (loan) => loan.checkedInAt !== null && loan.checkedInAt.getTime() >= todayStart && loan.checkedInAt.getTime() < todayEnd,
  ).length;
  const checkoutsToday = loans.filter(
    (loan) => loan.checkedOutAt.getTime() >= todayStart && loan.checkedOutAt.getTime() < todayEnd,
  ).length;

  let good = 0;
  let wear = 0;
  let damaged = 0;
  for (const loan of loans) {
    if (loan.checkedInAt === null) {
      continue;
    }
    if (loan.checkedInAt.getTime() < period.from.getTime()) {
      continue;
    }
    if (loan.conditionOnReturn === "good") {
      good += 1;
    } else if (loan.conditionOnReturn === "wear") {
      wear += 1;
    } else if (loan.conditionOnReturn === "damaged") {
      damaged += 1;
    }
  }

  const periodLoans = loans.filter(
    (loan) =>
      loan.checkedOutAt.getTime() >= period.from.getTime() && loan.checkedOutAt.getTime() <= period.to.getTime(),
  );
  const assetById = new Map(stored.map((asset) => [asset.id, asset]));
  const byCategory = new Map<AssetCategory, number>();
  for (const loan of periodLoans) {
    const asset = assetById.get(loan.assetId);
    if (asset === undefined) {
      continue;
    }
    const category = categoryFromInput(asset.category);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  const totalPeriodLoans = periodLoans.length;
  const categories: CategoryCount[] = [...byCategory.entries()]
    .map(([category, count]) => ({
      category,
      name: categoryName(category),
      loans: count,
      share: totalPeriodLoans === 0 ? 0 : Math.round((count / totalPeriodLoans) * 100),
    }))
    .sort((left, right) => right.loans - left.loans || left.name.localeCompare(right.name));

  const placeName = new Map(places.map((place) => [place.id, place.name]));
  const locations: LocationCount[] = [];
  const grouped = new Map<string | null, { assets: number; out: number; overdue: number; last: number | null }>();
  for (const asset of stored) {
    const key = asset.locationId;
    const entry = grouped.get(key) ?? { assets: 0, out: 0, overdue: 0, last: null };
    entry.assets += 1;
    grouped.set(key, entry);
  }
  for (const loan of loans) {
    const asset = assetById.get(loan.assetId);
    if (asset === undefined) {
      continue;
    }
    const entry = grouped.get(asset.locationId);
    if (entry === undefined) {
      continue;
    }
    if (loan.checkedInAt === null) {
      entry.out += 1;
      if (loan.dueAt !== null && loan.dueAt.getTime() < now.getTime()) {
        entry.overdue += 1;
      }
    } else if (entry.last === null || loan.checkedInAt.getTime() > entry.last) {
      entry.last = loan.checkedInAt.getTime();
    }
  }
  for (const [id, entry] of grouped.entries()) {
    locations.push({
      id,
      name: id === null ? "No location" : (placeName.get(id) ?? "No location"),
      assets: entry.assets,
      out: entry.out,
      overdue: entry.overdue,
      lastReturn: entry.last === null ? null : new Date(entry.last),
    });
  }
  locations.sort((left, right) => right.assets - left.assets || left.name.localeCompare(right.name));

  const weekAgo = now.getTime() - 7 * day;
  const found = {
    total: foundRows.length,
    lastWeek: foundRows.filter((row) => row.createdAt.getTime() >= weekAgo).length,
  };

  const activity: number[] = [];
  for (let index = 13; index >= 0; index -= 1) {
    const start = todayStart - index * day;
    const end = start + day;
    activity.push(
      loans.filter(
        (loan) => loan.checkedOutAt.getTime() >= start && loan.checkedOutAt.getTime() < end,
      ).length,
    );
  }

  return {
    period: { label: period.label, from: period.from, to: period.to },
    assets: {
      registered: stored.length,
      serviceable,
      available,
      onLoan,
      maintenance,
      decommissioned,
      utilisation: serviceable === 0 ? 0 : Math.round((onLoan / serviceable) * 100),
    },
    custody: {
      open: open.length,
      overdue: overdueLoans.length,
      oldestOverdueDays,
      dueToday,
      returnsToday,
      checkoutsToday,
    },
    conditions: { good, wear, damaged },
    categories,
    locations,
    finance: {
      cost,
      accumulated,
      bookValue,
      pastLife,
      locations: places.length,
      staff,
      pendingInvites: pending,
    },
    found,
    activity,
  };
}

export interface BorrowedLoan {
  readonly id: string;
  readonly assetTitle: string;
  readonly assetTag: string;
  readonly category: AssetCategory;
  readonly borrowerName: string;
  readonly officialId: string | null;
  readonly checkedOutAt: Date;
  readonly dueAt: Date | null;
  readonly checkedInAt: Date | null;
  readonly conditionOnReturn: string | null;
}

export function loadBorrowedLoans(
  orm: Orm,
  universityId: string,
  input: {
    readonly from: Date;
    readonly to: Date;
    readonly category: AssetCategory | null;
    readonly overdue: boolean;
    readonly condition: string | null;
    readonly now: Date;
  },
): readonly BorrowedLoan[] {
  const rows = orm
    .select({
      id: schema.custody.id,
      assetTitle: schema.assets.title,
      assetTag: schema.assets.tag,
      category: schema.assets.category,
      borrowerName: schema.user.name,
      officialId: schema.studentProfiles.officialId,
      checkedOutAt: schema.custody.checkedOutAt,
      dueAt: schema.custody.dueAt,
      checkedInAt: schema.custody.checkedInAt,
      conditionOnReturn: schema.custody.conditionOnReturn,
    })
    .from(schema.custody)
    .innerJoin(schema.assets, eq(schema.custody.assetId, schema.assets.id))
    .innerJoin(schema.user, eq(schema.custody.borrowerUserId, schema.user.id))
    .leftJoin(schema.studentProfiles, eq(schema.studentProfiles.userId, schema.user.id))
    .where(eq(schema.custody.universityId, universityId))
    .all();
  const visible = rows.filter((row) => {
    if (input.category !== null && categoryFromInput(row.category) !== input.category) {
      return false;
    }
    if (input.overdue) {
      return row.checkedInAt === null && row.dueAt !== null && row.dueAt.getTime() < input.now.getTime();
    }
    if (input.condition !== null) {
      return (
        row.checkedInAt !== null &&
        row.checkedInAt.getTime() >= input.from.getTime() &&
        row.conditionOnReturn === input.condition
      );
    }
    return row.checkedOutAt.getTime() >= input.from.getTime() && row.checkedOutAt.getTime() <= input.to.getTime();
  });
  return visible
    .sort((left, right) => right.checkedOutAt.getTime() - left.checkedOutAt.getTime())
    .map((row) => ({
      id: row.id,
      assetTitle: row.assetTitle,
      assetTag: row.assetTag,
      category: categoryFromInput(row.category),
      borrowerName: row.borrowerName,
      officialId: row.officialId,
      checkedOutAt: row.checkedOutAt,
      dueAt: row.dueAt,
      checkedInAt: row.checkedInAt,
      conditionOnReturn: row.conditionOnReturn,
    }));
}
