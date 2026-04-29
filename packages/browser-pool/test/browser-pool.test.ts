import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLogger } from "@autobs/logger";
import { createBrowserPool } from "../src/index";

test("browser pool mock screenshot writes file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-bp-"));
  const filePath = path.join(dir, "a.png");

  const pool = createBrowserPool({ logger: createLogger({ name: "test", level: "error" }), mock: true });
  await pool.screenshot({ url: "http://example.com", filePath });
  const stat = await fs.stat(filePath);
  assert.ok(stat.size > 0);
  await pool.close();
});

test("browser pool env mock screenshot writes file", async () => {
  const prev = process.env.AUTOBS_BROWSER_MOCK;
  process.env.AUTOBS_BROWSER_MOCK = "true";

  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-bp-env-"));
    const filePath = path.join(dir, "a.png");

    const pool = createBrowserPool({ logger: createLogger({ name: "test", level: "error" }) });
    await pool.screenshot({ url: "http://example.com", filePath });
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0);
    await pool.close();
  } finally {
    if (prev === undefined) delete process.env.AUTOBS_BROWSER_MOCK;
    else process.env.AUTOBS_BROWSER_MOCK = prev;
  }
});
