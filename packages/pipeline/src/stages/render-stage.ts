import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Stage } from "../index";

export function createRenderStage(): Stage {
  return {
    name: "render",
    async shouldRun(ctx) {
      const out = path.join(ctx.dataDir, "screenshots", `${ctx.taskItemId}.png`);
      try {
        await fs.stat(out);
        return false;
      } catch {
        return true;
      }
    },
    async execute(ctx) {
      const pageRow = ctx.db.raw.prepare("SELECT url FROM pages WHERE id = ?").get(ctx.pageId) as any;
      const url = String(pageRow?.url ?? "");

      const dir = path.join(ctx.dataDir, "screenshots");
      await fs.mkdir(dir, { recursive: true });
      const out = path.join(dir, `${ctx.taskItemId}.png`);

      if (!ctx.browserPool) throw new Error("browser_pool_missing");
      await ctx.browserPool.screenshot({ url, filePath: out });

      const executionId = randomUUID();
      ctx.db.raw
        .prepare("INSERT INTO executions (id, task_item_id, screenshot_path) VALUES (?, ?, ?)")
        .run(executionId, ctx.taskItemId, out);

      return { stage: "render", kind: "ok", outputPath: out };
    }
  };
}
