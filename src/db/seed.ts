import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";

import { databasePath, openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";

const tenants = [
  {
    id: "uni_daystar",
    name: "Daystar University",
    slug: "daystar",
    country: "Kenya",
    domain: "daystar.ac.ke",
    portalUrl: "https://student.daystar.ac.ke",
    authConfig: {
      adapter: "daystar-portal",
      portalBase: "https://student.daystar.ac.ke",

      loginBody: "nested",
    },
  },
  {
    id: "uni_strathmore",
    name: "Strathmore University",
    slug: "strathmore",
    country: "Kenya",
    domain: "strathmore.edu",
    portalUrl: null,

    authConfig: { adapter: "local" },
  },
  {
    id: "uni_uonbi",
    name: "University of Nairobi",
    slug: "uonbi",
    country: "Kenya",
    domain: "uonbi.ac.ke",
    portalUrl: null,
    authConfig: { adapter: "local" },
  },
] as const;

export function seed(database: Database): void {
  const orm = drizzle(database, { schema });
  const now = new Date();
  for (const tenant of tenants) {
    const existing = orm
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, tenant.id))
      .get();
    if (existing !== undefined) {
      continue;
    }
    orm
      .insert(schema.organization)
      .values({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logo: null,
        createdAt: now,
        updatedAt: now,
        metadata: null,
      })
      .run();
    orm
      .insert(schema.universities)
      .values({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: "active",
        country: tenant.country,
        portalUrl: tenant.portalUrl,
        authConfig: tenant.authConfig,
        createdAt: now,
      })
      .run();
    orm
      .insert(schema.universityDomains)
      .values({ domain: tenant.domain, universityId: tenant.id })
      .run();
  }
}

if (import.meta.main) {
  const database = openDatabase(databasePath());
  applyMigrations(database);
  seed(database);
  database.close();
}
