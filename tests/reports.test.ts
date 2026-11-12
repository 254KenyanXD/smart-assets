import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Layer, ManagedRuntime } from "effect";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import type { Database } from "bun:sqlite";

import { openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { completedYears, straightLine } from "@/domain/depreciation";
import { loadReport } from "@/lib/report-store";
import { layer as custodyLayer, Service as Custody, type Actor as CustodyActor } from "@/services/custody";
import {
  layer as reportsLayer,
  Service as Reports,
  type Actor,
  type ReportFile,
} from "@/services/reports";

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

async function run<A, E>(database: Database, effect: Effect.Effect<A, E, Custody | Reports>): Promise<A> {
  const runtime = ManagedRuntime.make(Layer.mergeAll(custodyLayer(database), reportsLayer(database)));
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

function insertUser(database: Database, id: string, email: string, name: string, platformRole = "user"): void {
  const now = new Date();
  ormOf(database)
    .insert(schema.user)
    .values({
      id,
      name,
      email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      platformRole,
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
  insertUser(database, "user_admin", "admin.report@daystar.ac.ke", "Review Administrator");
  insertUser(database, "user_head", "head.report@daystar.ac.ke", "Review Head");
  insertUser(database, "user_attendant", "attendant.report@daystar.ac.ke", "Review Attendant");
  insertUser(database, "user_student", "student.report@daystar.ac.ke", "Review Student");
  insertUser(database, "user_other", "student.other.report@daystar.ac.ke", "Other Student");
  insertUser(database, "user_strath", "admin.report@strathmore.edu", "Review Strathmore");
  insertUser(database, "user_platform", "platform.report@daystar.ac.ke", "Review Platform", "super_admin");
  insertMember(database, "mem_admin", daystar, "user_admin", "school_admin");
  insertMember(database, "mem_head", daystar, "user_head", "dept_head");
  insertMember(database, "mem_attendant", daystar, "user_attendant", "attendant");
  insertMember(database, "mem_student", daystar, "user_student", "student");
  insertMember(database, "mem_other", daystar, "user_other", "student");
  insertMember(database, "mem_strath", strathmore, "user_strath", "school_admin");
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
      email: "student.report@daystar.ac.ke",
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

function insertAsset(
  database: Database,
  input: {
    readonly id: string;
    readonly universityId: string;
    readonly tag: string;
    readonly title: string;
    readonly state?: string;
    readonly cost?: number;
    readonly salvage?: number;
    readonly usefulLifeYears?: number;
    readonly purchasedOn: Date;
    readonly locationId?: string | null;
    readonly lastCondition?: string | null;
  },
): void {
  const now = new Date();
  ormOf(database)
    .insert(schema.assets)
    .values({
      id: input.id,
      universityId: input.universityId,
      locationId: input.locationId ?? null,
      tag: input.tag,
      title: input.title,
      state: input.state ?? "available",
      cost: input.cost ?? 1000,
      salvage: input.salvage ?? 0,
      usefulLifeYears: input.usefulLifeYears ?? 4,
      purchasedOn: input.purchasedOn,
      lastCondition: input.lastCondition ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function insertLoan(
  database: Database,
  input: {
    readonly id: string;
    readonly universityId: string;
    readonly assetId: string;
    readonly borrowerUserId: string;
    readonly checkedOutAt: Date;
    readonly checkedInAt: Date | null;
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
      attendantUserId: "user_attendant",
      checkedOutAt: input.checkedOutAt,
      dueAt: null,
      checkedInAt: input.checkedInAt,
      conditionOnReturn: input.conditionOnReturn,
    })
    .run();
}

async function build(database: Database, who: Actor, kind: string, now: Date) {
  return run(
    database,
    Effect.result(
      Effect.gen(function* () {
        const reports = yield* Reports;
        return yield* reports.build({ actor: who, kind, now });
      }),
    ),
  );
}

function expectFile(result: Awaited<ReturnType<typeof build>>): ReportFile {
  expect(result._tag).toBe("Success");
  if (result._tag !== "Success") {
    throw new Error("expected a report");
  }
  return result.success;
}

function csvRecords(csv: string): string[][] {
  const text = csv.startsWith("\uFEFF") ? csv.slice(1) : csv;
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  return records;
}

function pdfPlainText(bytes: Uint8Array): string {
  const source = Buffer.from(bytes);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = findStream(source, cursor);
    if (start < 0) {
      break;
    }
    let dataStart = start + "stream".length;
    if (source[dataStart] === 0x0d && source[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (source[dataStart] === 0x0a) {
      dataStart += 1;
    }
    const end = source.indexOf("endstream", dataStart);
    if (end < 0) {
      break;
    }
    let dataEnd = end;
    if (source[dataEnd - 1] === 0x0a) {
      dataEnd -= 1;
      if (source[dataEnd - 1] === 0x0d) {
        dataEnd -= 1;
      }
    }
    const slice = source.subarray(dataStart, dataEnd);
    let decoded = slice;
    try {
      decoded = inflateSync(slice);
    } catch {
      decoded = slice;
    }
    chunks.push(decoded.toString("latin1"));
    cursor = end + "endstream".length;
  }
  const raw = chunks.join("\n");
  const parts: string[] = [];
  const literals = /\((?:\\[\\()nrtbf]|\\[0-7]{1,3}|[^\\)])*\)/g;
  for (const match of raw.matchAll(literals)) {
    parts.push(unescapePdf(match[0].slice(1, -1)));
  }
  const hexText = /<([0-9A-Fa-f]+)>\s*Tj/g;
  for (const match of raw.matchAll(hexText)) {
    const hex = match[1] ?? "";
    parts.push(hexToLatin1(hex));
  }
  return parts.join("\n");
}

function hexToLatin1(hex: string): string {
  let out = "";
  for (let index = 0; index + 1 < hex.length; index += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return out;
}

function findStream(source: Buffer, from: number): number {
  let cursor = from;
  while (cursor < source.length) {
    const start = source.indexOf("stream", cursor);
    if (start < 0) {
      return -1;
    }
    const before = source.subarray(Math.max(0, start - 3), start).toString("latin1");
    if (before !== "end") {
      return start;
    }
    cursor = start + "stream".length;
  }
  return -1;
}

function unescapePdf(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const ch = value[index];
    if (ch !== "\\") {
      out += ch ?? "";
      continue;
    }
    const next = value[index + 1] ?? "";
    if (next === "n") {
      out += "\n";
      index += 1;
    } else if (next === "r") {
      out += "\r";
      index += 1;
    } else if (next === "t") {
      out += "\t";
      index += 1;
    } else if (next === "b") {
      out += "\b";
      index += 1;
    } else if (next === "f") {
      out += "\f";
      index += 1;
    } else if (next === "(" || next === ")" || next === "\\") {
      out += next;
      index += 1;
    } else if (/[0-7]/.test(next)) {
      const digits = /^[0-7]{1,3}/.exec(value.slice(index + 1));
      const octal = digits?.[0] ?? next;
      out += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
    } else {
      out += next;
      index += 1;
    }
  }
  return out;
}

describe("reports", () => {
  test("an empty inventory still downloads the header and a one-page letterhead", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const now = new Date("2026-11-10T12:00:00.000Z");
    const file = expectFile(await build(database, actor("user_head", daystar), "inventory", now));
    expect(file.rowCount).toBe(0);
    expect(file.pageCount).toBe(1);
    expect(file.csv.charCodeAt(0)).toBe(0xfeff);
    expect(file.csv.includes("\r\n")).toBe(true);
    expect(file.csv.replace(/\r\n/g, "").includes("\n")).toBe(false);
    const records = csvRecords(file.csv);
    expect(records.length).toBe(1);
    expect(records[0]).toEqual(["Asset", "Tag", "Location", "Status", "Last condition"]);
    const text = pdfPlainText(file.pdf);
    expect(text).toContain("Daystar University");
    expect(text).toContain("Inventory and room audit");
    expect(text).toContain("Department: Whole university");
    expect(text).toContain("Period: As of 2026-11-10. Whole university.");
    expect(text).toContain("Generated by Review Head");
    expect(text).toContain("Page 1 of 1");
    expect(text).toContain("No rows.");
    const loaded = await PDFDocument.load(file.pdf);
    expect(loaded.getPageCount()).toBe(1);
  });

  test("csv rows and the pdf come from the same university query", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const now = new Date();
    const purchased = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate()));
    expect(completedYears(purchased, now)).toBe(2);
    const known = straightLine({ cost: 100000, salvage: 10000, usefulLifeYears: 5, ageYears: 2 });
    expect(known._tag).toBe("ok");

    const registered = await run(
      database,
      Effect.gen(function* () {
        const custody = yield* Custody;
        const admin: CustodyActor = actor("user_admin", daystar);
        const attendant: CustodyActor = actor("user_attendant", daystar);
        const asset = yield* custody.register({
          actor: admin,
          tag: "TAG-LIVE",
          title: "Lab cable",
          cost: 100000,
          salvage: 10000,
          usefulLifeYears: 5,
          purchasedOn: purchased,
          locationId: "loc_counter",
        });
        yield* custody.recordMove({ actor: admin, assetId: asset.id, to: "available" });
        yield* custody.checkout({
          actor: attendant,
          tag: "TAG-LIVE",
          borrowerUserId: "user_student",
          dueAt: null,
        });
        yield* custody.checkIn({ actor: attendant, assetId: asset.id, condition: "damaged" });
        yield* custody.checkout({
          actor: attendant,
          tag: "TAG-LIVE",
          borrowerUserId: "user_student",
          dueAt: null,
        });
        return asset.id;
      }),
    );

    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const yesterday = new Date(dayStart - 3_600_000);
    insertAsset(database, {
      id: "asset_yday",
      universityId: daystar,
      tag: "TAG-YDAY",
      title: "Closed yesterday",
      purchasedOn: purchased,
      lastCondition: "wear",
    });
    insertLoan(database, {
      id: "loan_yday",
      universityId: daystar,
      assetId: "asset_yday",
      borrowerUserId: "user_student",
      checkedOutAt: yesterday,
      checkedInAt: yesterday,
      conditionOnReturn: "wear",
    });
    insertAsset(database, {
      id: "asset_old",
      universityId: daystar,
      tag: "TAG-OPEN-OLD",
      title: "Still out",
      state: "in_custody",
      purchasedOn: purchased,
    });
    insertLoan(database, {
      id: "loan_old",
      universityId: daystar,
      assetId: "asset_old",
      borrowerUserId: "user_student",
      checkedOutAt: new Date(dayStart - 10 * 86_400_000),
      checkedInAt: null,
      conditionOnReturn: null,
    });
    insertAsset(database, {
      id: "asset_other",
      universityId: daystar,
      tag: "TAG-OTHER",
      title: "Other loan",
      state: "in_custody",
      purchasedOn: purchased,
    });
    insertLoan(database, {
      id: "loan_other",
      universityId: daystar,
      assetId: "asset_other",
      borrowerUserId: "user_other",
      checkedOutAt: now,
      checkedInAt: null,
      conditionOnReturn: null,
    });
    insertAsset(database, {
      id: "asset_formula",
      universityId: daystar,
      tag: "TAG-FORMULA",
      title: "=SUM(1)",
      purchasedOn: purchased,
    });
    insertAsset(database, {
      id: "asset_quote",
      universityId: daystar,
      tag: "TAG-QUOTE",
      title: 'Say "hi", friend',
      purchasedOn: purchased,
    });
    insertAsset(database, {
      id: "asset_dash",
      universityId: daystar,
      tag: "TAG-DASH",
      title: "Cable \u2014 spare",
      purchasedOn: purchased,
    });
    const aged = new Date(Date.UTC(now.getUTCFullYear() - 10, now.getUTCMonth(), now.getUTCDate()));
    insertAsset(database, {
      id: "asset_neg",
      universityId: daystar,
      tag: "TAG-NEG",
      title: "Old meter",
      cost: 100,
      salvage: 0,
      usefulLifeYears: 4,
      purchasedOn: aged,
    });
    insertAsset(database, {
      id: "asset_strath",
      universityId: strathmore,
      tag: "TAG-STRATH-ONLY",
      title: "Other university",
      purchasedOn: purchased,
    });

    const head = actor("user_head", daystar);
    const inventory = expectFile(await build(database, head, "inventory", now));
    const query = loadReport(ormOf(database), {
      universityId: daystar,
      kind: "inventory",
      scope: "university",
      borrowerUserId: null,
      now,
    });
    const records = csvRecords(inventory.csv);
    expect(records.length - 1).toBe(query.rows.length);
    expect(inventory.rowCount).toBe(query.rows.length);
    for (const row of query.rows) {
      const found = records.slice(1).find((record) => record[1] === row[1]);
      const title = row[0] ?? "";
      expect(found?.[0]).toBe(title.startsWith("=") ? `'${title}` : title);
      expect(found?.slice(1)).toEqual(row.slice(1));
    }
    expect(inventory.csv).toContain("'=SUM(1)");
    expect(inventory.csv).toContain('"Say ""hi"", friend"');
    expect(inventory.csv).toContain("Cable \u2014 spare");
    expect(inventory.csv).not.toContain("TAG-STRATH-ONLY");
    const text = pdfPlainText(inventory.pdf).replace(/\s+/g, " ");
    expect(text).toContain("Daystar University");
    expect(text).toContain("Inventory and room audit");
    expect(text).toContain("TAG-LIVE");
    expect(text).toContain("Review counter");
    expect(text).toContain("In custody");
    expect(text).toContain("Cable - spare");
    expect(text).toContain('Say "hi", friend');
    expect(text).not.toContain("TAG-STRATH-ONLY");
    expect(text).toContain(`Page 1 of ${inventory.pageCount}`);
    const loaded = await PDFDocument.load(inventory.pdf);
    expect(loaded.getPageCount()).toBe(inventory.pageCount);

    const depreciation = expectFile(await build(database, head, "depreciation", now));
    const depreciationRows = csvRecords(depreciation.csv);
    const live = depreciationRows.find((row) => row[1] === "TAG-LIVE");
    expect(live).toEqual(["Lab cable", "TAG-LIVE", expect.any(String), "100000", "10000", "5 years", "18000", "64000"]);
    const negative = depreciationRows.find((row) => row[1] === "TAG-NEG");
    expect(negative?.[7]).toBe("-150");
    expect(depreciation.csv).not.toContain("'-150");
    expect(depreciation.csv).not.toContain("TAG-STRATH-ONLY");
    const depreciationText = pdfPlainText(depreciation.pdf);
    expect(depreciationText).toContain("These figures are a management aid. They are not audited financial statements.");
    expect(depreciationText).toContain("64000");
    expect(depreciationText).not.toContain("TAG-STRATH-ONLY");

    const demand = expectFile(await build(database, head, "demand", now));
    const demandRows = csvRecords(demand.csv);
    expect(demandRows.find((row) => row[1] === "TAG-LIVE")).toEqual(["Lab cable", "TAG-LIVE", "2", "0", "1"]);
    expect(demandRows.find((row) => row[1] === "TAG-YDAY")).toEqual(["Closed yesterday", "TAG-YDAY", "1", "1", "0"]);
    expect(demandRows.find((row) => row[1] === "TAG-FORMULA")).toBeUndefined();
    expect(demand.csv).not.toContain("TAG-STRATH-ONLY");
    expect(demand.rowCount).toBe(demandRows.length - 1);

    const history = expectFile(await build(database, head, "custody", now));
    expect(history.csv).toContain("TAG-YDAY");
    expect(history.csv).toContain("TAG-LIVE");
    expect(history.csv).toContain("Review Student (23-0101)");
    expect(history.csv).toContain("Still out");
    expect(history.csv).toContain("Damaged");
    expect(history.csv).not.toContain("TAG-STRATH-ONLY");
    expect(history.csv).not.toContain("Your own loans");

    const dayReport = expectFile(await build(database, actor("user_attendant", daystar), "custody", now));
    expect(dayReport.csv).toContain("TAG-LIVE");
    expect(dayReport.csv).toContain("TAG-OPEN-OLD");
    expect(dayReport.csv).toContain("TAG-OTHER");
    expect(dayReport.csv).not.toContain("TAG-YDAY");
    expect(dayReport.csv).not.toContain("TAG-STRATH-ONLY");
    expect(pdfPlainText(dayReport.pdf)).toContain("UTC day");

    const own = expectFile(await build(database, actor("user_student", daystar), "custody", now));
    expect(own.csv).toContain("TAG-LIVE");
    expect(own.csv).toContain("TAG-OPEN-OLD");
    expect(own.csv).toContain("TAG-YDAY");
    expect(own.csv).not.toContain("TAG-OTHER");
    expect(own.csv).not.toContain("TAG-STRATH-ONLY");
    expect(own.csv.replace(/^\uFEFF/, "").startsWith("Your own loans\r\n")).toBe(true);
    expect(pdfPlainText(own.pdf)).toContain("Your own loans");

    const schoolDemand = await build(database, actor("user_admin", daystar), "demand", now);
    expect(schoolDemand._tag).toBe("Failure");
    if (schoolDemand._tag === "Failure") {
      expect(schoolDemand.failure._tag).toBe("NotAllowed");
    }
    const attendantInventory = await build(database, actor("user_attendant", daystar), "inventory", now);
    expect(attendantInventory._tag).toBe("Failure");
    const studentDepreciation = await build(database, actor("user_student", daystar), "depreciation", now);
    expect(studentDepreciation._tag).toBe("Failure");
    const wrongUniversity = await build(database, actor("user_head", strathmore), "inventory", now);
    expect(wrongUniversity._tag).toBe("Failure");
    if (wrongUniversity._tag === "Failure") {
      expect(wrongUniversity.failure._tag).toBe("NotAllowed");
      expect(wrongUniversity.failure.message).toBe("You cannot download that report.");
    }
    const missingUniversity = await build(database, actor("user_head", "uni_missing"), "inventory", now);
    expect(missingUniversity._tag).toBe("Failure");
    if (missingUniversity._tag === "Failure") {
      expect(missingUniversity.failure.message).toBe("This university is outside your account.");
    }
    const unknown = await build(database, head, "audit", now);
    expect(unknown._tag).toBe("Failure");
    if (unknown._tag === "Failure") {
      expect(unknown.failure._tag).toBe("UnknownReport");
    }

    const otherUniversity = expectFile(
      await build(database, actor("user_platform", strathmore, "super_admin"), "inventory", now),
    );
    expect(otherUniversity.csv).toContain("TAG-STRATH-ONLY");
    expect(otherUniversity.csv).not.toContain("TAG-LIVE");
    expect(pdfPlainText(otherUniversity.pdf)).toContain("Strathmore");

    ormOf(database).update(schema.universities).set({ status: "suspended" }).where(eq(schema.universities.id, daystar)).run();
    const suspended = await build(database, head, "inventory", now);
    expect(suspended._tag).toBe("Failure");
    if (suspended._tag === "Failure") {
      expect(suspended.failure._tag).toBe("SuspendedUniversity");
    }

    expect(registered).toBeTruthy();
  });

  test("a long inventory uses more than one page and the footer names that count", async () => {
    const database = memoryDatabase();
    plantPeople(database);
    const now = new Date("2026-11-10T12:00:00.000Z");
    const purchased = new Date("2024-01-15T00:00:00.000Z");
    for (let index = 0; index < 90; index += 1) {
      const tag = `TAG-PAGE-${String(index).padStart(3, "0")}`;
      insertAsset(database, {
        id: `asset_page_${index}`,
        universityId: daystar,
        tag,
        title: `Inventory item ${tag} for the room audit table`,
        purchasedOn: purchased,
      });
    }
    const file = expectFile(await build(database, actor("user_head", daystar), "inventory", now));
    expect(file.rowCount).toBe(90);
    expect(csvRecords(file.csv).length - 1).toBe(90);
    expect(file.pageCount).toBeGreaterThan(1);
    const text = pdfPlainText(file.pdf);
    expect(text).toContain(`Page 1 of ${file.pageCount}`);
    expect(text).toContain(`Page ${file.pageCount} of ${file.pageCount}`);
    expect(text).toContain("TAG-PAGE-000");
    expect(text).toContain("TAG-PAGE-089");
    expect(text).not.toContain("TAG-STRATH-ONLY");
    const loaded = await PDFDocument.load(file.pdf);
    expect(loaded.getPageCount()).toBe(file.pageCount);
  });
});
