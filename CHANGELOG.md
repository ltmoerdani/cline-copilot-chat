# Changelog

All notable changes to the **Cline Copilot Chat** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] — 2026-07-04

### Fixed

- **CancellationToken listener leak in streaming loop.** Each SSE chunk iteration registered a new `onCancellationRequested` listener via `Promise.race` but never disposed the returned `Disposable`. For a 500-chunk response, this meant 500 leaked listeners accumulating in memory until the token itself was disposed. Fixed by registering the listener **once** outside the `while(true)` loop and disposing it in a `finally` block after the stream completes. `[Streaming]`
- **Transient HTTP errors not retried.** `retry.ts` existed with `shouldRetryHttp400` and `retryDelayMs` helpers but was never imported or used by any module. All HTTP errors (429 rate limit, 500/502/503/504 server errors, transient 400 "overloaded") were thrown directly to the user without retry. Fixed by expanding `shouldRetryHttp` to cover all transient statuses, wiring a unified retry loop into `streamChatResponse` (max 3 retries with exponential backoff + jitter), and honoring the `Retry-After` header for 429 responses. `[Streaming]`
- **`testConnection` did not validate response body.** The connection test only checked `response.ok` (HTTP 200) without parsing the body, meaning an API returning 200 with an error payload would report "Connection OK". Fixed by parsing `choices[0].message.content` and displaying the actual reply in the success message. `[Extension]`
- **`_hasImageInput` parameter was always `false`.** `buildThinkingPayload` accepted a `hasImageInput` parameter but the call site hardcoded `false`, preventing models from adjusting thinking mode for vision input. Fixed by detecting `LanguageModelDataPart` with `image/*` MIME type in the message array and passing the real value. `[Extension]`

### Removed

- **Dead code in `providerTypes.ts`.** Removed unused exports: `PROVIDER_ROUTES` (routing table never read — `extension.ts` uses `BASE_URL` directly), `resolveBaseVendor()` (identity function never called), and `ProviderRoutingDefinition` interface (only used by the removed routing table). `[Types]`

---

## [0.1.0] — 2026-07-02

### Added

- **Dual provider architecture.** Two separate providers in VS Code's Copilot Chat model picker: **Cline** (pay-per-use, 23 models) and **ClinePass** ($9.99/mo subscription, 10 curated open-weight models). Both share one API key and one endpoint (`https://api.cline.bot/api/v1`). The model ID prefix determines billing: `vendor/model` routes to credits, `cline-pass/model` routes to subscription quota.
- **ClinePass subscription models (10):** GLM 5.2, Kimi K2.7 Code, Kimi K2.6, DeepSeek V4 Pro/Flash, MiMo V2.5/V2.5 Pro, MiniMax M3, Qwen3.7 Max/Plus — all with `cline-pass/` prefix routing via subscription quota (validated: HTTP 200 OK).
- **Cline pay-per-use models (23):** DeepSeek V4 Flash/Pro/V3/R1/Chat, GPT-4o, GPT-5, o3, Gemini 2.5 Pro, Grok 3/4, GLM 5.2, Kimi K2.7 Code/K2.6, MiMo V2.5/V2.5 Pro, MiniMax M3, Qwen3.7 Max/Plus, Mistral Large, Llama 4 Maverick, Sonar Pro, Command R+ — all validated against the Cline API via direct testing.
- **Free test model:** `deepseek/deepseek-v4-flash` — the only model returning 200 OK without credits, used as default for connection verification.
- **Shared provider class.** Single `ClineProvider` class instantiated per vendor via `PROVIDER_CONFIGS` record — no code duplication across providers.
- **API key guard.** `provideLanguageModelChatInformation` returns empty model list when no API key is resolved, enabling proper Delete behavior in VS Code's Language Models UI.
- **API key resolution chain.** BYOK config → in-memory cache → SecretStorage fallback, with legacy key migration from pre-rebrand `clinepass.apiKey`.
- **Thinking mode controls** for 6 model families (DeepSeek, GLM, Kimi, MiniMax, MiMo, Qwen) with per-family reasoning effort via settings and model picker. `thinkingFamily()` strips both `cline-pass/` and `provider/` prefixes for correct family detection.
- **SSE streaming** for real-time response delivery with think-tag filtering and idle timeout.
- **XML tool-call parsing fallback** — converts hallucinated XML-style tool invocations from non-native-tool-calling models into native `LanguageModelToolCallPart`, enabling Agent Mode.
- **Multi-turn message format** — skip spurious empty user messages, use `content: null` for assistant tool-call messages, emit tool calls only on `finish_reason === "tool_calls"` to prevent infinite loops.
- **Commands:** `clineCopilotChat.manage`, `clineCopilotChat.setApiKey`, `clineCopilotChat.diagnostics`, `clineCopilotChat.setThinkingEffort`.
- **Configuration settings:** temperature, maxTokens, timeouts, stripThinkTags, per-family thinking.
- **Shared diagnostics** command showing models from both providers in a single Markdown report.
- **Custom logo** combining Cline and Copilot branding.

### Fixed

- **`__prewarm__` API key cache leak.** The pre-warmed API key (set during `activate()`) was never removed after first use, allowing it to persist as a stale fallback even after the user cleared their API key via the Manage Provider command. Fixed by deleting the `"__prewarm__"` entry from the in-memory cache immediately after first use. `[Extension]`
- **Dead `createUsageDataPart` function in streaming.** VS Code's `LanguageModelChatProvider` API defines `LanguageModelResponsePart` as `TextPart | ToolCallPart | ToolResultPart | DataPart` — there is no usage reporting type. The function created a `usage` object then returned `LanguageModelTextPart("")` via an `as unknown as` cast, producing a silent no-op on every response. Removed the function entirely. Token usage is now logged to the output channel (`[usage] prompt=X completion=Y cached=Z`) for debugging via the **Output** panel. `[Streaming]`
- **Vendor conflict** with `opencode-copilot-chat`: selected the `cline-copilot-chat` vendor ID up front to avoid collision.
- **Models not visible in chat picker**: set `toolCalling: true` (Copilot Chat filters out models without tool calling support).
- **API key resolution on first picker load**: added SecretStorage fallback when `configuration=null`.
- **Multi-turn message format**: skip spurious empty user messages, use `content: null` (not `""`) for assistant tool-call messages — fixes empty responses on turn 2+.
- **Infinite tool loop on non-native models**: accumulate streaming tool call deltas and only emit on `finish_reason === "tool_calls"` — prevents premature emission of incomplete tool calls.

### Removed

- All OpenCode-related code, providers, commands, and configuration (forked from `opencode-copilot-chat`, stripped to Cline-only).

