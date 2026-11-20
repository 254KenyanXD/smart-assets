import { Context, Effect, Layer, Redacted } from "effect";

import type { IdentityFailure } from "@/lib/identity/errors";
import { NotEligible, PortalChanged } from "@/lib/identity/errors";
import { parseDashboard } from "@/lib/identity/profile";
import { Service as PortalTransport } from "@/lib/identity/portal-transport";
import { VerifiedIdentity } from "@/lib/identity/verified-identity";

export interface VerifyInput {
  readonly email: string;

  readonly portalUsername: string;

  readonly portalPassword: Redacted.Redacted<string>;

  readonly portalBase: string;

  readonly loginBody: "nested" | "flat";
}

export interface Interface {
  readonly verify: (input: VerifyInput) => Effect.Effect<VerifiedIdentity, IdentityFailure>;
}

export class Service extends Context.Service<Service, Interface>()("@app/IdentityAdapter") {}

export const daystarLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const transport = yield* PortalTransport;

    const verify = Effect.fn("DaystarPortal.verify")(function* (input: VerifyInput) {
      const session = yield* transport.login({
        baseUrl: input.portalBase,
        username: input.portalUsername,
        password: input.portalPassword,
        body: input.loginBody,
      });
      const html = yield* transport.dashboard({
        baseUrl: input.portalBase,
        cookieHeader: session.cookieHeader,
      });
      const profile = yield* parseDashboard(html);
      const regno = profile.regno;
      const name = profile.name;
      if (regno === undefined || name === undefined) {
        return yield* Effect.fail(
          new PortalChanged({
            message: "The portal page did not include a registration number and a name.",
          }),
        );
      }
      return {
        officialId: regno,
        fullName: name,
        programme: profile.programme ?? profile.degree ?? null,
        campus: profile.campus ?? null,
        school: profile.school ?? null,
        standing: profile.academicstatus ?? null,
        email: profile.email ?? null,
        photoUrl: profile.photoUrl ?? null,
        source: "daystar-portal" as const,
      };
    });

    return Service.of({ verify });
  }),
);

export const localLayer = Layer.succeed(
  Service,
  Service.of({
    verify: () =>
      Effect.fail(
        new NotEligible({
          message: "Staff at this university sign in with an invite, not a portal password.",
        }),
      ),
  }),
);

export const oidcLayer = Layer.succeed(
  Service,
  Service.of({
    verify: () =>
      Effect.fail(
        new NotEligible({
          message: "This university's external sign-in is not enabled.",
        }),
      ),
  }),
);
