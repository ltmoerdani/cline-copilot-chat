/**
 * Cline Copilot Chat — model metadata.
 *
 * Two providers share one API key:
 *   1. Cline (pay-per-use) — models with `provider/model` IDs
 *   2. ClinePass ($9.99/mo) — models with `cline-pass/model` IDs
 *
 * Specs verified from official provider docs (DeepSeek API,
 * Alibaba Bailian, Moonshot, MiniMax, Anthropic, OpenAI, Google).
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

// ── ClinePass models ($9.99/mo subscription) ──────────────────────────────

export const CLINEPASS_MODELS: Record<string, ModelLimits> = {
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

// ── Cline pay-per-use models (vendor/model format) ────────────────────────

export const CLINE_MODELS: Record<string, ModelLimits> = {
  // DeepSeek
  "deepseek/deepseek-v4-flash":     { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "deepseek/deepseek-v4-pro":       { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "deepseek/deepseek-v3":           { contextWindow: 64_000,    maxOutputTokens: 8_192 },
  "deepseek/deepseek-r1":           { contextWindow: 64_000,    maxOutputTokens: 16_384 },
  "deepseek/deepseek-chat":         { contextWindow: 64_000,    maxOutputTokens: 8_192 },
  // OpenAI
  "openai/gpt-4o":                  { contextWindow: 128_000,   maxOutputTokens: 16_384 },
  "openai/gpt-5":                   { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  "openai/o3":                      { contextWindow: 200_000,   maxOutputTokens: 100_000 },
  // Google
  "google/gemini-2.5-pro":          { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  // xAI / Grok
  "xai/grok-3":                     { contextWindow: 131_072,   maxOutputTokens: 16_384 },
  "xai/grok-4":                     { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  // Z.ai / GLM
  "zai/glm-5.2":                    { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  // Moonshot / Kimi
  "moonshot/kimi-k2.7-code":        { contextWindow: 256_000,   maxOutputTokens: 262_144 },
  "moonshot/kimi-k2.6":             { contextWindow: 256_000,   maxOutputTokens: 65_536 },
  // MiMo
  "mimo/mimo-v2.5":                 { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "mimo/mimo-v2.5-pro":             { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  // MiniMax
  "minimax/minimax-m3":             { contextWindow: 192_000,   maxOutputTokens: 131_072 },
  // Qwen
  "qwen/qwen3.7-max":              { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  "qwen/qwen3.7-plus":             { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  // Mistral
  "mistral/mistral-large":          { contextWindow: 128_000,   maxOutputTokens: 8_192 },
  // Meta
  "meta/llama-4-maverick":          { contextWindow: 1_000_000, maxOutputTokens: 8_192 },
  // Perplexity
  "perplexity/sonar-pro":           { contextWindow: 127_072,   maxOutputTokens: 8_192 },
  // Cohere
  "cohere/command-r-plus":          { contextWindow: 128_000,   maxOutputTokens: 4_096 },
};

const DEFAULT_LIMITS: ModelLimits = { contextWindow: 128_000, maxOutputTokens: 65_536 };

// Vision-capable models (confirmed via official provider docs, Jul 2026)
// Sources: OpenAI ("all latest models support vision"), xAI (image input docs),
// Mistral (vision model list), Meta ("natively multimodal"), Kimi (text/image/video),
// MiniMax M3 ("多模态 Chat 输入"), Alibaba Bailian (vision understanding list).
// NOTE: MiMo V2.5/V2.5 Pro REMOVED — MiMo-7B is reasoning-only text model, no
// vision evidence in any official source. DeepSeek V3/V4/R1/Chat are text-only
// (separate DeepSeek-VL line exists for vision). Cohere Command R+ is text-only
// (separate Command A Vision model). Perplexity Sonar is text-only search.
const VISION_CAPABLE_MODELS = new Set([
  // ClinePass
  "cline-pass/glm-5.2",
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-plus",
  // Pay-per-use
  "openai/gpt-4o",
  "openai/gpt-5",
  "openai/o3",
  "google/gemini-2.5-pro",
  "xai/grok-3",
  "xai/grok-4",
  "zai/glm-5.2",
  "moonshot/kimi-k2.7-code",
  "moonshot/kimi-k2.6",
  "minimax/minimax-m3",
  "qwen/qwen3.7-plus",
  "mistral/mistral-large",
  "meta/llama-4-maverick",
]);

// All models support reasoning/thinking mode
const REASONING_MODELS = new Set([
  // ClinePass
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
  // Pay-per-use
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-r1",
  "openai/o3",
  "google/gemini-2.5-pro",
  "zai/glm-5.2",
  "moonshot/kimi-k2.7-code",
  "moonshot/kimi-k2.6",
  "mimo/mimo-v2.5",
  "mimo/mimo-v2.5-pro",
  "qwen/qwen3.7-max",
  "qwen/qwen3.7-plus",
]);

/** Merged lookup table for resolveModelMetadata(). */
const ALL_MODEL_LIMITS: Record<string, ModelLimits> = {
  ...CLINEPASS_MODELS,
  ...CLINE_MODELS,
};

export function resolveModelMetadata(modelId: string): ResolvedModelMetadata {
  const limits = ALL_MODEL_LIMITS[modelId] ?? DEFAULT_LIMITS;
  return {
    ...limits,
    supportsVision: VISION_CAPABLE_MODELS.has(modelId),
    reasoning: REASONING_MODELS.has(modelId),
    source: "bundled",
  };
}
