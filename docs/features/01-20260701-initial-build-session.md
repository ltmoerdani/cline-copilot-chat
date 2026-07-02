**Status:** ✅ Solved

# Cline Copilot Chat — Initial Build Session

**Topic:** architecture / models / provider / vscode / byok  
**Updated:** 2026-07-01  
**Tags:** #architecture #models #provider #vscode #byok #cline-copilot-chat #copilot-chat

---

## Overview

This document captures the complete session that built the **Cline Copilot Chat** VS Code extension from scratch. The session covered research, architecture decisions, implementation, debugging, and verification. The end result is a working extension that registers 10 frontier open-weight models (DeepSeek V4, Qwen 3.7, MiMo V2.5, Kimi K2.7, GLM 5.2, MiniMax M3) in VS Code's native Copilot Chat model picker.

---

## Timeline

### 1. [2026-07-01] Research: ClinePass Release

**Problem:** User wanted to use ClinePass models in Copilot Chat instead of the full Cline extension.

**Research Findings:**
- ClinePass released 28 Jun – 1 Jul 2026 alongside Cline v4.0.0–v4.0.5
- OpenAI-compatible API at `https://api.cline.bot/api/v1/chat/completions`
- $9.99/mo subscription ($4.99 first month promo)
- 2-5x API rate limits vs standard access
- 10 curated open weight models
- Bearer token auth (same as OpenAI format)
- Can be used from any tool, not just Cline extension

**Conclusion:** Cline's OpenAI-compatible API (api.cline.bot) is fully compatible with VS Code Language Model Chat Provider API.

**Status:** ✅ Solved

---

### 2. [2026-07-01] Architecture Decision: Fork vs New

**Problem:** Two options considered:
1. Build a new extension focused solely on Cline
2. Build separate `cline-copilot-chat` extension

**Decision:** User chose separate extension for discoverability.

**Rationale:**
- Easier marketplace discovery
- Focused branding (Cline-only)
- Clean codebase without unused providers

**Status:** ✅ Solved

---

### 3. [2026-07-01] Implementation: Extension Scaffold

**Problem:** Build Cline-only extension from scratch.

**Files Created:**

| File | Purpose |
|------|---------|
| `src/extension.ts` | Provider lifecycle, model registration, request building, commands |
| `src/providerTypes.ts` | Vendor constant (`cline-copilot-chat`) |
| `src/metadata.ts` | Model limits, vision capabilities, bundled metadata |
| `src/thinking.ts` | Per-model-family thinking/reasoning controls (6 families) |
| `src/streaming.ts` | OpenAI-compatible SSE chat completions streaming |
| `src/errors.ts` | Cline Copilot Chat request error types, user-facing messages |
| `src/retry.ts` | HTTP retry helper for transient errors |

**Package.json Contributions:**
- Vendor: `cline-copilot-chat` (declared in `languageModelChatProviders`)
- Activation: `onStartupFinished` + `onLanguageModelChatProvider:cline-copilot-chat`
- Commands: `clineCopilotChat.manage`, `clineCopilotChat.setApiKey`, `clineCopilotChat.diagnostics`, `clineCopilotChat.setThinkingEffort`
- Configuration: `clineCopilotChat.*` settings (temperature, maxTokens, thinking per family, timeouts)

**Status:** ✅ Solved

---

### 4. [2026-07-01] Bug: Vendor ID Conflict

**Problem:** Extension activated but models did not appear in model picker.

**Root Cause:** Initial vendor ID was not unique enough.

**Solution:** Changed vendor ID to a unique identifier.

**Status:** ✅ Solved

---

### 5. [2026-07-01] Bug: Models Not Visible in Chat Picker

**Problem:** Extension activated successfully, `provideLanguageModelChatInformation` called 15+ times, but models never appeared in Copilot Chat model picker.

**Debug Output:**
```
[ClinePass] activate() START
[ClinePass] CLINEPASS_VENDOR = clinepass-chat
[ClinePass] ✅ registerLanguageModelChatProvider(clinepass-chat) succeeded
[ClinePass] provideLanguageModelChatInformation CALLED, configuration=null
```

**Root Cause:** `capabilities.toolCalling: false` caused Copilot Chat to filter out all models. Chat mode requires tool calling support.

**Solution:** Set `toolCalling: true` in model capabilities. Confirmed via Alibaba Bailian docs that all 10 ClinePass models support Function Calling.

**Files Changed:**
- `src/extension.ts`: `capabilities.toolCalling: true`

**Status:** ✅ Solved

---

### 6. [2026-07-01] Bug: API Key Not Resolved from SecretStorage

**Problem:** `provideLanguageModelChatInformation` received `configuration=null`, meaning VS Code's BYOK flow was not passing the API key.

**Root Cause:** Original code only checked `options.configuration?.apiKey`. When `configuration` is null (first picker resolution), it returned empty array `[]`.

**Solution:** Added fallback to `this.context.secrets.get(SECRET_KEY)` regardless of whether `configuration` is present. Always return models — validate key at request time.

**Files Changed:**
- `src/extension.ts`: `provideLanguageModelChatInformation` always returns 10 models

**Status:** ✅ Solved

---

### 7. [2026-07-01] Model Specs Verification

**Problem:** Initial model limits were uniform (128K/16K) across all models. Needed accurate per-model specs.

**Verification Process:**

| Source | Models Verified |
|--------|----------------|
| `api-docs.deepseek.com` | DeepSeek V4 Pro/Flash: 1M context, 384K max output |
| `help.aliyun.com/zh/model-studio/text-generation-model` | GLM 5.2, Kimi K2.7 Code, MiniMax M3, MiMo V2.5 Pro, Qwen3.7 Max/Plus |
| `platform.kimi.ai` | Kimi K2.6/K2.7 Code: 256K context, multimodal |
| `platform.minimaxi.com` | MiniMax M3: 192K context |

**Key Corrections:**

| Model | Before | After | Source |
|-------|--------|-------|--------|
| GLM 5.2 | 202K | **1M** | Bailian |
| Qwen3.7 Plus | 262K | **1M** | Bailian |
| MiniMax M3 | 512K | **192K** | Bailian |
| Kimi K2.6 | 262K | **256K** | Moonshot |

**Status:** ✅ Solved

---

## Final Solution

The extension is fully functional with:
- 10 ClinePass models registered in Copilot Chat model picker
- Accurate per-model specs (context, output, vision, reasoning)
- Thinking mode controls for 6 model families
- BYOK with VS Code SecretStorage
- SSE streaming

## Files Changed

- `package.json` — Manifest, vendor `clinepass-chat`, configuration, activation events
- `src/extension.ts` — Provider implementation, model registration, commands
- `src/providerTypes.ts` — `CLINEPASS_VENDOR` constant
- `src/metadata.ts` — Model limits, vision/reasoning capabilities (verified)
- `src/thinking.ts` — 6 thinking families, `cline-pass/` prefix stripping
- `src/streaming.ts` — SSE streaming, think-tag filtering
- `src/errors.ts` — Error handling
- `src/retry.ts` — Retry logic
- `README.md` — Updated with accurate specs and pricing

## Verification

```
Compile: 0 errors ✅
Extension activates: ✅
Models visible in picker: ✅
10 models registered: ✅
```
