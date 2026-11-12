import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

/**
 * Open SQLite and turn foreign keys on.
 * File databases also use WAL so readers do not block the one writer.
 *
 * @param filename - A filesystem path or `:memory:`.
 */
export function openDatabase(filename: string): Database {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const database = new Database(filename, { create: true });
  database.exec("PRAGMA foreign_keys = ON");
  if (filename !== ":memory:") {
    database.exec("PRAGMA journal_mode = WAL");
  }
  return database;
}

/**
 * Path from `DATABASE_URL`, which looks like `sqlite:./data/app.db`.
 */
export function databasePath(): string {
  const raw = process.env.DATABASE_URL ?? "sqlite:./data/app.db";
  return raw.startsWith("sqlite:") ? raw.slice("sqlite:".length) : raw;
}
