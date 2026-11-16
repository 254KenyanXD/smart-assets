import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "@/db/schema";

type Orm = BunSQLiteDatabase<typeof schema>;

/**
 * One found-tag row for the attendant queue.
 * The reporter and the borrower are deliberately absent: the queue says which item was
 * found and where, and nothing about who filed the report or who has it on loan.
 */
export interface FoundReportRow {
  /** Found report id. */
  readonly id: string;
  /** Tag of the asset that was found. */
  readonly assetTag: string;
  /** Title of the asset that was found. */
  readonly assetTitle: string;
  /** Location name, or null when the asset has no location. */
  readonly locationName: string | null;
  /** Note recorded with the report, or null when it was absent or blank. */
  readonly note: string | null;
  /** When the report was filed. */
  readonly createdAt: Date;
}

/**
 * Found-tag queue for one university, newest first.
 * A report from another university does not appear.
 *
 * @param orm - Drizzle handle for the app database.
 * @param universityId - University whose found reports to list.
 */
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

/**
 * A note that is empty or only whitespace reads as no note at all.
 *
 * @param note - Text as stored.
 */
function blankToNull(note: string | null): string | null {
  if (note === null) {
    return null;
  }
  return note.trim().length === 0 ? null : note;
}
