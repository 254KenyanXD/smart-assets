import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Database } from "bun:sqlite";

import { databasePath, openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { hashLocalPassword } from "@/lib/auth";

/**
 * Fields for the first super admin. The password is hashed and not written to a file.
 */
export interface FirstAdmin {
  /** Sign-in email. */
  readonly email: string;
  /** Display name. */
  readonly name: string;
  /** Local password. It is hashed before insert. */
  readonly password: string;
}

/**
 * Create the first super admin.
 * The admin plugin cannot create this account: it requires an admin session that does not exist yet.
 * A second call refuses.
 *
 * @param database - Open SQLite database.
 * @param input - Name, email, and password.
 */
export async function createFirstSuperAdmin(database: Database, input: FirstAdmin): Promise<void> {
  const orm = drizzle(database, { schema });
  const existing = orm
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.platformRole, "super_admin"))
    .get();
  if (existing !== undefined) {
    throw new Error("A super admin already exists.");
  }
  const now = new Date();
  const id = crypto.randomUUID();
  const passwordHash = await hashLocalPassword(input.password);
  orm
    .insert(schema.user)
    .values({
      id,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      platformRole: "super_admin",
      role: "super_admin",
      banned: false,
      banReason: null,
      banExpires: null,
    })
    .run();
  orm
    .insert(schema.account)
    .values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

if (import.meta.main) {
  const email = flag("--email");
  const name = flag("--name");
  const password = flag("--password");
  if (email === undefined || name === undefined || password === undefined) {
    console.error("Usage: bun run admin:create -- --email EMAIL --name NAME --password PASSWORD");
    process.exit(1);
  }
  const database = openDatabase(databasePath());
  applyMigrations(database);
  seed(database);
  await createFirstSuperAdmin(database, { email, name, password });
  database.close();
}
