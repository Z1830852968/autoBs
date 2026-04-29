import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createLogger } from "@autobs/logger";
import { createBrowserPool } from "@autobs/browser-pool";
import { openDb } from "@autobs/storage";
import { createCrawlStage, createPipeline, createRenderStage } from "../src/index";

test("pipeline crawl+render writes artifacts and execution row", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-pipe-"));
  const db = await openDb({ dataDir: dir });

  const projectId = randomUUID();
  const pageId = randomUUID();
  const taskId = randomUUID();
  const taskItemId = randomUUID();

  db.raw.prepare("INSERT INTO projects (id, name, base_url) VALUES (?, ?, ?)").run(projectId, "p", "http://x");
  db.raw.prepare("INSERT INTO pages (id, project_id, url) VALUES (?, ?, ?)").run(pageId, projectId, "http://x/a");
  db.raw
    .prepare("INSERT INTO tasks (id, project_id, status, progress, created_at) VALUES (?, ?, 'running', 0, datetime('now'))")
    .run(taskId, projectId);
  db.raw
    .prepare("INSERT INTO task_items (id, task_id, page_id, status, retry_count) VALUES (?, ?, ?, 'pending', 0)")
    .run(taskItemId, taskId, pageId);

  const logger = createLogger({ name: "test", level: "error" });
  const browserPool = createBrowserPool({ logger, mock: true });
  const pipeline = createPipeline([createCrawlStage(), createRenderStage()], logger);
  const results = await pipeline.run({ db, dataDir: dir, browserPool, taskId, taskItemId, pageId });
  assert.equal(results.length, 2);

  const screenshotPath = results.find((r) => r.stage === "render")?.outputPath;
  assert.ok(screenshotPath);
  await fs.stat(screenshotPath!);

  const execRow = db.raw.prepare("SELECT screenshot_path FROM executions WHERE task_item_id = ?").get(taskItemId) as any;
  assert.equal(execRow.screenshot_path, screenshotPath);

  await browserPool.close();
  await db.close();
});
