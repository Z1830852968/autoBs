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

