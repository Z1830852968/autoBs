import type { Db } from "@autobs/storage";
import type { Logger } from "@autobs/logger";
import type { BrowserPool } from "@autobs/browser-pool";

export { createCrawlStage } from "./stages/crawl-stage";
export { createRenderStage } from "./stages/render-stage";

export type StageContext = {
  db: Db;
  dataDir: string;
  browserPool?: BrowserPool;
  taskId: string;
  taskItemId: string;
  pageId: string;
};

export type StageResult = {
  stage: string;
  kind: "ok" | "skipped" | "failed" | "fallback";
  outputPath?: string;
  error?: string;
};

export type Stage = {
  name: string;
  shouldRun: (ctx: StageContext) => Promise<boolean>;
  execute: (ctx: StageContext) => Promise<StageResult>;
};

export type Pipeline = {
  run: (ctx: StageContext) => Promise<StageResult[]>;
};

export function createPipeline(stages: Stage[], logger: Logger): Pipeline {
  return {
    async run(ctx) {
      const results: StageResult[] = [];
      for (const stage of stages) {
        try {
          const should = await stage.shouldRun(ctx);
          if (!should) {
            results.push({ stage: stage.name, kind: "skipped" });
            continue;
          }

          const r = await stage.execute(ctx);
          results.push({ ...r, stage: stage.name });
          if (r.kind === "failed") break;
        } catch (e) {
          logger.error({ err: String(e), stage: stage.name }, "stage_crash");
          results.push({ stage: stage.name, kind: "failed", error: String(e) });
          break;
        }
      }
      return results;
    }
  };
}
