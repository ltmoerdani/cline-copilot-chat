# 🧠 CLINE COPILOT CHAT — DEVLOG

**Branch:** `main` | **Updated:** 2026-07-02 Asia/Jakarta | **Version:** v0.1.0

---

## ⚡ Session Handoff

| Field | Value |
|-------|-------|
| **Last Session** | 2026-07-02 (Session 6) |
| **Worked On** | Full codebase audit (8 source files, ~1,200 lines). Deep analysis covering architecture, security, edge cases, and VS Code API compliance. Verified 7 potential bugs against codebase + internet research. Fixed 2 confirmed issues: (1) `__prewarm__` API key cache leak, (2) dead `createUsageDataPart` code removed with usage logging preserved in output channel. |
| **Stopped At** | `main` at v0.1.0. Zero compile errors. 2 bugs fixed, 5 false positives ruled out with evidence. |
| **Next Action** | → Consider marketplace publish. → Add more models as Cline API expands. → Consider adding ESLint + Prettier for code quality guardrails. |
| **Open Issues** | — |

---

## 🏗 Architecture

### Providers (Dual)

Two providers, one API key, same endpoint (`api.cline.bot`):

| Provider | Vendor ID | Billing | Models |
|---|---|---|---|
| **Cline** | `cline` | Pay-per-use | 23 (DeepSeek, OpenAI, Google, xAI, Z.ai, Moonshot, MiMo, MiniMax, Qwen, Mistral, Meta, Perplexity, Cohere) |
| **ClinePass** | `cline-pass` | $9.99/mo flat | 10 curated open-weight models with 2–5× rate limits |

- **API Base:** `https://api.cline.bot/api/v1`
- **Auth:** BYOK — `clineCopilotChat.apiKey` via VS Code `SecretStorage` (shared)
- **Pattern:** Shared `ClineProvider` class instantiated twice per `PROVIDER_CONFIGS` record

### Models — Cline (Pay-Per-Use) — 23 validated models

| Model ID | Display Name | Family | API Status |
|----------|-------------|--------|------------|
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash ⭐ | DeepSeek | 200 OK (free) |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek | 402 (valid) |
| `deepseek/deepseek-v3` | DeepSeek V3 | DeepSeek | 402 (valid) |
| `deepseek/deepseek-r1` | DeepSeek R1 | DeepSeek | 402 (valid) |
| `deepseek/deepseek-chat` | DeepSeek Chat | DeepSeek | 402 (valid) |
| `openai/gpt-4o` | GPT-4o | OpenAI | 402 (valid) |
| `openai/gpt-5` | GPT-5 | OpenAI | 402 (valid) |
| `openai/o3` | o3 | OpenAI | 402 (valid) |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | Google | 402 (valid) |
| `xai/grok-3` | Grok 3 | xAI | 402 (valid) |
| `xai/grok-4` | Grok 4 | xAI | 402 (valid) |
| `zai/glm-5.2` | GLM 5.2 | Z.ai | 402 (valid) |
| `moonshot/kimi-k2.7-code` | Kimi K2.7 Code | Moonshot AI | 402 (valid) |
| `moonshot/kimi-k2.6` | Kimi K2.6 | Moonshot AI | 402 (valid) |
| `mimo/mimo-v2.5` | MiMo V2.5 | MiMo | 402 (valid) |
| `mimo/mimo-v2.5-pro` | MiMo V2.5 Pro | MiMo | 402 (valid) |
| `minimax/minimax-m3` | MiniMax M3 | MiniMax | 402 (valid) |
| `qwen/qwen3.7-max` | Qwen3.7 Max | Qwen | 402 (valid) |
| `qwen/qwen3.7-plus` | Qwen3.7 Plus | Qwen | 402 (valid) |
| `mistral/mistral-large` | Mistral Large | Mistral | 402 (valid) |
| `meta/llama-4-maverick` | Llama 4 Maverick | Meta | 402 (valid) |
| `perplexity/sonar-pro` | Sonar Pro | Perplexity | 402 (valid) |
| `cohere/command-r-plus` | Command R+ | Cohere | 402 (valid) |

> ⭐ `deepseek/deepseek-v4-flash` is free — returns 200 OK even with $0 balance.

### Models — ClinePass ($9.99/mo)

