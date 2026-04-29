import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function waitForJson(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return (await r.json()) as any;
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("timeout");
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("timeout");
}

function readPngSize(buf: Buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(sig), "not_png");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

const run = process.env.AUTOBS_REAL_E2E === "true";

(run ? test : test.skip)("real e2e: local static site → task → real screenshot", async () => {
  const fixturePath = fileURLToPath(new URL("./fixtures/static-site/index.html", import.meta.url));
  const html = await fs.readFile(fixturePath, "utf8");

  const site = createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    res.writeHead(404).end("not_found");
  });

  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", () => resolve()));
  const sitePort = (site.address() as any).port as number;
  const baseUrl = `http://127.0.0.1:${sitePort}`;

  const serverPort = 8792;
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-real-e2e-"));

  const child = spawn("pnpm", ["exec", "tsx", "src/index.ts"], {
    cwd,
    env: { ...process.env, PORT: String(serverPort), DATA_DIR: dataDir, AUTOBS_REAL_E2E: "true" },
    stdio: "inherit",
    detached: true
  });

  try {
    await waitForJson(`http://localhost:${serverPort}/health`, 10000);

    const createProject = await fetch(`http://localhost:${serverPort}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "real", baseUrl })
    });
    const { id: projectId } = (await createProject.json()) as any;

    const addPage = await fetch(`http://localhost:${serverPort}/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `${baseUrl}/index.html` })
    });
    const { id: pageId } = (await addPage.json()) as any;

    const createTask = await fetch(`http://localhost:${serverPort}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageIds: [pageId] })
    });
    const { taskId } = (await createTask.json()) as any;
    assert.ok(taskId);

    await waitFor(async () => {
      const payload = await waitForJson(`http://localhost:${serverPort}/api/tasks/${taskId}`, 2000);
      return payload?.task?.status === "completed" && payload?.items?.[0]?.screenshotUrl;
    }, 30000);

    const payload = await waitForJson(`http://localhost:${serverPort}/api/tasks/${taskId}`, 2000);
    const screenshotUrl = payload.items[0].screenshotUrl as string;
    const img = await fetch(`http://localhost:${serverPort}${screenshotUrl}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    const buf = Buffer.from(await img.arrayBuffer());
    const { width, height } = readPngSize(buf);
    assert.ok(width > 10 && height > 10, `unexpected_size:${width}x${height}`);
    assert.ok(buf.length > 2000, `unexpected_bytes:${buf.length}`);
  } finally {
    if (child.exitCode == null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await new Promise<void>((resolve) => {
      if (child.exitCode != null) return resolve();
      const t = setTimeout(() => {
        if (child.exitCode == null) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }
      }, 4000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
});
