#!/usr/bin/env node
/**
 * Lightweight `prisma migrate deploy` for SQLite, used by the Docker image so the
 * runtime does not need the full Prisma CLI (~300 MB). It applies every folder in
 * prisma/migrations in order and records them in Prisma's own `_prisma_migrations`
 * table with the same checksum scheme, so `prisma migrate` keeps working on the
 * same database in development.
 */
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
if (!url.startsWith("file:")) {
  console.error(`migrate: only SQLite file URLs are supported, got ${url}`);
  process.exit(1);
}
const dbPath = url.slice("file:".length);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const migrationsDir = path.resolve("prisma/migrations");
const folders = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
  .map((d) => d.name)
  .sort();

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
  );
`);

const applied = new Set(db.prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`).all().map((r) => r.migration_name));
const insert = db.prepare(
  `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
   VALUES (?, ?, current_timestamp, ?, NULL, current_timestamp, 1)`,
);

let count = 0;
for (const name of folders) {
  if (applied.has(name)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  console.log(`Applying migration \`${name}\``);
  db.transaction(() => {
    db.exec(sql);
    insert.run(randomUUID(), checksum, name);
  })();
  count++;
}
db.close();
console.log(count ? `${count} migration(s) applied.` : "Database is up to date.");
