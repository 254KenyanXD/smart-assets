import { databasePath, openDatabase } from "@/db/client";
import { applyMigrations } from "@/db/migrate";
import { seed } from "@/db/seed";
import { createAuth, type AppAuth } from "@/lib/auth";

const store = globalThis as typeof globalThis & { smartAssetsAuth?: AppAuth };

function requiredSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret.length < 16) {
    throw new Error("BETTER_AUTH_SECRET is required.");
  }
  return secret;
}

function origins(baseURL: string): string[] {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? baseURL;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function boot(): AppAuth {
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const database = openDatabase(databasePath());
  applyMigrations(database);
  seed(database);
  return createAuth({
    database,
    secret: requiredSecret(),
    baseURL,
    trustedOrigins: origins(baseURL),
  });
}

/**
 * Process-wide auth instance.
 * Hot reload reuses it so the SQLite connection and the directory layer stay one.
 */
export const { auth, orm, runtime, database } = (store.smartAssetsAuth ??= boot());
