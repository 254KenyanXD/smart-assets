import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer, Schema } from "effect";
import type { Database } from "bun:sqlite";

import * as schema from "@/db/schema";
import { parseReportKind, reportFilename, reportScope, type ReportKind, type ReportRole } from "@/domain/reports";
import { csvDocument, letterheadPdf } from "@/lib/export-document";
import { loadReport } from "@/lib/report-store";

type Orm = BunSQLiteDatabase<typeof schema>;

export interface Actor {
  readonly userId: string;

  readonly platformRole: string;

  readonly universityId: string;
}

export interface ReportFile {
  readonly kind: ReportKind;

  readonly title: string;

  readonly filename: string;

  readonly csv: string;

  readonly pdf: Uint8Array;

  readonly rowCount: number;

  readonly pageCount: number;
}

export class NotAllowed extends Schema.TaggedError<NotAllowed>()("NotAllowed", {
  message: Schema.String,
}) {}

export class SuspendedUniversity extends Schema.TaggedError<SuspendedUniversity>()("SuspendedUniversity", {
  message: Schema.String,
}) {}

export class UnknownReport extends Schema.TaggedError<UnknownReport>()("UnknownReport", {
  message: Schema.String,
}) {}

type GateError = NotAllowed | SuspendedUniversity;
type BuildError = NotAllowed | SuspendedUniversity | UnknownReport;
type Outcome<A, E> = { readonly _tag: "ok"; readonly value: A } | { readonly _tag: "err"; readonly error: E };

export interface Interface {
  readonly build: (input: {
    readonly actor: Actor;
    readonly kind: string;
    readonly now: Date;
  }) => Effect.Effect<ReportFile, NotAllowed | SuspendedUniversity | UnknownReport>;
}

export class Service extends Context.Service<Service, Interface>()("@app/Reports") {}

export function layer(database: Database): Layer.Layer<Service> {
  const orm = drizzle(database, { schema });

  return Layer.effect(
    Service,
    Effect.sync(() => {
      const build = Effect.fn("Reports.build")(function* (input: {
        readonly actor: Actor;
        readonly kind: string;
        readonly now: Date;
      }): Effect.fn.Return<ReportFile, NotAllowed | SuspendedUniversity | UnknownReport> {
        const prepared = yield* Effect.sync(() => prepareReport(orm, input));
        if (prepared._tag === "err") {
          return yield* Effect.fail(prepared.error);
        }
        const rendered = yield* Effect.promise(() => renderPrepared(prepared.value));
        return rendered;
      });
      return Service.of({ build });
    }),
  );
}

interface PreparedReport {
  readonly kind: ReportKind;
  readonly title: string;
  readonly filename: string;
  readonly universityName: string;
  readonly department: string;
  readonly period: string;
  readonly generatedBy: string;
  readonly generatedAt: string;
  readonly notes: readonly string[];
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function prepareReport(
  orm: Orm,
  input: { readonly actor: Actor; readonly kind: string; readonly now: Date },
): Outcome<PreparedReport, BuildError> {
  const kind = parseReportKind(input.kind);
  if (kind === null) {
    return err(new UnknownReport({ message: "That report is not one of the four." }));
  }
  const gated = authorize(orm, input.actor);
  if (gated._tag === "err") {
    return gated;
  }
  const scope = reportScope(gated.value.role, kind);
  if (scope === null) {
    return err(new NotAllowed({ message: "You cannot download that report." }));
  }
  const table = loadReport(orm, {
    universityId: input.actor.universityId,
    kind,
    scope,
    borrowerUserId: scope === "borrower" ? input.actor.userId : null,
    now: input.now,
  });
  return ok({
    kind,
    title: table.title,
    filename: reportFilename(kind),
    universityName: gated.value.universityName,
    department: table.department,
    period: table.period,
    generatedBy: gated.value.userName,
    generatedAt: input.now.toISOString(),
    notes: table.notes,
    header: table.header,
    rows: table.rows,
  });
}

async function renderPrepared(prepared: PreparedReport): Promise<ReportFile> {
  const csv = csvFor(prepared);
  const pdf = await letterheadPdf({
    universityName: prepared.universityName,
    department: prepared.department,
    title: prepared.title,
    period: prepared.period,
    generatedBy: prepared.generatedBy,
    generatedAt: prepared.generatedAt,
    notes: prepared.notes,
    header: prepared.header,
    rows: prepared.rows,
  });
  return {
    kind: prepared.kind,
    title: prepared.title,
    filename: prepared.filename,
    csv,
    pdf: pdf.bytes,
    rowCount: prepared.rows.length,
    pageCount: pdf.pageCount,
  };
}

function csvFor(prepared: PreparedReport): string {
  const table = csvDocument(prepared.header, prepared.rows);
  if (prepared.department !== "Your own loans") {
    return table;
  }
  const body = table.startsWith("\uFEFF") ? table.slice(1) : table;
  return `\uFEFFYour own loans\r\n${body}`;
}

function authorize(
  orm: Orm,
  actor: Actor,
): Outcome<{ readonly role: ReportRole; readonly universityName: string; readonly userName: string }, GateError> {
  const university = orm
    .select({ name: schema.universities.name, status: schema.universities.status })
    .from(schema.universities)
    .where(eq(schema.universities.id, actor.universityId))
    .get();
  if (university === undefined) {
    return err(new NotAllowed({ message: "This university is outside your account." }));
  }
  if (university.status !== "active") {
    return err(new SuspendedUniversity({ message: "This university is suspended." }));
  }
  const role = readRole(orm, actor);
  if (role === null) {
    return err(new NotAllowed({ message: "You cannot download that report." }));
  }
  const account = orm
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, actor.userId))
    .get();
  return ok({
    role,
    universityName: university.name,
    userName: account === undefined || account.name.length === 0 ? actor.userId : account.name,
  });
}

function readRole(orm: Orm, actor: Actor): ReportRole | null {
  if (actor.platformRole === "super_admin") {
    return "super_admin";
  }
  const row = orm
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, actor.universityId), eq(schema.member.userId, actor.userId)))
    .get();
  if (row === undefined) {
    return null;
  }
  switch (row.role) {
    case "school_admin":
    case "dept_head":
    case "attendant":
    case "student":
      return row.role;
    default:
      return null;
  }
}

function ok<A>(value: A): Outcome<A, never> {
  return { _tag: "ok", value };
}

function err<E>(error: E): Outcome<never, E> {
  return { _tag: "err", error };
}
