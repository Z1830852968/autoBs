import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { openDb } from "../src/index";

test("migrations create core tables and are idempotent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-db-"));

  const db1 = await openDb({ dataDir: dir });
  const tables1 = db1.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r: any) => r.name);
  assert.ok(tables1.includes("projects"));
  assert.ok(tables1.includes("tasks"));
  await db1.close();

  const db2 = await openDb({ dataDir: dir });
  const tables2 = db2.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r: any) => r.name);
  assert.ok(tables2.includes("schema_migrations"));
  await db2.close();
});
