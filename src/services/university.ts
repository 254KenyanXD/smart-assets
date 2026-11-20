import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer, Schema } from "effect";
import type { Database } from "bun:sqlite";

import { deriveDaystarAdmission, suggestDaystarPortal } from "@/domain/daystar-admission";
import * as EmailAddress from "@/domain/email-address";
import * as schema from "@/db/schema";
import { Service as Directory } from "@/lib/identity/directory";

const DaystarConfig = Schema.Struct({
  adapter: Schema.Literal("daystar-portal"),
  portalBase: Schema.String,
  loginBody: Schema.Literals(["nested", "flat"]),
});

const LocalConfig = Schema.Struct({
  adapter: Schema.Literal("local"),
});

const OidcConfig = Schema.Struct({
  adapter: Schema.Literal("oidc"),
  enabled: Schema.Literal(false),
});

export const AuthConfig = Schema.Union([DaystarConfig, LocalConfig, OidcConfig]);

export type AuthConfig = typeof AuthConfig.Type;

export interface SupportedUniversity {
  readonly id: string;

  readonly name: string;

  readonly slug: string;

  readonly country: string;

  readonly status: "active" | "suspended";

  readonly authConfig: AuthConfig;
}

export type Resolution =
  | { readonly _tag: "Unknown" }
  | {
      readonly _tag: "Many";
      readonly institutions: readonly {
        readonly name: string;
        readonly country: string;
        readonly slug: string | null;
      }[];
    }
  | {
      readonly _tag: "DirectoryOnly";
      readonly name: string;
      readonly country: string;
    }
  | {
      readonly _tag: "Supported";
      readonly university: SupportedUniversity;
      readonly portal: "student" | "staff" | null;
      readonly admissionNumber: string | null;
    };

export interface ListedProfile {
  readonly userId: string;

  readonly officialId: string;

  readonly fullName: string;
}

export class NotAllowed extends Schema.TaggedError<NotAllowed>()("NotAllowed", {
  message: Schema.String,
}) {}

export interface Interface {
  readonly resolve: (
    email: string,
    universitySlug?: string,
  ) => Effect.Effect<Resolution, EmailAddress.InvalidEmail>;

  readonly allow: (input: {
    readonly userId: string;
    readonly platformRole: string;
    readonly universityId: string;
  }) => Effect.Effect<boolean>;

  readonly listProfiles: (input: {
    readonly userId: string;
    readonly platformRole: string;
    readonly universityId: string;
  }) => Effect.Effect<readonly ListedProfile[], NotAllowed>;
}

export class Service extends Context.Service<Service, Interface>()("@app/University") {}

export function layer(database: Database): Layer.Layer<Service, never, Directory> {
  const orm = drizzle(database, { schema });

  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const directory = yield* Directory;

      const supportedRow = Effect.fn("University.supportedRow")(function* (
        row: typeof schema.universities.$inferSelect,
        local: string,
      ): Effect.fn.Return<Resolution, never> {
        const authConfig = yield* Schema.decodeUnknownEffect(AuthConfig)(row.authConfig).pipe(Effect.orDie);
        const portal = authConfig.adapter === "daystar-portal" ? suggestDaystarPortal(local) : null;
        const status: "active" | "suspended" = row.status === "suspended" ? "suspended" : "active";
        const university: SupportedUniversity = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          country: row.country,
          status,
          authConfig,
        };
        return {
          _tag: "Supported",
          university,
          portal,
          admissionNumber: portal === "student" ? deriveDaystarAdmission(local) : null,
        };
      });

      const resolve = Effect.fn("University.resolve")(function* (
        email: string,
        universitySlug?: string,
      ): Effect.fn.Return<Resolution, EmailAddress.InvalidEmail> {
        const parsed = yield* EmailAddress.parse(email);
        const { local, domain } = EmailAddress.parts(parsed);
        const alias = orm
          .select()
          .from(schema.universityDomains)
          .where(eq(schema.universityDomains.domain, domain))
          .all();
        if (alias.length > 1) {
          const ids = alias.map((row) => row.universityId);
          const rows = orm
            .select()
            .from(schema.universities)
            .where(inArray(schema.universities.id, ids))
            .all();
          const chosen =
            universitySlug === undefined ? undefined : rows.find((row) => row.slug === universitySlug);
          if (chosen === undefined) {
            return {
              _tag: "Many",
              institutions: rows.map((row) => ({
                name: row.name,
                country: row.country,
                slug: row.slug,
              })),
            };
          }
          return yield* supportedRow(chosen, local);
        }
        const aliased = alias[0];
        if (aliased !== undefined) {
          const row = orm
            .select()
            .from(schema.universities)
            .where(eq(schema.universities.id, aliased.universityId))
            .get();
          if (row === undefined) {
            return { _tag: "Unknown" };
          }
          return yield* supportedRow(row, local);
        }
        const hits = yield* directory.lookup(domain);
        const first = hits[0];
        if (first === undefined) {
          return { _tag: "Unknown" };
        }
        if (hits.length > 1) {
          return {
            _tag: "Many",
            institutions: hits.map((hit) => ({ name: hit.name, country: hit.country, slug: null })),
          };
        }
        return { _tag: "DirectoryOnly", name: first.name, country: first.country };
      });

      const allow = Effect.fn("University.allow")(function* (input: {
        readonly userId: string;
        readonly platformRole: string;
        readonly universityId: string;
      }) {
        if (input.platformRole === "super_admin") {
          return true;
        }
        const row = orm
          .select({ status: schema.universities.status })
          .from(schema.member)
          .innerJoin(schema.universities, eq(schema.member.organizationId, schema.universities.id))
          .where(
            and(
              eq(schema.member.userId, input.userId),
              eq(schema.member.organizationId, input.universityId),
              eq(schema.universities.status, "active"),
            ),
          )
          .get();
        return row !== undefined;
      });

      const listProfiles = Effect.fn("University.listProfiles")(function* (input: {
        readonly userId: string;
        readonly platformRole: string;
        readonly universityId: string;
      }): Effect.fn.Return<readonly ListedProfile[], NotAllowed> {
        const allowed = yield* allow({
          userId: input.userId,
          platformRole: input.platformRole,
          universityId: input.universityId,
        });
        if (!allowed) {
          return yield* Effect.fail(new NotAllowed({ message: "This university is outside your account." }));
        }
        return orm
          .select({
            userId: schema.studentProfiles.userId,
            officialId: schema.studentProfiles.officialId,
            fullName: schema.studentProfiles.fullName,
          })
          .from(schema.studentProfiles)
          .where(eq(schema.studentProfiles.universityId, input.universityId))
          .all();
      });

      return Service.of({ resolve, allow, listProfiles });
    }),
  );
}
