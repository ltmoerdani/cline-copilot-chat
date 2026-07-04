/**
 * Vendor + routing type definitions for Cline Copilot Chat.
 *
 * Two providers from a single API key:
 *   1. **Cline** — pay-per-use billing (100+ models: DeepSeek, Claude, GPT, Gemini…)
 *   2. **ClinePass** — $9.99/mo subscription for 10 curated open-weight models
 *      with 2–5× rate limits.
 *
 * Both share the same endpoint (api.cline.bot) and the same API key.
 * The model-ID prefix (`deepseek/` vs `cline-pass/`) determines billing.
 */

// ── Vendor constants ───────────────────────────────────────────────────────

/** Pay-per-use provider — 100+ models billed per token. */
export const CLINE_VENDOR = "cline" as const;

/** Subscription provider — 10 curated models, flat $9.99/mo. */
export const CLINE_PASS_VENDOR = "cline-pass" as const;

/** Base vendor type for per-provider code paths. */
export type ProviderVendor = typeof CLINE_VENDOR | typeof CLINE_PASS_VENDOR;

/** Union of all vendor IDs (payg + pass). */
export type AllProviderVendor = typeof CLINE_VENDOR | typeof CLINE_PASS_VENDOR;

// ── API base URL ───────────────────────────────────────────────────────────

export const BASE_URL = "https://api.cline.bot/api/v1";
