import fs from "node:fs/promises";
import path from "node:path";
import type { Stage } from "../index";

export function createCrawlStage(): Stage {
  return {
    name: "crawl",
    async shouldRun(ctx) {
      const out = path.join(ctx.dataDir, "pages", `${ctx.pageId}.json`);
      try {
        await fs.stat(out);
        return false;
      } catch {
        return true;
      }
    },
    async execute(ctx) {
      const row = ctx.db.raw.prepare("SELECT url FROM pages WHERE id = ?").get(ctx.pageId) as any;
      const url = String(row?.url ?? "");

      const dir = path.join(ctx.dataDir, "pages");
      await fs.mkdir(dir, { recursive: true });
      const out = path.join(dir, `${ctx.pageId}.json`);
      await fs.writeFile(out, JSON.stringify({ pageId: ctx.pageId, url, cachedAt: new Date().toISOString() }, null, 2));
      return { stage: "crawl", kind: "ok", outputPath: out };
    }
  };
}

