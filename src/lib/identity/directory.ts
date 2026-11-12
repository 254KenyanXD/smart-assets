import { join } from "node:path";

import { Context, Effect, Layer, Schema } from "effect";

const directoryPath = join(process.cwd(), "data/directory/world_universities_and_domains.json");

const DirectoryRow = Schema.Struct({
  name: Schema.String,
  domains: Schema.Array(Schema.String),
  country: Schema.String,
});

/**
 * One institution from the vendored Hipo directory.
 */
export interface DirectoryEntry {
  /** Institution name as published in the directory. */
  readonly name: string;
  /** Country name as published in the directory. */
  readonly country: string;
  /** Lowercased email domains for this institution. */
  readonly domains: readonly string[];
}

/**
 * In-memory domain index. Built once. Exact domain match only.
 */
export interface Interface {
  /** Every institution in the vendored file. */
  readonly institutions: () => Effect.Effect<number>;
  /** Unique domains in the vendored file. */
  readonly domains: () => Effect.Effect<number>;
  /**
   * Institutions that publish this exact domain.
   *
   * @param domain - Lowercased domain, without an `@`.
   */
  readonly lookup: (domain: string) => Effect.Effect<readonly DirectoryEntry[]>;
}

/**
 * Vendored Hipo university directory.
 */
export class Service extends Context.Service<Service, Interface>()("@app/UniversityDirectory") {}

/**
 * Read the vendored directory and index it by domain.
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => Bun.file(directoryPath).text(),
      catch: (cause) => cause,
    });
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: (cause) => cause,
    });
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(DirectoryRow))(parsed);
    const byDomain = new Map<string, DirectoryEntry[]>();
    const seen = new Set<string>();
    for (const row of decoded) {
      const entry: DirectoryEntry = {
        name: row.name,
        country: row.country,
        domains: row.domains.map((domain) => domain.toLowerCase()),
      };
      for (const domain of entry.domains) {
        seen.add(domain);
        const current = byDomain.get(domain);
        if (current === undefined) {
          byDomain.set(domain, [entry]);
        } else {
          current.push(entry);
        }
      }
    }

    const institutions = Effect.fn("UniversityDirectory.institutions")(function* () {
      return decoded.length;
    });
    const domains = Effect.fn("UniversityDirectory.domains")(function* () {
      return seen.size;
    });
    const lookup = Effect.fn("UniversityDirectory.lookup")(function* (domain: string) {
      return byDomain.get(domain.toLowerCase()) ?? [];
    });

    return Service.of({ institutions, domains, lookup });
  }).pipe(Effect.orDie),
);
