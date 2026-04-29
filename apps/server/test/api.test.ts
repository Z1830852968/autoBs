import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

async function waitForOk(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout");
}

test("server health and basic project/task flow", async () => {
  const port = 8790;
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-server-test-"));
  const child = spawn(
    "pnpm",
    ["exec", "tsx", "src/index.ts"],
    {
      cwd,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, AUTOBS_BROWSER_MOCK: "true" },
      stdio: "inherit",
      detached: true
    }
  );

  try {
    await waitForOk(`http://localhost:${port}/health`, 3000);

    const createProject = await fetch(`http://localhost:${port}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "p1", baseUrl: "http://example.com" })
    });
    assert.equal(createProject.status, 200);
    const { id: projectId } = (await createProject.json()) as any;
    assert.ok(projectId);

    const addPage = await fetch(`http://localhost:${port}/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://example.com/a" })
    });
    const { id: pageId } = (await addPage.json()) as any;
    assert.ok(pageId);

    const createTask = await fetch(`http://localhost:${port}/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageIds: [pageId] })
    });
    const { taskId } = (await createTask.json()) as any;
    assert.ok(taskId);

    const taskResp = await fetch(`http://localhost:${port}/api/tasks/${taskId}`);
    const taskPayload = (await taskResp.json()) as any;
    assert.equal(taskPayload.task.id, taskId);
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
