import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface FoundReportRow {
  readonly id: string;

  readonly assetTag: string;

  readonly assetTitle: string;

  readonly locationName: string | null;

  readonly note: string | null;

  readonly createdAt: Date;
}

export function listFoundReports(orm: Orm, universityId: string): readonly FoundReportRow[] {
  const rows = orm
    .select({
      id: schema.foundReports.id,
      assetTag: schema.assets.tag,
      assetTitle: schema.assets.title,
      locationName: schema.locations.name,
      note: schema.foundReports.note,
      createdAt: schema.foundReports.createdAt,
    })
    .from(schema.foundReports)
    .innerJoin(schema.assets, eq(schema.foundReports.assetId, schema.assets.id))
    .leftJoin(schema.locations, eq(schema.assets.locationId, schema.locations.id))
    .where(eq(schema.foundReports.universityId, universityId))
    .orderBy(desc(schema.foundReports.createdAt))
    .all();
  return rows.map((row) => ({
    id: row.id,
    assetTag: row.assetTag,
    assetTitle: row.assetTitle,
    locationName: row.locationName ?? null,
    note: blankToNull(row.note),
    createdAt: row.createdAt,
  }));
}

function blankToNull(note: string | null): string | null {
  if (note === null) {
    return null;
  }
  return note.trim().length === 0 ? null : note;
}
