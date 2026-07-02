**Status:** ✅ Solved

# Pay-Per-Use Model ID Validation — 404 Fix

**Topic:** models / provider / api / billing / validation  
**Updated:** 2026-07-02  
**Tags:** #models #provider #api #billing #validation #cline #pay-per-use #404  
**Supersedes:** —

---

## Overview

After implementing the dual-provider architecture (Cline pay-per-use + ClinePass subscription),
all pay-per-use model requests returned HTTP 404 "model not found" while ClinePass models worked
perfectly (200 OK). This document covers the root cause — invalid model IDs — and the API
validation process used to find the correct model IDs.

---

## Problem

**Symptom:** Selecting any model under the **Cline** provider (pay-per-use) in VS Code's model
picker resulted in HTTP 404:

```
HTTP 404: {"error":"model not found","success":false}
```

Meanwhile, **ClinePass** models worked correctly (200 OK via subscription).

**Impact:** The entire Cline pay-per-use provider was non-functional. Users could see 13 models
in the picker but none could be used.

---

## Root Cause

The initial model ID list was assembled from Cline API documentation examples and general
provider naming conventions. However, the Cline API has a **specific catalog** of available
models — not all `vendor/model` combinations are valid. Invalid model IDs return 404, valid
ones return 402 (insufficient credits) or 200 (success).

**Invalid model IDs that caused 404:**

| Model ID | Issue |
|---|---|
| `anthropic/claude-sonnet-4-6` | Not available on Cline API (despite being in docs) |
| `anthropic/claude-haiku-4-5` | Not available on Cline API |
| `deepseek/deepseek-reasoner` | Wrong name — API uses `deepseek/deepseek-r1` |
| `openai/gpt-4o-mini` | Not available — API has `openai/gpt-4o`, `openai/gpt-5`, `openai/o3` |
| `google/gemini-2.5-flash` | Not available — API has `google/gemini-2.5-pro` |
| `qwen/qwen3-coder` | Not available — API has `qwen/qwen3.7-max`, `qwen/qwen3.7-plus` |
| `minimax/minimax-m2.5` | Not available as free — API has `minimax/minimax-m3` |
| `zhipu/glm-5` | Wrong vendor prefix — API uses `zai/glm-5.2` |
| `moonshot/kimi-k2` | Not available — API uses `moonshot/kimi-k2.7-code`, `moonshot/kimi-k2.6` |

---

## Validation Process

### Method

Tested each model ID directly against the Cline API (`https://api.cline.bot/api/v1/chat/completions`)
using curl with a valid ClinePass API key. The API response distinguishes:

| HTTP Status | Meaning | Action |
|---|---|---|
| **200 OK** | Model exists and account has access | ✅ Include in provider |
| **402 Payment Required** | Model exists but credits needed | ✅ Include in provider |
| **404 Not Found** | Model ID not recognized by API | ❌ Remove from provider |
| **400 Bad Request** | Invalid format (not `vendor/model`) | ❌ Fix format |

### API Test Results

**DeepSeek (5 models):**

| Model ID | HTTP | Status |
|---|---|---|
| `deepseek/deepseek-v4-flash` | 200 | ✅ OK — free model, no credits needed |
| `deepseek/deepseek-v4-pro` | 402 | ✅ Valid — credits required |
| `deepseek/deepseek-v3` | 402 | ✅ Valid |
| `deepseek/deepseek-r1` | 402 | ✅ Valid |
| `deepseek/deepseek-chat` | 402 | ✅ Valid |

**OpenAI (3 models):**

| Model ID | HTTP | Status |
|---|---|---|
| `openai/gpt-4o` | 402 | ✅ Valid |
| `openai/gpt-5` | 402 | ✅ Valid |
| `openai/o3` | 402 | ✅ Valid |

**Google (1 model):**

| Model ID | HTTP | Status |
|---|---|---|
| `google/gemini-2.5-pro` | 402 | ✅ Valid |

**xAI / Grok (2 models):**

| Model ID | HTTP | Status |
|---|---|---|
| `xai/grok-3` | 402 | ✅ Valid |
| `xai/grok-4` | 402 | ✅ Valid |

**Open-weight providers (8 models):**

| Model ID | HTTP | Status |
|---|---|---|
| `zai/glm-5.2` | 402 | ✅ Valid |
| `moonshot/kimi-k2.7-code` | 402 | ✅ Valid |
| `moonshot/kimi-k2.6` | 402 | ✅ Valid |
| `mimo/mimo-v2.5` | 402 | ✅ Valid |
| `mimo/mimo-v2.5-pro` | 402 | ✅ Valid |
| `minimax/minimax-m3` | 402 | ✅ Valid |
| `qwen/qwen3.7-max` | 402 | ✅ Valid |
| `qwen/qwen3.7-plus` | 402 | ✅ Valid |

**Other providers (4 models):**

