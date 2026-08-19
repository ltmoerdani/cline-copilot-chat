**Status:** ✅ Solved (v0.1.7 — user-verified 2026-08-19: Context Window updates, no regressions)

# Context Window & Session Info — usage reporting to VS Code (Issue #4)

**Topic:** usage / context-window / streaming / provider / byok
**Updated:** 2026-08-19
**Tags:** #usage #context-window #session-info #streaming #provider #byok #vscode #port
**Ref:** GitHub [issue #4](https://github.com/ltmoerdani/cline-copilot-chat/issues/4) · issue doc [`01-20260818-context-window-session-info-not-working.md`](../issues/01-20260818-context-window-session-info-not-working.md) · ported from `opencode-copilot-chat` issue doc `10-20260527-context-window-usage-pr6-integration.md`

---

## Overview

The Copilot Chat **Context Window** widget (and **Session Info**) showed the model's capacity (`0 / 1M tokens · 0%`) but **never moved** during conversations, because the extension never reported token usage to VS Code. The usage data was arriving all along — it was even logged to the output channel — but only as diagnostics text.

This patch ports the three-part fix validated in `opencode-copilot-chat`:

| # | Change | File |
|---|---|---|
| 1 | Emit `LanguageModelDataPart(json, "usage")` at end of stream + capture usage from every SSE chunk (incl. the usage-only final chunk) | `src/streaming.ts` |
| 2 | Send `stream_options: { include_usage: true }`, with a 400-rejection fallback retry | `src/extension.ts` |
| 3 | Full `provideTokenCount` estimation (tool calls, tool results, images, CJK) | `src/tokens.ts` (new) |

## Problem

### Symptoms

1. Context Window stuck at `0%` while capacity displayed correctly (`0 / 1M tokens`).
2. Session Info popover empty for Cline / ClinePass requests.
3. Output channel showed `[usage] prompt=… completion=…` — data present, never forwarded.

### Root causes (3 independent gaps)

**Gap 1 — no `usage` DataPart (primary).** VS Code updates the Context Window widget only from a `LanguageModelDataPart` with MIME `"usage"` emitted in the response stream. This is the same mechanism used by Copilot's own BYOK providers (`AnthropicLMProvider`, `GeminiNativeProvider`). The old code carried an incorrect comment ("API does not expose a usage reporting type") and only *logged* usage.

**Gap 2 — usage-only SSE chunk was dropped.** With `stream_options.include_usage`, OpenAI-style backends send the usage block in a final chunk with `choices: []`. The old `extractStreamParts` early-returned on `choices.length === 0` **before** reaching the usage logging — and even when usage rode along with a `finish_reason` chunk, it was only logged, gated inside the `finishReason` branch.

**Gap 3 — `provideTokenCount` too shallow.** `Math.ceil(text.length / 4)` on flattened text ignored role/name overhead, tool calls, tool results, data parts, and images.

### Evidence from docs.cline.bot (verified 2026-08-19)

The [Chat Completions reference](https://docs.cline.bot/api/chat-completions) states the endpoint "follows the OpenAI Chat Completions format" and documents:

- The **final SSE chunk includes `usage`** with `prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`, and `cost` — confirming the data was arriving without any opt-in.
- `stream_options` is **not listed** in their request-body table — hence the fallback retry (below).

## Fix details

### 1. `src/streaming.ts` — capture + emit

- New `CapturedUsage` interface and `captureUsageFromRecord()` closure inside `streamChatCompletions`.
- Usage capture moved to the **top of `extractStreamParts`, before the `choices` guard** — handles both the usage-in-finish-chunk shape (docs.cline.bot) and the usage-only final chunk (`choices: []`, OpenAI `include_usage` shape).
- `cached_tokens` read from **both** `prompt_tokens_details.cached_tokens` (OpenAI / cline docs shape) and top-level `cached_tokens`.
- `emitUsageDataPart()` emits the OpenAI-compatible payload as `LanguageModelDataPart(encoded, "usage")` via `progress.report()`:
  - Only on the **success path** — a thrown stream error skips it (matches opencode `engine.ts`).
  - Never throws — reporting failure is logged, not surfaced.
  - Emits a single consolidated `[usage] … → reported to VS Code` log line.
- `extractFullParts` (non-streaming path) captures via the same helper.

### 2. `src/extension.ts` — `stream_options` + fallback

- Body now includes `stream_options: { include_usage: true }` (OpenAI-standard way to guarantee usage in streams).
- **Fallback retry:** if the gateway strictly rejects the field (HTTP 400 whose message names `stream_options` — it is undocumented on docs.cline.bot), the request is retried **once** without it. Safe because a 400 fails at the HTTP layer, before any SSE part is emitted. Usage still arrives in the final chunk per the official docs, so the Context Window keeps working either way.
- The `streamChatCompletions` options object is hoisted to a `streamOptions` const so the fallback can reuse it.

### 3. `src/tokens.ts` (new) — full token estimation

Ported from opencode-copilot-chat (`tokenEstimate.ts` + `provider/tokens.ts`):

| Constant | Value | Purpose |
|---|---|---|
| `MESSAGE_TOKEN_OVERHEAD` | 4 | per-message role overhead |
| `MESSAGE_NAME_TOKEN_OVERHEAD` | 1 | optional `name` field |
| `TOOL_CALL_TOKEN_OVERHEAD` | 10 | per tool call |
| `TOOL_RESULT_TOKEN_OVERHEAD` | 6 | per tool result |
| `IMAGE_TOKEN_ESTIMATE` | 1024 | per image part |

- `estimateTokenCount(string)`: whitespace-normalized chars/4 + 10% code buffer + CJK (~1 token/char).
- `estimateChatMessageTokenCount(message)`: overhead + role + name + Σ part estimates (text, tool call `callId`/`name`/`input` JSON, tool result `callId` + content, data parts — images fixed 1024, text/* decoded, other bytes/4).
- **RULE:** internal DataParts with MIME `"usage"` (emitted by this extension, round-tripping in chat history) count as **0** tokens.
- `provideTokenCount` now uses these; dead `extractTextContent` removed.

## Verification

- `npm run compile` — pass (0 errors).
- `get_errors` on `streaming.ts`, `extension.ts`, `tokens.ts` — clean.
- **Manual test (v0.1.7 local install, 2026-08-19):** user confirmed the fix works — Context Window now updates during conversation, no regression in normal chat flow. ✅

## Known limitations

- **Session Info native cost accumulation:** per opencode documentation, VS Code (as of 1.126) does not convert BYOK `usage` DataParts into `IChatUsage` events — the **Context Window widget** still works (reads the DataPart directly), but native per-session *cost* totals may stay empty until VS Code changes this. Not fixable extension-side without the `contextWindowHook` proxy (future work, opencode parity).
- `copilotCredits` is not included in the payload (cline has no bundled pricing table yet — future work with usage tracking).
