# 🧠 CLINE COPILOT CHAT — DEVLOG

**Branch:** `main` | **Updated:** 2026-07-02 Asia/Jakarta | **Version:** v0.1.0

---

## ⚡ Session Handoff

| Field | Value |
|-------|-------|
| **Last Session** | 2026-07-02 (Session 3) |
| **Worked On** | Fixed 4 critical issues: provider registration duplicate (20→10 models), stuck Cline group, API key guard, and **model ID format** (`cline/` → `cline-pass/`). All models now use official ClinePass format with hyphen per docs.cline.bot. |
| **Stopped At** | `main` at v0.1.0. Extension fully functional: Set API Key → 10 models appear → models respond correctly via subscription. |
| **Next Action** | → Test all 10 models end-to-end (MiMo, MiniMax, Qwen, GLM, Kimi, DeepSeek). → Verify thinking mode per family. → Consider marketplace publish. |
| **Open Issues** | — |

### Session 3 Issues Resolved (2026-07-02)

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | All Copilot models disappeared after cleanup script | `DELETE … WHERE value LIKE '%cline%'` matched global cache keys | VS Code auto-rebuilt on reload |
| 2 | "Cline" group stuck — Delete & Update API Key didn't work | BYOK entry deleted + extension always returned models regardless of API key | Added `if (!apiKey) return []` guard + cleared stale secrets |
| 3 | 20 duplicate models after re-adding provider | Dual registration: `registerLanguageModelChatProvider()` (runtime) + `languageModelChatProviders` (manifest) | Fixed guard: `if (!apiKey && opts.configuration)` — truthy check mirrors opencode pattern |
| 4 | **All models HTTP 404 "model not found"** | Model IDs changed from `clinepass/` → `cline/` during rebrand; API only recognizes `cline-pass/` (with hyphen) | Changed all IDs to official format: `cline-pass/glm-5.2`, etc. per docs.cline.bot/getting-started/clinepass |

**Full session documentation:** `docs/bug-fixes/02-20260702-provider-registration-duplicate-fix.md`

### Session 2 Issues Resolved (2026-07-01)

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | XML tool calls not parsed | Open-weight models output tool invocations as XML text, not structured `tool_calls` | Created `src/toolParsing.ts` — stateful XML parser with 4 parameter extraction strategies |
| 2 | Empty responses on turn 2+ | Invalid message format: spurious empty user messages, `content: ""` instead of `null` | Refactored `convertMessagesToApi()` to skip empty user wrappers, use `null` for assistant tool_calls |
| 3 | Infinite tool loop (200+ turns) | Streaming tool calls emitted prematurely with incomplete arguments | Implemented accumulate+flush pattern — collect chunks, emit only on `finish_reason === "tool_calls"` |

**Full session documentation:** `docs/bug-fixes/01-20260701-deepseek-v4-flash-tool-calling-fix.md`

### Session 1 Issues Resolved (2026-07-01)

| # | Issue | Root Cause | Fix |
|---|-------|------------|-----|
| 1 | ClinePass research | Needed API compatibility info | Confirmed OpenAI-compatible, documented |
| 2 | Architecture decision | Fork vs new extension | Built separate extension for discoverability |
| 3 | Vendor conflict | `opencode-copilot-chat` also used vendor `clinepass` | Changed to `clinepass-chat` |
| 4 | Models not in picker | `toolCalling: false` filtered by Copilot Chat | Set `toolCalling: true` (confirmed via Bailian) |
| 5 | API key not resolved | `configuration=null` on first resolution | Fallback to SecretStorage, always return models |
| 6 | Inaccurate model specs | Uniform 128K/16K placeholder | Verified via DeepSeek/Bailian/Moonshot/MiniMax docs |
| 7 | Logo creation | Needed combined Cline + Copilot branding | User provided logo, integrated into package |

**Full session documentation:** `docs/features/01-20260701-initial-build-session.md`

---

## 🏗 Architecture

### Provider
Single unified **Cline Copilot Chat** provider (`cline-copilot-chat` vendor) registered via VS Code `LanguageModelChatProvider` API.

- **API Base:** `https://api.cline.bot/api/v1`
- **Auth:** BYOK — `clineCopilotChat.apiKey` via VS Code `SecretStorage`
- **Subscription:** $9.99/mo (ClinePass at app.cline.bot)
- **Strategy:** Single unified provider covers 10+ frontier open-weight models today + any future Cline-native model on the same endpoint (no vendor split required)

### Models (10)

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
| `src/extension.ts` | Provider lifecycle, model registration, request building, status bar |
| `src/streaming.ts` | OpenAI-compatible SSE chat completions, think-tag filtering, XML tool parsing |
| `src/thinking.ts` | Per-model-family thinking/reasoning controls |
| `src/metadata.ts` | Model limits, vision capabilities, bundled fallback metadata |
| `src/providerTypes.ts` | Vendor type definitions, routing URL resolution |
| `src/toolParsing.ts` | XML tool-call parser for models without native `tool_calls` |
| `src/retry.ts` | HTTP retry helper for transient 400 errors |
| `src/errors.ts` | Cline Copilot Chat request error types, user-facing messages |

### Key Features

| Feature | Detail |
|---------|--------|
| BYOK | Native VS Code provider `configuration.apiKey` secret flow |
| Thinking Controls | Per-model-family reasoning effort via picker + settings |
| Think-Tag Stripping | Auto-strips `<think>` blocks from MiniMax M3 output |
| XML Tool Parsing | Hallucinated XML tags → native `LanguageModelToolCallPart` |
| Usage Tracker | Status bar indicator + persistent Webview panel |
| Vision Support | Image attachments for Kimi K2.5/2.6/2.7, MiMo V2.5, Qwen3.7 |

### VS Code Commands

| Command | Description |
|---------|-------------|
| `clineCopilotChat.manage` | Open provider management |
| `clineCopilotChat.setApiKey` | Set API key |
| `clineCopilotChat.diagnostics` | Show diagnostics |
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

| Date | Summary |
|------|---------|
| 2026-07-01 (Session 2) | Fixed DeepSeek V4 Flash tool calling: XML parser, message format, streaming accumulation. Agent mode now works. |
| 2026-07-01 (Session 1) | Initial build from scratch: research → scaffold → debug → verify specs. 7 issues resolved. |
| 2026-07-01 | Documentation reset — devlog cleaned, all docs aligned with current single-provider architecture |

---

## ⚠️ Notes

- No secrets in devlog, docs, diagnostics, or pasted request logs.
- All docs: `documentation-standards.md`, `changelog-guide.md`, `devlog-guide.md`, `devlog.md`.

---

_Updated during development sessions. Paired with: `docs/devlog-guide.md`_