| Model ID | HTTP | Status |
|---|---|---|
| `mistral/mistral-large` | 402 | ✅ Valid |
| `meta/llama-4-maverick` | 402 | ✅ Valid |
| `perplexity/sonar-pro` | 402 | ✅ Valid |
| `cohere/command-r-plus` | 402 | ✅ Valid |

**Models removed (404 Not Found):**

| Model ID | HTTP | Reason |
|---|---|---|
| `anthropic/claude-sonnet-4-6` | 404 | Not on Cline API |
| `anthropic/claude-sonnet-4-5` | 404 | Not on Cline API |
| `anthropic/claude-opus-4-7` | 404 | Not on Cline API |
| `anthropic/claude-haiku-4-5` | 404 | Not on Cline API |
| `google/gemini-3-pro` | 404 | Not on Cline API |
| `deepseek/deepseek-reasoner` | 404 | Wrong name (use `deepseek-r1`) |

---

## Solution

Replaced the invalid model list with **23 validated pay-per-use models** that all return
402 (MODEL VALID) or 200 (OK) from the Cline API.

### Updated Model Catalog

**Cline (Pay-Per-Use) — 23 Models:**

| Family | Models |
|---|---|
| **DeepSeek** (5) | `deepseek-v4-flash` ⭐(200 OK free), `deepseek-v4-pro`, `deepseek-v3`, `deepseek-r1`, `deepseek-chat` |
| **OpenAI** (3) | `gpt-4o`, `gpt-5`, `o3` |
| **Google** (1) | `gemini-2.5-pro` |
| **xAI** (2) | `grok-3`, `grok-4` |
| **Z.ai** (1) | `glm-5.2` |
| **Moonshot** (2) | `kimi-k2.7-code`, `kimi-k2.6` |
| **MiMo** (2) | `mimo-v2.5`, `mimo-v2.5-pro` |
| **MiniMax** (1) | `minimax-m3` |
| **Qwen** (2) | `qwen3.7-max`, `qwen3.7-plus` |
| **Mistral** (1) | `mistral-large` |
| **Meta** (1) | `llama-4-maverick` |
| **Perplexity** (1) | `sonar-pro` |
| **Cohere** (1) | `command-r-plus` |

> ⭐ `deepseek/deepseek-v4-flash` is the only model that returns **200 OK** without credits —
> it's the recommended test model for verifying API connectivity.

**ClinePass ($9.99/mo Subscription) — 10 Models (unchanged):**

All 10 ClinePass models remain valid with `cline-pass/` prefix.

---

## Files Changed

- `src/extension.ts` — `CLINE_MODEL_DEFS` array: 13 → 23 models, all validated against API
- `src/metadata.ts` — `CLINE_MODELS` lookup table: updated to match new model IDs
- `src/metadata.ts` — `VISION_CAPABLE_MODELS` set: updated with valid model IDs
- `src/metadata.ts` — `REASONING_MODELS` set: updated with valid model IDs
- `src/extension.ts` — `testModelId` for Cline provider: `deepseek/deepseek-chat` → `deepseek/deepseek-v4-flash`

---

## Verification

### Compile

```
npx tsc -p ./
→ EXIT: 0 (no errors)
```

### API Test

```
deepseek/deepseek-v4-flash → 200 OK ✓ (free model)
xai/grok-4 → 402 (MODEL VALID)
perplexity/sonar-pro → 402 (MODEL VALID)
```

### Extension Test

After reload, selecting **Cline / DeepSeek V4 Flash** in VS Code Copilot Chat produces
a successful response (200 OK).

---

## Key Learnings

1. **Always validate model IDs against the API** — documentation examples may list models
   that aren't actually available. The only way to know is to test each `model` field.

2. **404 vs 402 distinction matters:**
   - **404** = model ID not recognized by API → remove it
   - **402** = model recognized but credits needed → keep it (valid for pay-per-use users)

3. **Model naming is API-specific** — `deepseek-reasoner` (DeepSeek's own API) ≠ `deepseek-r1`
   (Cline API). Don't assume names carry over between providers.

4. **`deepseek/deepseek-v4-flash` is free** — it returns 200 OK even with $0 balance.
   Use it as the default test model for connection verification.

5. **Anthropic models are NOT on Cline API** — despite being listed in Cline docs, all
   `anthropic/claude-*` variants return 404. This may change in the future; re-test periodically.

---

## Related Documents

- [02-20260702-provider-registration-duplicate-fix.md](./02-20260702-provider-registration-duplicate-fix.md) — ClinePass model ID format (`cline-pass/`)
- [03-20260702-dual-provider-vendor-rename-fix.md](./03-20260702-dual-provider-vendor-rename-fix.md) — Vendor rename + thinking regex fix
- [02-20260702-dual-provider-architecture.md](../features/02-20260702-dual-provider-architecture.md) — Dual provider architecture spec
