/**
 * Cline Copilot Chat — model metadata.
 *
 * Ten frontier open-weight models served via Cline's OpenAI-compatible
 * API at api.cline.bot. This covers ClinePass curated models and extends
 * to any future Cline-native model on the same endpoint.
 * Specs verified from official provider docs (DeepSeek API,
 * Alibaba Bailian, Moonshot, MiniMax).
 */

export interface ModelLimits {
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ResolvedModelMetadata extends ModelLimits {
  supportsVision: boolean;
  reasoning: boolean;
  source: "bundled";
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  "cline-pass/glm-5.2":             { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  "cline-pass/kimi-k2.7-code":      { contextWindow: 256_000,  maxOutputTokens: 262_144 },
  "cline-pass/kimi-k2.6":           { contextWindow: 256_000,  maxOutputTokens: 65_536 },
  "cline-pass/deepseek-v4-pro":     { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "cline-pass/deepseek-v4-flash":   { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "cline-pass/mimo-v2.5":           { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "cline-pass/mimo-v2.5-pro":       { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "cline-pass/minimax-m3":          { contextWindow: 192_000,  maxOutputTokens: 131_072 },
  "cline-pass/qwen3.7-max":         { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  "cline-pass/qwen3.7-plus":        { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
};

const DEFAULT_LIMITS: ModelLimits = { contextWindow: 128_000, maxOutputTokens: 65_536 };

// All Cline Copilot Chat models support vision via their underlying providers
// (confirmed via Bailian & Moonshot docs for these model families)
const VISION_CAPABLE_MODELS = new Set([
  "cline-pass/glm-5.2",
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  "cline-pass/mimo-v2.5",
  "cline-pass/mimo-v2.5-pro",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-plus",
]);

// All Cline Copilot Chat models support reasoning/thinking mode
// (confirmed via Bailian: all listed models support 思考模式)
const REASONING_MODELS = new Set([
  "cline-pass/glm-5.2",
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  "cline-pass/deepseek-v4-pro",
  "cline-pass/deepseek-v4-flash",
  "cline-pass/mimo-v2.5",
  "cline-pass/mimo-v2.5-pro",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-max",
  "cline-pass/qwen3.7-plus",
]);

export function resolveModelMetadata(modelId: string): ResolvedModelMetadata {
  const limits = MODEL_LIMITS[modelId] ?? DEFAULT_LIMITS;
  return {
    ...limits,
    supportsVision: VISION_CAPABLE_MODELS.has(modelId),
    reasoning: REASONING_MODELS.has(modelId),
    source: "bundled",
  };
}
