import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { createLogger } from "@autobs/logger";
import { openDb } from "@autobs/storage";
import { randomUUID } from "node:crypto";
import { createImageProcessor } from "../src/index";

async function writePng(filePath: string, width: number, height: number, fill: (i: number) => [number, number, number, number]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    const [r, g, b, a] = fill(i);
    const idx = i * 4;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  }
  await fs.writeFile(filePath, PNG.sync.write(png));
}

test("compare passes identical images", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-img-"));
  const a = path.join(dir, "a.png");
  const b = path.join(dir, "b.png");

  await writePng(a, 2, 2, () => [0, 0, 0, 255]);
  await writePng(b, 2, 2, () => [0, 0, 0, 255]);

  const p = createImageProcessor({ logger: createLogger({ name: "test", level: "error" }) });
  const r = await p.compare({ baselinePath: a, currentPath: b });
  assert.equal(r.verdict, "pass");
});

test("compare fails obvious differences", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-img-"));
  const a = path.join(dir, "a.png");
  const b = path.join(dir, "b.png");

  await writePng(a, 2, 2, () => [0, 0, 0, 255]);
  await writePng(b, 2, 2, (i) => (i < 3 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

  const p = createImageProcessor({ logger: createLogger({ name: "test", level: "error" }) });
  const r = await p.compare({ baselinePath: a, currentPath: b });
  assert.equal(r.verdict, "fail");
  assert.ok((r.pixelDiffRatio ?? 0) >= 0.3);
});

test("compare uses ai fallback in gray zone", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-img-"));
  const a = path.join(dir, "a.png");
  const b = path.join(dir, "b.png");

  await writePng(a, 4, 4, () => [0, 0, 0, 255]);
  await writePng(b, 4, 4, (i) => (i < 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

  const p = createImageProcessor({
    logger: createLogger({ name: "test", level: "error" }),
    aiService: {
      analyzeImage: async () => ({ kind: "ok", text: "same", cached: false })
    },
    pixelPassThreshold: 0.01,
    pixelFailThreshold: 0.3
  });
  const r = await p.compare({ baselinePath: a, currentPath: b });
  assert.equal(r.verdict, "pass");
  assert.equal(r.aiJudgment, "same");
});

test("compare writes comparisons row when db+executionId provided", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-img-"));
  const a = path.join(dir, "a.png");
  const b = path.join(dir, "b.png");

  await writePng(a, 2, 2, () => [0, 0, 0, 255]);
  await writePng(b, 2, 2, (i) => (i === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

  const db = await openDb({ dataDir: dir });
  const projectId = randomUUID();
  const pageId = randomUUID();
  const taskId = randomUUID();
  const taskItemId = randomUUID();
  const executionId = randomUUID();

  db.raw.prepare("INSERT INTO projects (id, name, base_url) VALUES (?, ?, ?)").run(projectId, "p", "http://x");
  db.raw.prepare("INSERT INTO pages (id, project_id, url) VALUES (?, ?, ?)").run(pageId, projectId, "http://x/a");
  db.raw
    .prepare("INSERT INTO tasks (id, project_id, status, progress, created_at) VALUES (?, ?, 'running', 0, datetime('now'))")
    .run(taskId, projectId);
  db.raw
    .prepare("INSERT INTO task_items (id, task_id, page_id, status, retry_count) VALUES (?, ?, ?, 'pending', 0)")
    .run(taskItemId, taskId, pageId);
  db.raw.prepare("INSERT INTO executions (id, task_item_id, screenshot_path) VALUES (?, ?, ?)").run(executionId, taskItemId, a);

  const p = createImageProcessor({ logger: createLogger({ name: "test", level: "error" }) });
  const r = await p.compare({ baselinePath: a, currentPath: b, db, executionId });
  assert.ok(r.comparisonId);

  const row = db.raw.prepare("SELECT id FROM comparisons WHERE id = ?").get(r.comparisonId) as any;
  assert.equal(row.id, r.comparisonId);

  await db.close();
});
