import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "@autobs/logger";
import { openDb } from "@autobs/storage";
import { createTaskOrchestrator } from "@autobs/task-orchestrator";
import { createBrowserPool } from "@autobs/browser-pool";
import { createCrawlStage, createPipeline, createRenderStage } from "@autobs/pipeline";

const logger = createLogger({ name: "server" });
const port = Number(process.env.PORT ?? 8787);

function sendJson(res: any, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

function notFound(res: any) {
  sendJson(res, 404, { error: "not_found" });
}

function methodNotAllowed(res: any) {
  sendJson(res, 405, { error: "method_not_allowed" });
}

function ok(res: any, body: unknown) {
  sendJson(res, 200, body);
}

function toArtifactUrl(dataDir: string, filePath: string): string {
  const rel = path.relative(dataDir, filePath).split(path.sep).join("/");
  return `/artifacts/${rel}`;
}

type Runtime = {
  dataDir: string;
  db: Awaited<ReturnType<typeof openDb>>;
  browserPool: ReturnType<typeof createBrowserPool>;
  orchestrator: ReturnType<typeof createTaskOrchestrator>;
};

async function createRuntime(): Promise<Runtime> {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), "data");
  const db = await openDb({ dataDir });
  const browserPool = createBrowserPool({ logger });
  const pipeline = createPipeline([createCrawlStage(), createRenderStage()], logger);
  const orchestrator = createTaskOrchestrator({
    db,
    logger,
    runTaskItem: async ({ taskId, taskItemId, pageId }) => {
      try {
        const results = await pipeline.run({ db, dataDir, browserPool, taskId, taskItemId, pageId });
        db.raw.prepare("UPDATE task_items SET result = ? WHERE id = ?").run(JSON.stringify(results), taskItemId);
      } catch (e) {
        const payload = { kind: "error", message: String(e) };
        db.raw.prepare("UPDATE task_items SET result = ? WHERE id = ?").run(JSON.stringify(payload), taskItemId);
        throw e;
      }
    }
  });
  await orchestrator.start();
  return { dataDir, db, browserPool, orchestrator };
}

const runtimePromise = createRuntime();

