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
  const mock = options.mock ?? process.env.CI === "true";
  const blockResources = options.blockResources ?? true;

  let browserPromise: Promise<Browser> | undefined;

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
        options.logger.error({ err: String(e), url: input.url }, "screenshot_failed");
        await fs.writeFile(input.filePath, Buffer.from(oneByOnePngBase64, "base64"));
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
