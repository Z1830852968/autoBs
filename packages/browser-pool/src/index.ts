import fs from "node:fs/promises";
import type { Logger } from "@autobs/logger";
import type { Browser, Page } from "playwright-core";
import { Semaphore } from "./semaphore";

const oneByOnePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAn8B9p7gkQAAAABJRU5ErkJggg==";

export type BrowserPoolOptions = {
  logger: Logger;
  concurrency?: number;
  mock?: boolean;
  blockResources?: boolean;
};

export type ScreenshotInput = {
  url: string;
  filePath: string;
  timeoutMs?: number;
};

export type BrowserPool = {
  screenshot: (input: ScreenshotInput) => Promise<void>;
  close: () => Promise<void>;
};

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  if (v === "1" || v === "true" || v === "yes" || v === "y" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "n" || v === "off") return false;
  return undefined;
}

async function createPage(browser: Browser, blockResources: boolean): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();

  if (blockResources) {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font") {
        route.abort();
        return;
      }
      route.continue();
    });
  }

  page.once("close", () => context.close().catch(() => {}));
  return page;
}

export function createBrowserPool(options: BrowserPoolOptions): BrowserPool {
  const sem = new Semaphore(options.concurrency ?? 4);
  const mockFromEnv = parseBooleanEnv(process.env.AUTOBS_BROWSER_MOCK);
  const mock = options.mock ?? mockFromEnv ?? false;
  const blockResources = options.blockResources ?? true;

  let browserPromise: Promise<Browser> | undefined;

  if (mock) {
    options.logger.warn(
      { source: options.mock !== undefined ? "options" : "env", env: process.env.AUTOBS_BROWSER_MOCK },
      "browser_pool_mock_enabled"
    );
  }

  async function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
      browserPromise = (async () => {
        const { chromium } = await import("playwright-core");
        return chromium.launch({ headless: true });
      })();
    }
    return browserPromise;
  }

  return {
    async screenshot(input) {
      if (mock) {
        options.logger.info({ url: input.url, filePath: input.filePath }, "screenshot_mocked");
        await fs.writeFile(input.filePath, Buffer.from(oneByOnePngBase64, "base64"));
        return;
      }

      const release = await sem.acquire();
      try {
        const browser = await getBrowser();
        const page = await createPage(browser, blockResources);
        try {
          await page.goto(input.url, { waitUntil: "load", timeout: input.timeoutMs ?? 30000 });
          await page.screenshot({ path: input.filePath, fullPage: true });
        } finally {
          await page.close();
        }
      } catch (e) {
        const hint =
          "Playwright 截图失败。若是首次运行或提示找不到浏览器，可执行：pnpm playwright:install";
        options.logger.error({ err: String(e), url: input.url, hint }, "screenshot_failed");
        throw new Error(`${hint}; err=${String(e)}`);
      } finally {
        release();
      }
    },
    async close() {
      const p = browserPromise;
      browserPromise = undefined;
      if (!p) return;
      const b = await p;
      await b.close();
    }
  };
}