const server = createServer(async (req, res) => {
  if (!req.url) return notFound(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
    res.end();
    return;
  }

  const u = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const pathname = u.pathname;

  if (pathname === "/health") {
    return ok(res, { ok: true });
  }

  const rt = await runtimePromise;

  if (pathname.startsWith("/artifacts/") && req.method === "GET") {
    const rel = pathname.replace("/artifacts/", "");
    const target = path.resolve(rt.dataDir, rel);
    if (!target.startsWith(rt.dataDir + path.sep) && target !== rt.dataDir) return notFound(res);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return notFound(res);

    const ext = path.extname(target).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    });
    fs.createReadStream(target).pipe(res);
    return;
  }

  if (pathname === "/api/projects" && req.method === "GET") {
    const rows = rt.db.raw
      .prepare("SELECT id, name, base_url AS baseUrl, created_at AS createdAt FROM projects ORDER BY created_at DESC")
      .all();
    return ok(res, { projects: rows });
  }

  if (pathname === "/api/projects" && req.method === "POST") {
    const body = (await readJson(req)) as any;
    const id = randomUUID();
    rt.db.raw
      .prepare("INSERT INTO projects (id, name, base_url) VALUES (?, ?, ?)")
      .run(id, String(body?.name ?? "Untitled"), String(body?.baseUrl ?? ""));
    return ok(res, { id });
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    if (req.method === "GET") {
      const project = rt.db.raw
        .prepare("SELECT id, name, base_url AS baseUrl, crawl_rules AS crawlRules, compare_config AS compareConfig FROM projects WHERE id = ?")
        .get(projectId);
      const pages = rt.db.raw
        .prepare("SELECT id, url, content_hash AS contentHash, screenshot_path AS screenshotPath FROM pages WHERE project_id = ? ORDER BY url")
        .all(projectId);
      return ok(res, { project, pages });
    }
    if (req.method === "PUT") {
      const body = (await readJson(req)) as any;
      rt.db.raw
        .prepare("UPDATE projects SET name = ?, base_url = ? WHERE id = ?")
        .run(String(body?.name ?? "Untitled"), String(body?.baseUrl ?? ""), projectId);
      return ok(res, { ok: true });
    }
    return methodNotAllowed(res);
  }

  const projectPagesMatch = pathname.match(/^\/api\/projects\/([^/]+)\/pages$/);
  if (projectPagesMatch) {
    const projectId = projectPagesMatch[1];
    if (req.method !== "POST") return methodNotAllowed(res);
    const body = (await readJson(req)) as any;
    const id = randomUUID();
    rt.db.raw
      .prepare("INSERT INTO pages (id, project_id, url, cached_at) VALUES (?, ?, ?, datetime('now'))")
      .run(id, projectId, String(body?.url ?? ""));
    return ok(res, { id });
  }

  const projectTasksMatch = pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (projectTasksMatch) {
    const projectId = projectTasksMatch[1];
    if (req.method !== "POST") return methodNotAllowed(res);
    const body = (await readJson(req)) as any;
    const pageIds: string[] =
      Array.isArray(body?.pageIds) && body.pageIds.length > 0
        ? body.pageIds.map((x: any) => String(x))
        : (rt.db.raw.prepare("SELECT id FROM pages WHERE project_id = ?").all(projectId) as any[]).map((r) => r.id);
    const { taskId } = await rt.orchestrator.createTask({ projectId, pageIds });
    return ok(res, { taskId });
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch) {
    const taskId = taskMatch[1];
    if (req.method === "GET") {
      const task = rt.db.raw
        .prepare("SELECT id, project_id AS projectId, status, progress, created_at AS createdAt, completed_at AS completedAt FROM tasks WHERE id = ?")
        .get(taskId);
      const items = (rt.db.raw
        .prepare(
          `
          SELECT
            i.id,
            i.page_id AS pageId,
            i.status,
            i.retry_count AS retryCount,
            i.result,
            e.screenshot_path AS screenshotPath
          FROM task_items i
          LEFT JOIN executions e ON e.task_item_id = i.id
          WHERE i.task_id = ?
          ORDER BY i.id
        `
        )
        .all(taskId) as any[]).map((r) => ({
        ...r,
        screenshotUrl: r.screenshotPath ? toArtifactUrl(rt.dataDir, r.screenshotPath) : null
      }));
      return ok(res, { task, items });
    }
    return methodNotAllowed(res);
  }

  const taskActionMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/(pause|resume|cancel)$/);
  if (taskActionMatch) {
    const taskId = taskActionMatch[1];
    const action = taskActionMatch[2];
    if (req.method !== "POST") return methodNotAllowed(res);
    if (action === "pause") await rt.orchestrator.setTaskStatus({ taskId, status: "paused" });
    if (action === "resume") await rt.orchestrator.setTaskStatus({ taskId, status: "running" });
    if (action === "cancel") await rt.orchestrator.setTaskStatus({ taskId, status: "cancelled" });
    return ok(res, { ok: true });
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const taskId = u.searchParams.get("taskId");
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*"
    });

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    const tick = () => {
      if (closed) return;
      const payload =
        taskId && taskId.length > 0
          ? {
              task: rt.db.raw
                .prepare("SELECT id, status, progress FROM tasks WHERE id = ?")
                .get(taskId),
              items: rt.db.raw
                .prepare("SELECT id, status, page_id AS pageId FROM task_items WHERE task_id = ?")
                .all(taskId)
            }
          : {
              tasks: rt.db.raw.prepare("SELECT id, status, progress FROM tasks ORDER BY created_at DESC LIMIT 20").all()
            };
      res.write(`event: snapshot\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    req.on("close", () => clearInterval(interval));
    return;
  }

  if (pathname === "/api/secrets" && req.method === "GET") {
    const zhipu = process.env.ZHIPU_API_KEY ? `****${process.env.ZHIPU_API_KEY.slice(-4)}` : null;
    const qwen = process.env.QWEN_API_KEY ? `****${process.env.QWEN_API_KEY.slice(-4)}` : null;
    const deepseek = process.env.DEEPSEEK_API_KEY ? `****${process.env.DEEPSEEK_API_KEY.slice(-4)}` : null;
    return ok(res, { mode: "env_only", providers: { zhipu, qwen, deepseek } });
  }

  return notFound(res);
});

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "listening");
});
