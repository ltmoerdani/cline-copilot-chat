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
  // ── Current ClinePass catalog — synced with Cline 4.1.26 ────────────────
  // Limits are read from the catalog Cline itself ships (@cline/llms), i.e. the
  // same numbers the Cline extension uses. Refresh with `npm run check-models`.
  "cline-pass/kimi-k3.1-pro":              { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "cline-pass/minimax-m3.1-flash":         { contextWindow: 1_048_576, maxOutputTokens: 524_288 },
  "cline-pass/deepseek-v4.1-flash-1017":   { contextWindow: 1_048_576, maxOutputTokens: 393_216 },
  "cline-pass/deepseek-v4.1-flash":        { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "cline-pass/mimo-v2.6-flash":            { contextWindow: 1_050_000, maxOutputTokens: 131_072 },
  "cline-pass/mimo-v2.6-pro":              { contextWindow: 1_050_000, maxOutputTokens: 131_072 },
  "cline-pass/glm-5.3":                    { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "cline-pass/glm-5.3-flash":              { contextWindow: 1_048_576, maxOutputTokens: 943_717 },
  "cline-pass/deepseek-v4-pro":            { contextWindow: 1_048_576, maxOutputTokens: 384_000 },
  "cline-pass/qwen3.8-max":                { contextWindow: 262_144,   maxOutputTokens: 128_000 },
  "cline-pass/muse-spark-1.3-contributor": { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "cline-pass/kimi-k3":                    { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "cline-pass/minimax-m3":                 { contextWindow: 1_048_576, maxOutputTokens: 512_000 },
  "cline-pass/qwen3.7-plus":               { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  "cline-pass/qwen3.7-max":                { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  "cline-pass/glm-5.2":                    { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  // ── Retired from ClinePass ───────────────────────────────────────────────
  // No longer offered on the subscription. Kept here (guardrail: never delete
  // bundled metadata) so stale picker selections / cached requests still
  // resolve limits instead of silently falling back to DEFAULT_LIMITS.
  "cline-pass/kimi-k2.7-code":             { contextWindow: 262_144,   maxOutputTokens: 262_144 },
  "cline-pass/kimi-k2.6":                  { contextWindow: 262_144,   maxOutputTokens: 65_536 },
  "cline-pass/deepseek-v4-flash":          { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "cline-pass/mimo-v2.5":                  { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "cline-pass/mimo-v2.5-pro":              { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
};

// ── Cline pay-per-use models (vendor/model format) ────────────────────────

export const CLINE_MODELS: Record<string, ModelLimits> = {
  // ── Current pay-per-use catalog (verified against /api/v1/models) ────────
  // Vendor prefixes are the ones Cline actually serves: x-ai/, z-ai/,
  // moonshotai/, xiaomi/, mistralai/, meta-llama/. Where a model has a
  // ClinePass twin the numbers come from Cline's own catalog; the rest use
  // conservative documented values so VS Code truncates history instead of
  // letting the request fail with a context-length 400.
  // DeepSeek
  "deepseek/deepseek-v4.1-flash-1017": { contextWindow: 1_048_576, maxOutputTokens: 393_216 },
  "deepseek/deepseek-v4.1-flash":      { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "deepseek/deepseek-v4-pro":          { contextWindow: 1_048_576, maxOutputTokens: 384_000 },
  "deepseek/deepseek-v4-flash":        { contextWindow: 1_000_000, maxOutputTokens: 384_000 },
  "deepseek/deepseek-chat":            { contextWindow: 64_000,    maxOutputTokens: 8_192 },
  // Anthropic
  "anthropic/claude-opus-5.5":         { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  "anthropic/claude-sonnet-5.5":       { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  "anthropic/claude-haiku-5.5":        { contextWindow: 200_000,   maxOutputTokens: 32_000 },
  "anthropic/claude-opus-5":           { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  "anthropic/claude-fable-5.1":        { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  // OpenAI
  "openai/gpt-6.1-terra-pro":          { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  "openai/gpt-6.1-terra":              { contextWindow: 200_000,   maxOutputTokens: 64_000 },
  "openai/gpt-5":                      { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  "openai/o3":                         { contextWindow: 200_000,   maxOutputTokens: 100_000 },
  "openai/gpt-4o":                     { contextWindow: 128_000,   maxOutputTokens: 16_384 },
  // Google
  "google/gemini-4-argon":             { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  "google/gemini-2.5-pro":             { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  // xAI / Grok
  "x-ai/grok-4.7":                     { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  "x-ai/grok-4.6":                     { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  "x-ai/grok-4.20":                    { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  // Z.ai / GLM
  "z-ai/glm-5.3":                      { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "z-ai/glm-5.3-flash":                { contextWindow: 1_048_576, maxOutputTokens: 943_717 },
  "z-ai/glm-5.2":                      { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  // Moonshot / Kimi
  "moonshotai/kimi-k3.1-pro":          { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "moonshotai/kimi-k3":                { contextWindow: 1_048_576, maxOutputTokens: 943_718 },
  "moonshotai/kimi-k2.7-code":         { contextWindow: 262_144,   maxOutputTokens: 262_144 },
  // MiMo
  "xiaomi/mimo-v2.6-pro":              { contextWindow: 1_050_000, maxOutputTokens: 131_072 },
  "xiaomi/mimo-v2.6-flash":            { contextWindow: 1_050_000, maxOutputTokens: 131_072 },
  "xiaomi/mimo-v2.5-pro":              { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  // MiniMax
  "minimax/minimax-m3.1-flash":        { contextWindow: 1_048_576, maxOutputTokens: 524_288 },
  "minimax/minimax-m3":                { contextWindow: 1_048_576, maxOutputTokens: 512_000 },
  "minimax/minimax-m2.5":              { contextWindow: 204_800,   maxOutputTokens: 131_072 },
  // Qwen
  "qwen/qwen3.8-max-prime":            { contextWindow: 262_144,   maxOutputTokens: 128_000 },
  "qwen/qwen3.8-max-0902":             { contextWindow: 262_144,   maxOutputTokens: 128_000 },
  "qwen/qwen3.8-flash":                { contextWindow: 262_144,   maxOutputTokens: 65_536 },
  "qwen/qwen3.7-max":                  { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  "qwen/qwen3.7-plus":                 { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  // Mistral
  "mistralai/mistral-large-4-0":       { contextWindow: 256_000,   maxOutputTokens: 32_000 },
  "mistralai/mistral-large":           { contextWindow: 128_000,   maxOutputTokens: 8_192 },
  // Meta
  "meta-llama/llama-4-maverick":       { contextWindow: 1_000_000, maxOutputTokens: 8_192 },
  // Perplexity
  "perplexity/sonar-pro":              { contextWindow: 127_072,   maxOutputTokens: 8_192 },
  // ── Retired / renamed pay-per-use IDs ───────────────────────────────────
  // Delisted from the Cline catalog, or superseded by the vendor prefixes
  // above (xai/ → x-ai/, zai/ → z-ai/, moonshot/ → moonshotai/,
  // mimo/ → xiaomi/, mistral/ → mistralai/, meta/ → meta-llama/).
  // Kept for metadata resolution only — never advertised in the picker.
  "deepseek/deepseek-v3":              { contextWindow: 64_000,    maxOutputTokens: 8_192 },
  "deepseek/deepseek-r1":              { contextWindow: 64_000,    maxOutputTokens: 16_384 },
  "xai/grok-3":                        { contextWindow: 131_072,   maxOutputTokens: 16_384 },
  "xai/grok-4":                        { contextWindow: 256_000,   maxOutputTokens: 16_384 },
  "zai/glm-5.2":                       { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "moonshot/kimi-k3":                  { contextWindow: 1_000_000, maxOutputTokens: 131_072 },
  "moonshot/kimi-k2.7-code":           { contextWindow: 262_144,   maxOutputTokens: 262_144 },
  "moonshot/kimi-k2.6":                { contextWindow: 262_144,   maxOutputTokens: 65_536 },
  "mimo/mimo-v2.5":                    { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "mimo/mimo-v2.5-pro":                { contextWindow: 1_000_000, maxOutputTokens: 128_000 },
  "qwen/qwen3.8-max":                  { contextWindow: 1_000_000, maxOutputTokens: 65_536 },
  "mistral/mistral-large":             { contextWindow: 128_000,   maxOutputTokens: 8_192 },
  "meta/llama-4-maverick":             { contextWindow: 1_000_000, maxOutputTokens: 8_192 },
  "cohere/command-r-plus":             { contextWindow: 128_000,   maxOutputTokens: 4_096 },
};

const DEFAULT_LIMITS: ModelLimits = { contextWindow: 128_000, maxOutputTokens: 65_536 };

// Vision-capable models.
// ClinePass entries are taken verbatim from the catalog Cline ships: an entry
// counts as vision-capable when its `capabilities` array contains "images".
// Pay-per-use entries follow the provider docs (OpenAI, xAI, Google, Anthropic,
// Mistral, Meta, Kimi, MiniMax M3, Alibaba Bailian) — text-only families
// (DeepSeek chat/reasoning line, GLM, Sonar, Command R+, non-VL MiMo) stay out.
const VISION_CAPABLE_MODELS = new Set([
  // ClinePass — from Cline's catalog `capabilities`
  "cline-pass/kimi-k3.1-pro",
  "cline-pass/minimax-m3.1-flash",
  "cline-pass/deepseek-v4.1-flash-1017",
  "cline-pass/deepseek-v4.1-flash",
  "cline-pass/mimo-v2.6-flash",
  "cline-pass/mimo-v2.6-pro",
  "cline-pass/glm-5.3-flash",
  "cline-pass/qwen3.8-max",
  "cline-pass/muse-spark-1.3-contributor",
  "cline-pass/kimi-k3",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-plus",
  // ClinePass — retired, kept for cached references
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  // Pay-per-use
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-opus-5",
  "anthropic/claude-fable-5.1",
  "openai/gpt-6.1-terra-pro",
  "openai/gpt-6.1-terra",
  "openai/gpt-4o",
  "openai/gpt-5",
  "openai/o3",
  "google/gemini-4-argon",
  "google/gemini-2.5-pro",
  "x-ai/grok-4.7",
  "x-ai/grok-4.6",
  "x-ai/grok-4.20",
  "moonshotai/kimi-k3.1-pro",
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k2.7-code",
  "xiaomi/mimo-v2.6-pro",
  "xiaomi/mimo-v2.6-flash",
  "minimax/minimax-m3.1-flash",
  "minimax/minimax-m3",
  "qwen/qwen3.8-max-prime",
  "qwen/qwen3.8-max-0902",
  "qwen/qwen3.7-plus",
  "mistralai/mistral-large-4-0",
  "mistralai/mistral-large",
  "meta-llama/llama-4-maverick",
  // Pay-per-use — retired, kept for cached references
  "xai/grok-3",
  "xai/grok-4",
  "moonshot/kimi-k3",
  "moonshot/kimi-k2.7-code",
  "moonshot/kimi-k2.6",
  "minimax/minimax-m3",
  "qwen/qwen3.8-max",
  "mistral/mistral-large",
  "meta/llama-4-maverick",
]);

// All ClinePass models expose reasoning/thinking controls in Cline's catalog;
// pay-per-use entries list the reasoning-capable families.
const REASONING_MODELS = new Set([
  // ClinePass
  "cline-pass/kimi-k3.1-pro",
  "cline-pass/minimax-m3.1-flash",
  "cline-pass/deepseek-v4.1-flash-1017",
  "cline-pass/deepseek-v4.1-flash",
  "cline-pass/mimo-v2.6-flash",
  "cline-pass/mimo-v2.6-pro",
  "cline-pass/glm-5.3",
  "cline-pass/glm-5.3-flash",
  "cline-pass/deepseek-v4-pro",
  "cline-pass/qwen3.8-max",
  "cline-pass/muse-spark-1.3-contributor",
  "cline-pass/kimi-k3",
  "cline-pass/minimax-m3",
  "cline-pass/qwen3.7-max",
  "cline-pass/qwen3.7-plus",
  "cline-pass/glm-5.2",
  // ClinePass — retired, kept for cached references
  "cline-pass/kimi-k2.7-code",
  "cline-pass/kimi-k2.6",
  "cline-pass/deepseek-v4-flash",
  "cline-pass/mimo-v2.5",
  "cline-pass/mimo-v2.5-pro",
  // Pay-per-use
  "deepseek/deepseek-v4.1-flash-1017",
  "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5",
  "anthropic/claude-fable-5.1",
  "openai/gpt-6.1-terra-pro",
  "openai/gpt-6.1-terra",
  "openai/o3",
  "google/gemini-4-argon",
  "google/gemini-2.5-pro",
  "x-ai/grok-4.7",
  "x-ai/grok-4.6",
  "x-ai/grok-4.20",
  "z-ai/glm-5.3",
  "z-ai/glm-5.3-flash",
  "z-ai/glm-5.2",
  "moonshotai/kimi-k3.1-pro",
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k2.7-code",
  "xiaomi/mimo-v2.6-pro",
  "xiaomi/mimo-v2.6-flash",
  "xiaomi/mimo-v2.5-pro",
  "minimax/minimax-m3.1-flash",
  "minimax/minimax-m3",
  "minimax/minimax-m2.5",
  "qwen/qwen3.8-max-prime",
  "qwen/qwen3.8-max-0902",
  "qwen/qwen3.8-flash",
  "qwen/qwen3.7-max",
  "qwen/qwen3.7-plus",
  // Pay-per-use — retired, kept for cached references
  "deepseek/deepseek-r1",
  "zai/glm-5.2",
  "moonshot/kimi-k3",
  "moonshot/kimi-k2.7-code",
  "moonshot/kimi-k2.6",
  "mimo/mimo-v2.5",
  "mimo/mimo-v2.5-pro",
  "qwen/qwen3.8-max",
]);

/**
 * Models CONFIRMED (via live API probe, Issue #3) to be rejected with
 * HTTP 403 "only available via Cline product surfaces" when requested with
 * a public API key. Cline moved these off the API-key path; they now only
 * work inside the Cline IDE extension / CLI with an account token.
 *
 * RULES:
 * - Keep the entries in CLINE_MODELS / CLINEPASS_MODELS above intact — the
 *   bundled limits snapshot must stay complete (guardrail: never delete
 *   bundled metadata).
 * - Only add a model here after a live 403 with the exact "product surfaces"
 *   message — do not guess. Suspect models stay advertised until confirmed.
 * - Entries are hidden from the model picker but metadata remains resolvable
 *   for any cached requests that still reference them.
 */
export const PRODUCT_SURFACES_ONLY_MODELS = new Set<string>([
  // Confirmed 2026-08-18 via curl with a valid key (Issue #3, SPIERWIN):
  // "Error 403: deepseek/deepseek-v4-flash is only available via Cline
  //  product surfaces."
  "deepseek/deepseek-v4-flash",
]);

/** Whether a model ID is confirmed blocked from the public API-key path. */
export function isProductSurfacesOnlyModel(modelId: string): boolean {
  return PRODUCT_SURFACES_ONLY_MODELS.has(modelId);
}

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