| Model ID | Display Name | Family |
|----------|-------------|--------|
| `cline-pass/glm-5.2` | GLM 5.2 | Z.ai |
| `cline-pass/kimi-k2.7-code` | Kimi K2.7 Code | Moonshot AI |
| `cline-pass/kimi-k2.6` | Kimi K2.6 | Moonshot AI |
| `cline-pass/deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek |
| `cline-pass/deepseek-v4-flash` | DeepSeek V4 Flash | DeepSeek |
| `cline-pass/mimo-v2.5` | MiMo V2.5 | MiMo |
| `cline-pass/mimo-v2.5-pro` | MiMo V2.5 Pro | MiMo |
| `cline-pass/minimax-m3` | MiniMax M3 | MiniMax |
| `cline-pass/qwen3.7-max` | Qwen3.7 Max | Qwen |
| `cline-pass/qwen3.7-plus` | Qwen3.7 Plus | Qwen |

### Source Modules

| File | Purpose |
|------|---------|
| `src/extension.ts` | Provider lifecycle, model registration, request building |
| `src/streaming.ts` | OpenAI-compatible SSE chat completions, think-tag filtering |
| `src/thinking.ts` | Per-model-family thinking/reasoning controls |
| `src/metadata.ts` | Model limits, vision capabilities, bundled fallback metadata |
| `src/providerTypes.ts` | Vendor type definitions, routing URL resolution |
| `src/toolParsing.ts` | XML tool-call parser for models without native `tool_calls` |
| `src/retry.ts` | HTTP retry helper for transient errors |
| `src/errors.ts` | Request error types, user-facing messages |

### VS Code Commands

| Command | Description |
|---------|-------------|
| `clineCopilotChat.manage` | Open provider management |
| `clineCopilotChat.setApiKey` | Set API key |
| `clineCopilotChat.diagnostics` | Show diagnostics (both providers) |
| `clineCopilotChat.setThinkingEffort` | Set thinking effort per model family |

### Configuration (`clineCopilotChat.*`)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `temperature` | number | 0.2 | Sampling temperature |
| `maxTokens` | number | 0 | Max output tokens (0 = default) |
| `debugReasoning` | boolean | false | Debug reasoning to output channel |
| `requestTimeoutSeconds` | number | 600 | Total request timeout |
| `streamIdleTimeoutSeconds` | number | 120 | Stream idle timeout |
| `stripThinkTags` | enum | auto | never / auto / always |
| `thinking.deepseek` | string | off | DeepSeek thinking effort |
| `thinking.glm` | string | off | GLM thinking toggle |
| `thinking.kimi` | string | off | Kimi thinking toggle |
| `thinking.minimax` | string | off | MiniMax thinking toggle |
| `thinking.mimo` | string | off | MiMo thinking effort |
| `thinking.qwen` | string | off | Qwen thinking toggle |
| `thinking.qwenBudget` | string | auto | Qwen thinking budget |

---

## 🔥 Active Tasks

_None._

---

## 📋 Completed History

### 📅 2026-07-02

| ID | Tag | Task | Time | Commit | Doc |
|----|-----|------|------|--------|-----|
| S6 | `audit` | Full codebase audit — 8 source files analyzed, 7 bugs verified (2 confirmed, 5 ruled out). Fixed `__prewarm__` cache leak + removed dead `createUsageDataPart` code. VS Code API research performed. | 3h+ | pending | [05](bug-fixes/05-20260702-cache-leak-and-dead-code-fix.md) |
| S5 | `fix` | Pay-per-use model ID validation — 23 models validated against Cline API, 404 models removed | 2h+ | multiple | [04](bug-fixes/04-20260702-payg-model-id-validation-fix.md) |
| S4 | `feat` | Dual provider architecture — Cline (pay-per-use) + ClinePass (subscription), vendor rename, thinking regex fix | 3h+ | multiple | [03](bug-fixes/03-20260702-dual-provider-vendor-rename-fix.md), [02](features/02-20260702-dual-provider-architecture.md) |
| S3 | `fix` | Provider registration duplicate fix — stuck group, 20 duplicate models, model ID format | 2h+ | multiple | [02](bug-fixes/02-20260702-provider-registration-duplicate-fix.md) |

### 📅 2026-07-01

| ID | Tag | Task | Time | Commit | Doc |
|----|-----|------|------|--------|-----|
| S2 | `fix` | DeepSeek V4 Flash tool calling — XML parser, message format, streaming accumulation | 3h+ | multiple | [01](bug-fixes/01-20260701-deepseek-v4-flash-tool-calling-fix.md) |
| S1 | `feat` | Initial build — research, scaffold, debug, verify specs, 7 issues resolved | 5h+ | initial | [01](features/01-20260701-initial-build-session.md) |

---

## ⚠️ Notes

- No secrets in devlog, docs, diagnostics, or pasted request logs.
- All model IDs in Cline provider were validated via direct API testing (curl) — not just documentation.
- `deepseek/deepseek-v4-flash` is the only free model (200 OK with $0 balance) — use as connection test.

---

_Updated during development sessions. Paired with: `docs/devlog-guide.md`_
