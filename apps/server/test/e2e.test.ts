import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

async function waitForJson(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return (await r.json()) as any;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout");
}

async function waitFor(condition: () => Promise<boolean>, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("timeout");
}

test("e2e creates task and serves screenshot artifact", async () => {
  const port = 8791;
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-server-e2e-"));
  const child = spawn("pnpm", ["exec", "tsx", "src/index.ts"], {
    cwd,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, AUTOBS_BROWSER_MOCK: "true" },
    stdio: "inherit",
    detached: true
  });

  try {
    await waitForJson(`http://localhost:${port}/health`, 3000);

    const createProject = await fetch(`http://localhost:${port}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "p1", baseUrl: "http://example.com" })
    });
    const { id: projectId } = (await createProject.json()) as any;

    const addPage = await fetch(`http://localhost:${port}/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://example.com/a" })
    });
    const { id: pageId } = (await addPage.json()) as any;

    const createTask = await fetch(`http://localhost:${port}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageIds: [pageId] })
    });
    const { taskId } = (await createTask.json()) as any;
    assert.ok(taskId);

    await waitFor(async () => {
      const payload = await waitForJson(`http://localhost:${port}/api/tasks/${taskId}`, 1000);
      return payload?.task?.status === "completed" && payload?.items?.[0]?.screenshotUrl;
    }, 4000);

    const payload = await waitForJson(`http://localhost:${port}/api/tasks/${taskId}`, 1000);
    const screenshotUrl = payload.items[0].screenshotUrl as string;
    const img = await fetch(`http://localhost:${port}${screenshotUrl}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
  } finally {
    await new Promise<void>((resolve) => {
      if (child.exitCode == null) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
      if (child.exitCode != null) return resolve();
      const t = setTimeout(() => {
        if (child.exitCode == null) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {}
        }
      }, 3000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
});
