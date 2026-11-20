import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Database } from "bun:sqlite";

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

export function databasePath(): string {
  const raw = process.env.DATABASE_URL ?? "sqlite:./data/app.db";
  return raw.startsWith("sqlite:") ? raw.slice("sqlite:".length) : raw;
}
