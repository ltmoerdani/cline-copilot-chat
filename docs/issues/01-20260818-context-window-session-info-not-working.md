**Status:** ✅ Solved (v0.1.7, verified manually 2026-08-19) — GitHub [issue #4](https://github.com/ltmoerdani/cline-copilot-chat/issues/4)

# Context Window & Session Info not updating in Copilot Chat

**Topic:** usage / context-window / session-info / streaming / provider / byok
**Updated:** 2026-08-18
**Tags:** #usage #context-window #session-info #streaming #provider #byok #vscode
**Related:** opencode reference issue doc [`10-20260527-context-window-usage-pr6-integration.md`](../../opencode-copilot-chat/docs/issues/10-20260527-context-window-usage-pr6-integration.md) · feature doc [`09-20260626-session-level-cost-tracking.md`](../../opencode-copilot-chat/docs/features/09-20260626-session-level-cost-tracking.md)
**Extension version affected:** 0.1.6 (present since 0.1.0)
**Fixed in:** 0.1.7

---

## Overview

The **Context Window** widget in VS Code Copilot Chat shows the model's total capacity (e.g. `0 / 1M tokens · 0%`) but **never moves** during long conversations with Cline / ClinePass models. The **Session Info** popover also has no token/cost data. Both features work in the reference project `opencode-copilot-chat` because it reports provider usage metadata to VS Code; `cline-copilot-chat` does not.

This issue documents the confirmed root cause (evidence-based, from source comparison with `opencode-copilot-chat`) and the proposed fix.

## Problem

### Reported symptoms

1. **Context Window stuck at 0%.** The footer shows the correct model context size (`0 / 1M tokens`) but the usage percentage never increases, even in long multi-turn conversations.
2. **Session Info empty.** The Copilot Chat session info popover shows no token usage / cost for Cline / ClinePass requests.
3. **No usage telemetry.** The extension's own output channel logs `[usage] prompt=… completion=…` (so the data IS available), but it is never forwarded to VS Code.

### Expected behavior

- Context Window widget updates in real time as tokens are consumed (matching how built-in Copilot and other BYOK providers behave).
- Session Info accumulates per-session token/cost data.

## Root Cause

VS Code Copilot Chat updates the Context Window widget and Session Info **only** from a `LanguageModelDataPart` with MIME type `"usage"` emitted at the end of the response stream. `cline-copilot-chat` never emits this part.

Three independent gaps, all confirmed by source comparison with `opencode-copilot-chat`:

### 1. No `LanguageModelDataPart` with MIME `"usage"` (primary cause)

**In `opencode-copilot-chat`** (`src/chatParts.ts`):

```ts
export const COPILOT_USAGE_DATA_MIME = "usage";
export function createUsageDataParts(usage) {
  return [
    new vscode.LanguageModelDataPart(data, "usage"),          // ← native Copilot channel
    new vscode.LanguageModelDataPart(data, "application/vnd.opencode.usage+json"),
  ];
}
```

These parts are `progress.report()`-ed at the end of the stream in `src/transports/engine.ts`.

**In `cline-copilot-chat`** (`src/streaming.ts:226-237`), usage is only logged to the output channel, with an incorrect comment:

```ts
// Log usage data to output channel (VS Code LanguageModelChatProvider
// API does not expose a usage reporting type, so this is for diagnostics only).
```

The API **does** expose a usage reporting type — `LanguageModelDataPart` with MIME `"usage"` is the standard mechanism used by Copilot's own `AnthropicLMProvider` and `GeminiNativeProvider`. Because no such part is emitted, VS Code never learns the token usage → Context Window stays at 0% and Session Info has no data.

### 2. No `stream_options: { include_usage: true }` in the request body

For the server to send `usage` in an SSE stream, the request must ask for it. `opencode-copilot-chat` includes:

```ts
stream_options: { include_usage: true }
```

In `cline-copilot-chat` (`src/extension.ts:349-353`), the body is only `{ model, messages, stream }` + optional `tools/temperature/max_tokens`. Without `include_usage`, many providers omit the `usage` block from the SSE stream → even if gap #1 were fixed, the data would be empty.

### 3. `provideTokenCount()` too shallow (prompt estimation)

- **`opencode-copilot-chat`** (`src/tokenEstimate.ts` + `estimateChatMessageTokenCount`): counts role/name overhead, tool calls, tool results, structured JSON, data parts, image parts, plus a CJK buffer.
- **`cline-copilot-chat`** (`src/extension.ts:430-434`): only `Math.ceil(content.length / 4)` — flattens text and ignores tool calls/results/images.

This makes VS Code's prompt estimate inaccurate, worsening the Context Window display.

## Why it "should work" but doesn't

`maxInputTokens` / `maxOutputTokens` are already correct (`src/extension.ts:253`, from `metadata.contextWindow`), so VS Code knows the model capacity (`1M`). But the Context Window has **two separate mechanisms**:

| Mechanism | Purpose | Status in cline |
|---|---|---|
| `maxInputTokens` / `maxOutputTokens` | Display total context capacity | ✅ Present |
| `provideTokenCount()` | Estimate prompt tokens | ⚠️ Present but shallow |
| Streamed `usage` DataPart | Update the footer usage widget | ❌ **Missing** |

Capacity displays (`0 / 1M`), but because there is **no `usage` DataPart**, the usage number never moves → appears "broken".

## Proposed Fix (priority order)

1. **Emit `LanguageModelDataPart(data, "usage")`** at the end of the stream in `src/streaming.ts` — port `createUsageDataParts()` from opencode `chatParts.ts`. This is the single change that makes the Context Window + Session Info move.
2. **Add `stream_options: { include_usage: true }`** to the request body in `src/extension.ts` so the server sends usage.
3. **Improve `provideTokenCount()`** — port `estimateChatMessageTokenCount` from opencode `tokenEstimate.ts`.
4. **(Optional, full parity)** Port `contextWindowHook.ts` + `contextWindowHookBridge.ts` + `usage/` for session cost tracking & dashboard, matching opencode.

## Known VS Code Limitation

`opencode-copilot-chat` documents that VS Code 1.126 does not convert `usage` DataParts from BYOK providers into `IChatUsage` events for **native session cost accumulation**. However, the **Context Window widget still works** because it reads the DataPart directly. So fixes #1–#3 will make the Context Window move; full Session Info cost may require the additional hook (#4).

## Acceptance Criteria

- [x] Context Window percentage increases during a multi-turn conversation with a Cline / ClinePass model. *(verified manually 2026-08-19, v0.1.7 local install)*
- [x] `[usage]` data logged in the output channel is also forwarded to VS Code via a `LanguageModelDataPart("usage")`. *(implemented 2026-08-19 — `src/streaming.ts` `emitUsageDataPart()`)*
- [x] Request body includes `stream_options: { include_usage: true }`. *(implemented 2026-08-19 — `src/extension.ts`, with 400-rejection fallback retry)*
- [x] `provideTokenCount()` accounts for tool calls, tool results, and image parts. *(implemented 2026-08-19 — `src/tokens.ts`, ported from opencode)*
- [x] No regression in streaming, tool calling, or vision. *(user-verified 2026-08-19: "Oke sudah berhasil")*

## Fix Implementation (2026-08-19)

Fix for all three gaps implemented in the working tree (see `docs/bug-fixes/11-20260819-context-window-usage-reporting.md`):

| Fix | File | Change |
|---|---|---|
| #1 Usage DataPart | `src/streaming.ts` | New `CapturedUsage` + `captureUsageFromRecord()` + `emitUsageDataPart()`. Usage now captured from **any** SSE chunk carrying a `usage` record (**before** the `choices` guard — the old code never saw the usage-only final chunk that `include_usage` produces), and emitted as `LanguageModelDataPart(json, "usage")` on stream success. Both `prompt_tokens_details.cached_tokens` (OpenAI-style, matches docs.cline.bot) and top-level `cached_tokens` are read. |
| #2 `stream_options` | `src/extension.ts` | Body now sends `stream_options: { include_usage: true }`. **Safety net:** if the gateway rejects it with HTTP 400 naming `stream_options` (field is OpenAI-standard but undocumented on docs.cline.bot), the request is retried once without the field — docs.cline.bot confirms usage arrives in the final SSE chunk regardless. |
| #3 Token estimator | `src/tokens.ts` (new) | Full `estimateChatMessageTokenCount` ported from opencode-copilot-chat: role/name overhead (4/1), tool call overhead (10), tool result overhead (6), image estimate (1024), +10% code buffer, CJK handling. Internal `"usage"` DataParts that round-trip in the history count as 0. `extractTextContent` (now dead) removed. |

**Verification status:** `npm run compile` + `get_errors` clean. Manual test in Copilot Chat pending release.
