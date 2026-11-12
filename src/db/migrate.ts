import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { Database } from "bun:sqlite";

import { databasePath, openDatabase } from "@/db/client";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/**
 * Apply the generated SQL migrations to one database.
 *
 * @param database - Open SQLite database.
 */
export function applyMigrations(database: Database): void {
  migrate(drizzle(database), { migrationsFolder });
}

if (import.meta.main) {
  const database = openDatabase(databasePath());
  applyMigrations(database);
  database.close();
}
