import { createHash } from "node:crypto";
import type { Logger } from "@autobs/logger";
import type { Db } from "@autobs/storage";

export type AiResult = {
  kind: "ok" | "fallback";
  text: string;
  cached: boolean;
};

export type AiProviderResult = {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
};

export type AiProvider = {
  id: string;
  analyzeImage: (input: { imageBase64: string; prompt: string }) => Promise<AiProviderResult>;
};

export type AiServiceOptions = {
  db: Db;
  logger: Logger;
  providers: AiProvider[];
  cacheTtlMs?: number;
  maxAttemptsPerProvider?: number;
};

export type AiService = {
  analyzeImage: (input: { imageBase64: string; promptId: string; prompt: string; pageId?: string }) => Promise<AiResult>;
};

type BreakerState = {
  failures: number;
  openUntil: number;
};

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function createAiService(options: AiServiceOptions): AiService {
  const ttlMs = options.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  const maxAttempts = options.maxAttemptsPerProvider ?? 3;
  const breakers = new Map<string, BreakerState>();

  function isOpen(providerId: string): boolean {
    const s = breakers.get(providerId);
    if (!s) return false;
    return Date.now() < s.openUntil;
  }

  function markSuccess(providerId: string) {
    breakers.delete(providerId);
  }

  function markFailure(providerId: string) {
    const prev = breakers.get(providerId) ?? { failures: 0, openUntil: 0 };
    const failures = prev.failures + 1;
    const openUntil = failures >= 3 ? Date.now() + 30_000 : 0;
    breakers.set(providerId, { failures, openUntil });
  }

  return {
    async analyzeImage(input) {
      const imageHash = sha256(input.imageBase64);
      const promptHash = sha256(`${input.promptId}:${input.prompt}`);

      const cachedRow = options.db.raw
        .prepare(
          "SELECT result FROM ai_cache WHERE image_hash = ? AND prompt_hash = ? AND expires_at > datetime('now')"
        )
        .get(imageHash, promptHash) as any;
      if (cachedRow?.result) {
        return { kind: "ok", text: String(cachedRow.result), cached: true };
      }

      for (const provider of options.providers) {
        if (isOpen(provider.id)) continue;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const r = await provider.analyzeImage({ imageBase64: input.imageBase64, prompt: input.prompt });
            markSuccess(provider.id);

            const expiresAt = new Date(Date.now() + ttlMs).toISOString();
            options.db.raw
              .prepare(
                "INSERT OR REPLACE INTO ai_cache (image_hash, prompt_hash, result, expires_at) VALUES (?, ?, ?, ?)"
              )
              .run(imageHash, promptHash, r.text, expiresAt);

            if (input.pageId) {
              options.db.raw
                .prepare(
                  "INSERT INTO ai_usage (id, page_id, provider, model, input_tokens, output_tokens, cost_usd, cached) VALUES (?, ?, ?, ?, ?, ?, ?, 0)"
                )
                .run(
                  sha256(`${Date.now()}:${Math.random()}`),
                  input.pageId,
                  provider.id,
                  r.model,
                  Number(r.inputTokens ?? 0),
                  Number(r.outputTokens ?? 0),
                  Number(r.costUsd ?? 0)
                );
            }

            return { kind: "ok", text: r.text, cached: false };
          } catch (e) {
            options.logger.warn({ err: String(e), provider: provider.id, attempt }, "ai_provider_failed");
            if (attempt === maxAttempts) markFailure(provider.id);
          }
        }
      }

      return { kind: "fallback", text: "未分析", cached: false };
    }
  };
}
