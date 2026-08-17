**Status:** 🟢 Active

# New Models & Spec Corrections (Kimi K3, Qwen3.8 Max)

**Topic:** models / provider / vision / reasoning / billing  
**Updated:** 2026-08-17  
**Tags:** #models #provider #cline #clinepass #vision #reasoning #kimi #qwen #glm  
**Supersedes:** —

---

## Overview

Added **two new ClinePass models** (Kimi K3, Qwen3.8 Max) and their pay-per-use twins,
and corrected several model specs (context window, max output, vision) against the
official provider documentation. ClinePass grows from **10 → 12 models**; Cline
pay-per-use grows from **23 → 25 models**.

---

## New Models

### 1. Kimi K3 — `cline-pass/kimi-k3` + `moonshot/kimi-k3`

Kimi's flagship model (2.8T params, first open-source 3T-class model). Built on Kimi
Delta Attention (KDA) + Attention Residuals, native visual understanding, 1M context.

| Field | Value | Source |
|---|---|---|
| Context window | 1,000,000 (1M) | [platform.kimi.ai pricing](https://platform.kimi.ai/docs/pricing/chat-k3) |
| Max output | 131,072 (default `max_completion_tokens`, up to 1,048,576) | [Kimi K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) |
| Vision | ✅ (base64 image + video) | Kimi K3 quickstart |
| Reasoning | ✅ (always on, `reasoning_effort` low/high/max) | Kimi K3 quickstart |
| ClinePass ref price | $3.00 in / $15.00 out per 1M | docs.cline.bot ClinePass |

### 2. Qwen3.8 Max — `cline-pass/qwen3.8-max` + `qwen/qwen3.8-max`

Qwen's flagship model, positioned against GPT-5.5 / Claude Opus 4.7 / Gemini 3.1 Pro.

| Field | Value | Source |
|---|---|---|
| Context window | 1,000,000 (1M) | [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/text-generation-model/) |
| Max output | 65,536 | Qwen3.7-max pattern (verified) |
| Vision | ✅ (image & video understanding) | Alibaba vision-model list |
| Reasoning | ✅ (thinking mode) | Alibaba text-generation table |
| ClinePass ref price | $2.00 in / $6.00 out per 1M | docs.cline.bot ClinePass |

---

## Spec Corrections (verified from provider docs)

| Model | Field | Before | After | Source |
|---|---|---|---|---|
| **GLM-5.2** (`cline-pass` + `zai`) | Max output | 131,072 | **128,000** | [docs.z.ai GLM-5.2](https://docs.z.ai/guides/llm/glm-5.2): "Maximum Output Tokens: 128K" |
| **GLM-5.2** (`cline-pass` + `zai`) | Vision | ✅ | **❌** | Z.ai: Input/Output Modalities = **Text** only (separate GLM-5V line for vision) |
| **Kimi K2.6** (`cline-pass` + `moonshot`) | Context | 256,000 | **262,144** | [platform.kimi.ai K2.6](https://platform.kimi.ai/docs/pricing/chat-k26) |
| **Kimi K2.7 Code** (`cline-pass` + `moonshot`) | Context | 256,000 | **262,144** | [platform.kimi.ai K2.7 Code](https://platform.kimi.ai/docs/pricing/chat-k27-code) |

### Confirmed correct (no change)
- **DeepSeek V4 Pro/Flash**: 1M / 384K ✅
- **Qwen3.7 Max/Plus**: 1M / 65K ✅
- **MiniMax M3**: 192K / 131K, vision ✅ (multimodal chat input)
- **MiMo V2.5/V2.5 Pro**: text-only (not in vision set) ✅

---

## Architecture Pattern: Pay-Per-Use Twin

Every ClinePass model has a **pay-per-use twin**:

```
cline-pass/X  ↔  vendor/X
```

| ClinePass | Pay-per-use |
|---|---|
| `cline-pass/kimi-k3` | `moonshot/kimi-k3` |
| `cline-pass/qwen3.8-max` | `qwen/qwen3.8-max` |
| `cline-pass/kimi-k2.7-code` | `moonshot/kimi-k2.7-code` |
| `cline-pass/qwen3.7-max` | `qwen/qwen3.7-max` |
| ... | ... |

> **Rule:** When adding a ClinePass model, ALWAYS add the pay-per-use twin too —
> in `metadata.ts` (`CLINE_MODELS` + vision/reasoning sets) and `extension.ts`
> (`CLINE_MODEL_DEFS`).

---

## Files Changed

| File | Change |
|---|---|
| `src/metadata.ts` | + `cline-pass/kimi-k3`, `cline-pass/qwen3.8-max`, `moonshot/kimi-k3`, `qwen/qwen3.8-max`; GLM-5.2 maxOutput 131072→128000 + removed from vision; Kimi K2.6/K2.7 context 256000→262144 |
| `src/extension.ts` | + Kimi K3, Qwen3.8 Max to `CLINEPASS_MODEL_DEFS` and `CLINE_MODEL_DEFS`; comment count 10→12 |
| `src/providerTypes.ts` | comment count 10→12 |
| `README.md` | ClinePass table 10→12 models; pay-per-use table + Kimi K3, Qwen3.8 Max; corrected GLM-5.2 & Kimi specs |

---

## Verification

- ✅ `npm run compile` passes with no errors
- Model specs cross-checked against official provider docs (Kimi, Alibaba, Z.ai, DeepSeek)

---

## Vision-Capable Models (final)

**ClinePass (6):** Kimi K3, Kimi K2.7 Code, Kimi K2.6, MiniMax M3, Qwen3.8 Max, Qwen3.7 Plus

**Cline pay-per-use (12):** GPT-4o, GPT-5, o3, Gemini 2.5 Pro, Grok 3, Grok 4, Kimi K3,
Kimi K2.7 Code, Kimi K2.6, MiniMax M3, Qwen3.8 Max, Qwen3.7 Plus, Mistral Large, Llama 4 Maverick

> **Note:** GLM-5.2 is **not** vision-capable (text-only per Z.ai docs).
