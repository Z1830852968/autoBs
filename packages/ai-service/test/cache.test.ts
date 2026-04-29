import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLogger } from "@autobs/logger";
import { openDb } from "@autobs/storage";
import { createAiService } from "../src/index";

test("ai service caches by image_hash + prompt_hash", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "autobs-ai-"));
  const db = await openDb({ dataDir: dir });

  let calls = 0;
  const ai = createAiService({
    db,
    logger: createLogger({ name: "test", level: "error" }),
    providers: [
      {
        id: "mock",
        async analyzeImage() {
          calls += 1;
          return { text: "ok", model: "mock" };
        }
      }
    ]
  });

  const r1 = await ai.analyzeImage({ imageBase64: "a", promptId: "p1", prompt: "hi" });
  const r2 = await ai.analyzeImage({ imageBase64: "a", promptId: "p1", prompt: "hi" });

  assert.equal(r1.kind, "ok");
  assert.equal(r2.cached, true);
  assert.equal(calls, 1);

  await db.close();
});

