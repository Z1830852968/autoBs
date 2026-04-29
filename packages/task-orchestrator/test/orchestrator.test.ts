import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createLogger } from "@autobs/logger";
import { openDb } from "@autobs/storage";
import { createTaskOrchestrator } from "../src/index";

async function waitFor(condition: () => boolean, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timeout");
}

test("orchestrator runs pending items and completes task", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-orch-"));
  const db = await openDb({ dataDir: dir });

  const projectId = randomUUID();
  db.raw.prepare("INSERT INTO projects (id, name, base_url) VALUES (?, ?, ?)").run(projectId, "p", "http://x");

  const pageIds = [randomUUID(), randomUUID(), randomUUID()];
  for (const pageId of pageIds) {
    db.raw.prepare("INSERT INTO pages (id, project_id, url) VALUES (?, ?, ?)").run(pageId, projectId, `http://x/${pageId}`);
  }

  const logger = createLogger({ name: "test", level: "error" });
  const orchestrator = createTaskOrchestrator({ db, logger });
  const { taskId } = await orchestrator.createTask({ projectId, pageIds });
  await orchestrator.start();

  await waitFor(() => {
    const row = db.raw.prepare("SELECT status, progress FROM tasks WHERE id = ?").get(taskId) as any;
    return row?.status === "completed" && Number(row?.progress) === 1;
  }, 2000);

  await orchestrator.stop();
  await db.close();
});

test("orchestrator recovers running items to pending on restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-orch-"));
  const db = await openDb({ dataDir: dir });

  const projectId = randomUUID();
  db.raw.prepare("INSERT INTO projects (id, name, base_url) VALUES (?, ?, ?)").run(projectId, "p", "http://x");

  const pageId = randomUUID();
  db.raw.prepare("INSERT INTO pages (id, project_id, url) VALUES (?, ?, ?)").run(pageId, projectId, `http://x/${pageId}`);

  const taskId = randomUUID();
  const taskItemId = randomUUID();
  db.raw
    .prepare("INSERT INTO tasks (id, project_id, status, progress, created_at) VALUES (?, ?, 'running', 0, datetime('now'))")
    .run(taskId, projectId);
  db.raw
    .prepare("INSERT INTO task_items (id, task_id, page_id, status, retry_count) VALUES (?, ?, ?, 'running', 0)")
    .run(taskItemId, taskId, pageId);

  const logger = createLogger({ name: "test", level: "error" });
  const orchestrator = createTaskOrchestrator({ db, logger });
  await orchestrator.start();

  const row = db.raw.prepare("SELECT status FROM task_items WHERE id = ?").get(taskItemId) as any;
  assert.equal(row.status, "pending");

  await orchestrator.stop();
  await db.close();
});

