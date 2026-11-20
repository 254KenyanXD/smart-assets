import { Effect } from "effect";

import { InvalidEmail } from "@/domain/email-address";
import { runtime } from "@/lib/auth-server";
import type { ResolveBody } from "@/lib/resolve-body";
import { createWindowLimiter } from "@/lib/resolve-limit";
import { Service as University } from "@/services/university";

const allow = createWindowLimiter(30, 60_000);

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "local";
  }
  return "local";
}

export async function GET(request: Request): Promise<Response> {
  if (!allow(clientIp(request), Date.now())) {
    return Response.json({ message: "Too many lookups. Wait a minute and try again." }, { status: 429 });
  }
  const url = new URL(request.url);
  const email = url.searchParams.get("email") ?? "";
  const university = url.searchParams.get("university");
  const slug = university === null || university.length === 0 ? undefined : university;

  const resolved = await runtime
    .runPromise(
      Effect.gen(function* () {
        const universities = yield* University;
        return yield* universities.resolve(email, slug);
      }).pipe(Effect.result),
    )
    .catch(() => null);
  if (resolved === null) {
    return Response.json({ message: "The university list could not be read." }, { status: 500 });
  }

  if (resolved._tag === "Failure") {
    if (resolved.failure instanceof InvalidEmail) {
      return Response.json({ message: "Enter a university email." }, { status: 400 });
    }
    return Response.json({ message: "The university list could not be read." }, { status: 500 });
  }

  const body = resolved.success;
  if (body._tag === "Unknown") {
    const payload: ResolveBody = { supported: false };
    return Response.json(payload, { status: 404 });
  }
  if (body._tag === "Many") {
    const payload: ResolveBody = { supported: false, many: true, institutions: body.institutions };
    return Response.json(payload);
  }
  if (body._tag === "DirectoryOnly") {
    const payload: ResolveBody = { supported: false, name: body.name, country: body.country };
    return Response.json(payload);
  }
  const payload: ResolveBody = {
    supported: true,
    name: body.university.name,
    country: body.university.country,
    slug: body.university.slug,
    status: body.university.status,
    adapter: body.university.authConfig.adapter,
    portal: body.portal,
    admissionNumber: body.admissionNumber,
  };
  return Response.json(payload);
}
