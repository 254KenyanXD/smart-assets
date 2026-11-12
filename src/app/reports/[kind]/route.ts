import { Effect } from "effect";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";

import { parseReportKind } from "@/domain/reports";
import { auth, runtime } from "@/lib/auth-server";
import { NotAllowed, Service as Reports, SuspendedUniversity, UnknownReport } from "@/services/reports";

export const dynamic = "force-dynamic";

/**
 * Download one report as CSV or PDF.
 * The role check runs again inside the reports service. The link on the page is not the guard.
 */
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await context.params;
  if (parseReportKind(kind) === null) {
    return Response.json({ message: "That report is not one of the four." }, { status: 404 });
  }
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "csv" && format !== "pdf") {
    return Response.json({ message: "Choose a CSV or a PDF." }, { status: 400 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) {
    redirect("/sign-in");
  }
  const organizationId = session.session.activeOrganizationId;
  if (typeof organizationId !== "string") {
    forbidden();
  }
  const platformRole = session.user.platformRole;
  const built = await runtime.runPromise(
    Effect.gen(function* () {
      const reports = yield* Reports;
      return yield* reports.build({
        actor: {
          userId: session.user.id,
          platformRole: typeof platformRole === "string" ? platformRole : "user",
          universityId: organizationId,
        },
        kind,
        now: new Date(),
      });
    }).pipe(Effect.result),
  );
  if (built._tag === "Failure") {
    if (built.failure instanceof NotAllowed || built.failure instanceof SuspendedUniversity) {
      forbidden();
    }
    if (built.failure instanceof UnknownReport) {
      return Response.json({ message: built.failure.message }, { status: 404 });
    }
    return Response.json({ message: "The report could not be built." }, { status: 500 });
  }
  const file = built.success;
  if (format === "csv") {
    return new Response(file.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${file.filename}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${file.filename}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
