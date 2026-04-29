import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

export type DbOptions = {
  dataDir: string;
};

export type Db = {
  readonly filePath: string;
  readonly raw: DatabaseSyncType;
  close: () => Promise<void>;
};

type Migration = {
  id: string;
  sql: string;
};

async function readMigrations(migrationsDir: string): Promise<Migration[]> {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations: Migration[] = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    migrations.push({ id: file, sql });
  }
  return migrations;
}

function ensureMetaTables(db: DatabaseSyncType) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function applyMigrations(db: DatabaseSyncType, migrations: Migration[]) {
  ensureMetaTables(db);

  const applied = new Set<string>(
    db.prepare("SELECT id FROM schema_migrations").all().map((r: any) => r.id)
  );

  const insert = db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, datetime('now'))");

  db.exec("BEGIN");
  try {
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      db.exec(m.sql);
      insert.run(m.id);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export async function openDb(options: DbOptions): Promise<Db> {
  const dataDir = path.resolve(options.dataDir);
  await fs.mkdir(dataDir, { recursive: true });

  const filePath = path.join(dataDir, "db.sqlite");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(filePath);

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const migrationsDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../migrations");
  const migrations = await readMigrations(migrationsDir);
  applyMigrations(db, migrations);

  return {
    filePath,
    raw: db,
    async close() {
      db.close();
    }
  };
}
