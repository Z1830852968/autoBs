import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import type { Logger } from "@autobs/logger";
import type { AiService } from "@autobs/ai-service";
import type { Db } from "@autobs/storage";

export type CompareVerdict = "pass" | "fail" | "unknown";

export type CompareResult = {
  verdict: CompareVerdict;
  ssimScore?: number;
  pixelDiffRatio?: number;
  aiJudgment?: string;
  comparisonId?: string;
};

export type ImageProcessorOptions = {
  logger: Logger;
  aiService?: AiService;
  ssimThreshold?: number;
  pixelPassThreshold?: number;
  pixelFailThreshold?: number;
  aiGrayZoneMin?: number;
  aiGrayZoneMax?: number;
};

export type ImageProcessor = {
  compare: (input: {
    baselinePath: string;
    currentPath: string;
    db?: Db;
    executionId?: string;
  }) => Promise<CompareResult>;
};

function toGrayscale(png: PNG): Float64Array {
  const out = new Float64Array(png.width * png.height);
  for (let i = 0; i < png.width * png.height; i += 1) {
    const idx = i * 4;
    const r = png.data[idx] ?? 0;
    const g = png.data[idx + 1] ?? 0;
    const b = png.data[idx + 2] ?? 0;
    out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}

function computeSsim(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  if (n === 0) return 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;

  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  varA /= n;
  varB /= n;
  cov /= n;

  const c1 = 6.5025;
  const c2 = 58.5225;
  const num = (2 * meanA * meanB + c1) * (2 * cov + c2);
  const den = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2);
  if (den === 0) return 0;
  const ssim = num / den;
  return Math.max(0, Math.min(1, ssim));
}

function computePixelDiffRatio(pngA: PNG, pngB: PNG): number {
  if (pngA.width !== pngB.width || pngA.height !== pngB.height) return 1;
  const pixels = pngA.width * pngA.height;
  let diff = 0;
  for (let i = 0; i < pixels; i += 1) {
    const idx = i * 4;
    if (
      pngA.data[idx] !== pngB.data[idx] ||
      pngA.data[idx + 1] !== pngB.data[idx + 1] ||
      pngA.data[idx + 2] !== pngB.data[idx + 2] ||
      pngA.data[idx + 3] !== pngB.data[idx + 3]
    ) {
      diff += 1;
    }
  }
  return diff / pixels;
}

async function readPng(filePath: string): Promise<PNG> {
  const buf = await fs.readFile(filePath);
  return PNG.sync.read(buf);
}

export function createImageProcessor(options: ImageProcessorOptions): ImageProcessor {
  const ssimThreshold = options.ssimThreshold ?? 0.98;
  const pixelPass = options.pixelPassThreshold ?? 0.005;
  const pixelFail = options.pixelFailThreshold ?? 0.3;
  const grayMin = options.aiGrayZoneMin ?? pixelPass;
  const grayMax = options.aiGrayZoneMax ?? pixelFail;

  return {
    async compare(input) {
      const a = await readPng(input.baselinePath);
      const b = await readPng(input.currentPath);

      if (a.width !== b.width || a.height !== b.height) {
        const r = { verdict: "fail" as const, ssimScore: 0, pixelDiffRatio: 1 };
        if (input.db && input.executionId) {
          const id = randomUUID();
          input.db.raw
            .prepare(
              "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(id, input.executionId, input.baselinePath, input.currentPath, r.ssimScore, r.pixelDiffRatio, null, r.verdict);
          return { ...r, comparisonId: id };
        }
        return r;
      }

      const ssimScore = computeSsim(toGrayscale(a), toGrayscale(b));
      if (ssimScore >= ssimThreshold) {
        const r = { verdict: "pass" as const, ssimScore };
        if (input.db && input.executionId) {
          const id = randomUUID();
          input.db.raw
            .prepare(
              "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, null, null, r.verdict);
          return { ...r, comparisonId: id };
        }
        return r;
      }

      const pixelDiffRatio = computePixelDiffRatio(a, b);
      if (pixelDiffRatio <= pixelPass) {
        const r = { verdict: "pass" as const, ssimScore, pixelDiffRatio };
        if (input.db && input.executionId) {
          const id = randomUUID();
          input.db.raw
            .prepare(
              "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, pixelDiffRatio, null, r.verdict);
          return { ...r, comparisonId: id };
        }
        return r;
      }
      if (pixelDiffRatio >= pixelFail) {
        const r = { verdict: "fail" as const, ssimScore, pixelDiffRatio };
        if (input.db && input.executionId) {
          const id = randomUUID();
          input.db.raw
            .prepare(
              "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, pixelDiffRatio, null, r.verdict);
          return { ...r, comparisonId: id };
        }
        return r;
      }

      if (options.aiService && pixelDiffRatio >= grayMin && pixelDiffRatio <= grayMax) {
        try {
          const prompt =
            "请判断两张截图在功能上是否相同，只回答 same / different / unknown。";
          const r = await options.aiService.analyzeImage({ imageBase64: "", promptId: "compare", prompt });
          const aiJudgment = r.text;
          const verdict: CompareVerdict =
            aiJudgment.includes("same") ? "pass" : aiJudgment.includes("different") ? "fail" : "unknown";
          const out = { verdict, ssimScore, pixelDiffRatio, aiJudgment };
          if (input.db && input.executionId) {
            const id = randomUUID();
            input.db.raw
              .prepare(
                "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
              )
              .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, pixelDiffRatio, aiJudgment, verdict);
            return { ...out, comparisonId: id };
          }
          return out;
        } catch (e) {
          options.logger.warn({ err: String(e) }, "ai_compare_failed");
          const out = { verdict: "unknown" as const, ssimScore, pixelDiffRatio, aiJudgment: "unknown" };
          if (input.db && input.executionId) {
            const id = randomUUID();
            input.db.raw
              .prepare(
                "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
              )
              .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, pixelDiffRatio, out.aiJudgment, out.verdict);
            return { ...out, comparisonId: id };
          }
          return out;
        }
      }

      const out = { verdict: "unknown" as const, ssimScore, pixelDiffRatio };
      if (input.db && input.executionId) {
        const id = randomUUID();
        input.db.raw
          .prepare(
            "INSERT INTO comparisons (id, execution_id, baseline_image_path, current_image_path, ssim_score, pixel_diff_ratio, ai_judgment, final_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .run(id, input.executionId, input.baselinePath, input.currentPath, ssimScore, pixelDiffRatio, null, out.verdict);
        return { ...out, comparisonId: id };
      }
      return out;
    }
  };
}
