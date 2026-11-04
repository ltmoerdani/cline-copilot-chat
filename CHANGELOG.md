# Changelog

All notable changes to the **Cline Copilot Chat** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] — 2026-11-04

### Added

- **Live model catalog — the picker can no longer go stale.** The advertised model list is now fetched from Cline's own catalog endpoints instead of being compiled into the bundle: `GET /api/v1/ai/cline/models` (438 entries, each with `context_length`, `top_provider.max_completion_tokens`, `architecture.input_modalities` and `supported_parameters`) and `GET /api/v1/ai/cline/recommended-models` (`recommended` / `free` / `clinePass` — the subscription's source of truth). These are the same two unauthenticated endpoints the Cline extension calls, so new models appear and retired ones disappear without shipping a new build. Advertised counts today: **306 pay-per-use** (full tool-capable catalog, newest first, `:batch` SKUs and `~alias` pointers excluded, free tier included and tagged "(free)") and **14 ClinePass**. New module `src/catalog.ts`. `[Models]`
- **Token limits and capabilities now come from the live catalog**, replacing hand-maintained guesses: `top_provider.context_length` → `maxInputTokens`, `top_provider.max_completion_tokens` → `maxOutputTokens`, `input_modalities` containing `image` → `imageInput`, `reasoning*` in `supported_parameters` → thinking support. E.g. `kimi-k3.1-pro` reports a 943,718-token output budget and `glm-5.3` is correctly text-only while `glm-5.3-flash` is multimodal. ClinePass entries carry no specs, so each `cline-pass/<bare>` is matched to its non-prefixed twin (`cline-pass/glm-5.3` → `z-ai/glm-5.3`) before falling back to the bundled snapshot. `[Models]`
- **Self-healing availability (`src/availability.ts`).** A model-level rejection during a request now hides that model from every picker immediately: 404 / "model not found" / "does not exist" / `403 "only available via Cline product surfaces"`. This makes the hardcoded `PRODUCT_SURFACES_ONLY_MODELS` list self-populating and covers the gap a catalog cannot see — models that exist upstream but are not entitled for this account. Account-level failures (401 bad key, 402 no credits, 429 rate limit) are deliberately **never** suppressed, because hiding the list on those would make the extension look broken. `[Availability]`
- **Fallback chain that never empties the picker.** live catalog → `globalState` snapshot (`cline.catalog.v1.<vendor>`, schema-validated so corrupt state is ignored) → bundled defs in `extension.ts`. An empty model list makes VS Code treat the provider as deleted, so `resolveCatalog()` returns the bundled list rather than nothing when both the network and the snapshot are unavailable. `[Extension]`
- **Commands:** `Cline Copilot Chat: Refresh Model List` (`clineCopilotChat.refreshModels`, per-provider or both) and `Cline Copilot Chat: Restore Hidden Models` (`clineCopilotChat.resetModelAvailability`). `[Commands]`
- **Settings:** `clineCopilotChat.dynamicModels.enabled` (default `true`), `clineCopilotChat.dynamicModels.refreshHours` (default `6`, minimum `0.25`) and `clineCopilotChat.dynamicModels.catalogBaseUrl` (default `https://api.cline.bot`, for testing/proxies). `[Settings]`
- **Diagnostics** now report catalog provenance per provider (`live` / `snapshot` / `bundled`, model count, age) plus every hidden model with its reason and timestamp — the two things that answer "why is this model (not) in my picker?". `[Diagnostics]`

### Changed

- **Bundled model lists demoted to fallbacks.** `CLINEPASS_MODEL_DEFS` / `CLINE_MODEL_DEFS` are now `FALLBACK_CLINEPASS_MODEL_DEFS` / `FALLBACK_CLINE_MODEL_DEFS` and are only used when the catalog is unreachable *and* no snapshot exists. The ClinePass fallback is aligned with Cline's live `clinePass` list (14 models); `cline-pass/deepseek-v4.1-flash` and `cline-pass/glm-5.2` are no longer offered by Cline but stay resolvable in `metadata.ts`. `[Models]`
- **"Test Connection" no longer depends on a hardcoded probe id.** It prefers the configured `testModelId` when the live catalog still offers it and otherwise probes the first advertised model, so a retired model can't turn a connectivity test into a false failure. `[Extension]`
- **`npm run check-models` rewritten** against the two live endpoints. It now guards the offline fallback instead of the advertised list, exits non-zero only when a fallback pay-per-use id vanished upstream, and reports ClinePass drift plus curated models that ship no specs. `[Tooling]`
- **Catalog refresh is event-driven:** when the resulting id set changes, `onDidChangeLanguageModelChatInformation` fires so an open picker updates without a window reload. A background prewarm runs on activation so the first picker open is not blocked on the network. `[Extension]`

---

## [0.1.9] — 2026-11-04

### Changed

- **ClinePass catalog refreshed to Cline 4.1.26.** The subscription now serves 16 models; the picker advertised 12, five of which (`cline-pass/kimi-k2.7-code`, `cline-pass/kimi-k2.6`, `cline-pass/deepseek-v4-flash`, `cline-pass/mimo-v2.5`, `cline-pass/mimo-v2.5-pro`) have been retired and returned errors when selected. Added the current lineup: `kimi-k3.1-pro`, `minimax-m3.1-flash`, `deepseek-v4.1-flash`, `deepseek-v4.1-flash-1017`, `mimo-v2.6-flash`, `mimo-v2.6-pro`, `glm-5.3`, `glm-5.3-flash`, `muse-spark-1.3-contributor`. Retired IDs are no longer advertised but their limits stay resolvable in `metadata.ts`. `[Models]`
- **ClinePass limits corrected from Cline's own catalog** (`@cline/llms`), e.g. `qwen3.8-max` 262k ctx / 128k output (was 1M / 65k), `minimax-m3` 1M ctx / 512k output (was 192k / 131k). Prevents requests that VS Code believed were in-budget from failing upstream with a context-length error. `[Models]`
- **Cline pay-per-use IDs re-verified against the live catalog** (`GET https://api.cline.bot/api/v1/models`, 438 models today). Fixed vendor prefixes that had silently retired whole families: `xai/` → `x-ai/`, `zai/` → `z-ai/`, `moonshot/` → `moonshotai/`, `mimo/` → `xiaomi/`, `mistral/` → `mistralai/`, `meta/` → `meta-llama/`. Added Claude 5.5 / Opus 5 / Fable 5.1, GPT-6.1 Terra (+Pro), Gemini 4 Argon, Grok 4.6–4.7, GLM 5.3 / 5.3 Flash, Kimi K3.1 Pro, MiMo V2.6, MiniMax M3.1 Flash, Qwen3.8 Max Prime / 0902 / Flash, Mistral Large 4.0. Dropped the delisted `cohere/command-r-plus`; `deepseek/deepseek-v3` and `deepseek/deepseek-r1` moved to the retired block. `[Models]`
- **Vision + reasoning capability sets rebuilt** for both providers. ClinePass entries now come from Cline's `capabilities` array (`"images"` → image input, `"reasoning"` → thinking), so e.g. `glm-5.3` is correctly text-only while `glm-5.3-flash` accepts images. `[Models]`
- **Test/verify-connection model** for ClinePass is now `cline-pass/deepseek-v4.1-flash` (the old `cline-pass/deepseek-v4-flash` no longer exists). `[Extension]`

### Added

- **`npm run check-models`** (`scripts/check-models.mjs`) — reads the IDs out of `src/extension.ts`, diffs them against the live `api.cline.bot` catalog, and diffs the ClinePass list against the catalog bundled in the locally installed Cline extension. Exits non-zero on drift, so catalog rot is caught before it ships. `[Tooling]`

---

## [0.1.8] — 2026-08-19

### Added

- **Image attachment normalization (vision token-cost fix).** Image attachments (drag & drop, paste) are now normalized before the request leaves the extension: oversized dimensions are resized to ≤2000×2000 (Lanczos3) and re-encoded PNG → JPEG (quality ladder 80/85/70/55/40) until the base64 payload fits ≤5MB — via new `src/imageNormalizer.ts` using `@silvia-odwyer/photon-node` (WASM, no native deps, ~2.3MB, lazy-loaded on first image request). Previously raw image bytes were forwarded untouched, so a 4K screenshot cost several × more vision tokens AND was re-sent full-size in the history on every subsequent turn. Images already within spec pass through byte-identical; an image whose normalized base64 still exceeds 5MB becomes a placeholder text part instead of failing the request. `convertMessagesToApi()` is now async and logs a `Normalized N oversized image(s)` line for observability. Ported from `opencode-copilot-chat` (`src/imageNormalizer.ts`, feature doc 13-20260803). `[Extension]` `[Vision]`

### Fixed

- **Think tags leaking into chat for DeepSeek V4 Flash (and other reasoning models) in agent mode.** When using reasoning models with tools enabled (Copilot Chat agent mode), `<think>...</think>` tags and their contents leaked into the visible chat output as unreadable raw text instead of being stripped. Fixed with two changes ported from `opencode-copilot-chat`: (1) `src/streaming.ts` now uses a stateful `ThinkTagFilter` class (ported from `opencode-copilot-chat/src/transports/thinkTags.ts`) that handles `<think>` tags split across SSE chunks, unclosed tags at end of stream, and boundary matching — replacing the previous regex-based filter that could miss split tags; (2) `src/extension.ts` now sets `forceStripThinkTags: true` when tools are present (agent mode), forcing think-tag stripping regardless of the `stripThinkTags` mode — matching `opencode-copilot-chat`'s `OpenCodeProvider` behavior. `[Extension]`
- **MiMo models could loop forever without `repetition_penalty`.** MiMo V2.5 / V2.5 Pro (both `cline-pass/` and `mimo/` variants) hit a known upstream infinite-generation bug ([XiaomiMiMo/MiMo-Code#914](https://github.com/XiaomiMiMo/MiMo-Code/issues/914)) when `repetition_penalty` is absent. The thinking payload builder now always sends `repetition_penalty: 1.2` for MiMo models — including when thinking is `"off"` (previously the penalty was only sent with reasoning enabled, and `"off"` sent an empty payload). Ported from `opencode-copilot-chat` (`a30c4a6` + `01ffde1`). `[Thinking]`
- **User abort during a retry backoff surfaced a stale gateway error.** When the user cancelled a request while the extension was waiting out a retry delay (after a network error or a transient HTTP 429/5xx), the loop re-fetched and reported the stale failure as if it were fresh. Both retry paths in `src/streaming.ts` now check `isCancellationRequested` after the backoff wait and fail cleanly as `AbortError`. Ported from `opencode-copilot-chat` (`42eeb56`). `[Streaming]`
- **Out-of-range `temperature` setting caused HTTP 400 before retries could help.** A misconfigured `clineCopilotChat.temperature` (e.g. a huge or negative number) was passed through to the API verbatim, which providers reject with 400. `getSettings()` now clamps the value to the provider-accepted `[0, 2]` range with a sane numeric fallback. Ported from `opencode-copilot-chat` (`15643f5`). `[Settings]`
- **Missing `Accept` header on chat POST requests.** Streaming requests now send `Accept: application/json` alongside `Content-Type` — some gateways reject or mis-route POSTs without it. Ported from `opencode-copilot-chat` (`27f368c`). `[Streaming]`

---

## [0.1.7] — 2026-08-19

### Fixed

- **Context Window & Session Info never updated (Issue #4).** The Copilot Chat Context Window widget showed the model capacity but stayed at `0%`, and Session Info had no token data, because the extension never reported usage to VS Code — the data was arriving and even logged to the output channel, but only as diagnostics text. Fixed with three changes ported from `opencode-copilot-chat`: (1) `src/streaming.ts` now captures the `usage` block from **every** SSE chunk (including the usage-only final chunk with `choices: []`, which the previous code dropped before reaching its usage logging) and emits it at end of stream as a `LanguageModelDataPart` with MIME `"usage"` — the native mechanism Copilot Chat's Context Window consumes, used by Copilot's own BYOK providers; `cached_tokens` is read from both the OpenAI-style `prompt_tokens_details.cached_tokens` (matches docs.cline.bot) and a top-level `cached_tokens`; (2) requests now send `stream_options: { include_usage: true }` to guarantee usage in streams, with a safety fallback that retries once without the field if the gateway rejects it with a 400 naming `stream_options` (it is OpenAI-standard but undocumented on docs.cline.bot — and usage arrives in the final chunk regardless per the official docs); (3) `provideTokenCount` now uses a complete estimator (new `src/tokens.ts`: message role/name overhead, tool call + tool result overhead, image parts, +10% code buffer, CJK handling) instead of flattening text to `length / 4`; internal `"usage"` DataParts that round-trip in chat history count as 0 tokens. `[Extension]`

---

## [0.1.6] — 2026-08-17

### Added

- **Kimi K3 model.** Added `cline-pass/kimi-k3` (ClinePass) and `moonshot/kimi-k3` (pay-per-use). Kimi's flagship 2.8T-parameter model with 1M context, 131K max output, native vision, and always-on reasoning. `[Models]`
- **Qwen3.8 Max model.** Added `cline-pass/qwen3.8-max` (ClinePass) and `qwen/qwen3.8-max` (pay-per-use). Qwen's flagship model with 1M context, 65K max output, vision, and reasoning. `[Models]`

### Changed

- **GLM-5.2 spec corrected.** Max output corrected from 131K to **128K**, and GLM-5.2 removed from the vision-capable set — Z.ai docs list Input/Output Modalities as **Text only** (a separate GLM-5V line exists for vision). Applies to both `cline-pass/glm-5.2` and `zai/glm-5.2`. `[Models]`
- **Kimi K2.6 / K2.7 Code context corrected.** Context window corrected from 256K to **262K** per platform.kimi.ai pricing. Applies to both ClinePass and pay-per-use variants. `[Models]`

---

## [0.1.5] — 2026-08-17

### Added

- **Remove / re-add providers in Language Models.** Both `Cline` and `ClinePass` can now be removed from VS Code's Manage Language Models list and every model picker via a new per-provider `enabled` setting (`clineCopilotChat.enabled` / `clineCopilotChat.clinePass.enabled`), a `when` clause on each vendor contribution, and gated runtime registration. The Manage Provider QuickPick gains a **"Remove from Language Models"** / **"Re-add to Language Models"** action (reachable even without an API key), plus two new commands (`Cline Copilot Chat: Remove/Re-add Cline in Language Models` and the ClinePass equivalent). API keys and BYOK groups are kept, so re-enabling restores the provider exactly as it was. A window reload is required after toggling. Ported from `opencode-copilot-chat` PR #125 (issue #122). `[Extension]`

### Fixed

- **Delete / Update API Key on a group did nothing.** The per-model `configurationSchema` included `apiKey`, which made VS Code create a **settings-only BYOK group** (no real key) whenever a per-model option like thinking mode was changed. VS Code then called `provideLanguageModelChatInformation` for that group with `opts.configuration = {}` (not `undefined`), which fell through to the SecretStorage fallback — duplicating every model and confusing group management so Delete / Update API Key had no effect. Fixed by (1) removing `apiKey` from the per-model `configurationSchema` (it now lives only in the vendor-level `languageModelChatProviders.configuration`), and (2) returning `[]` when a group call carries a `configuration` object but no `apiKey` (a settings-only group). Also added a per-vendor `hasByokGroup` flag so a groupless call after a native BYOK group is deleted returns `[]` instead of re-advertising from SecretStorage. Ported from `opencode-copilot-chat` PR #135 (issue #131) + PR #108 (issue #106). `[Extension]`

---

## [0.1.4] — 2026-07-19

### Added

- **Activation diagnostics banner.** On every activation, the extension now writes a one-shot banner to the `Cline Copilot Chat` output channel summarising the full registration state: VS Code version, `SecretStorage` presence (length only, never the key), `selectChatModels({ vendor })` counts for both `cline` and `cline-pass` polled at 0/500/1500 ms, and the result of the `setContext` workaround. Pinpoints exactly where the registration pipeline breaks when models are missing from the picker on a fresh install or a second machine. Ported from the `zai-copilot-chat` v0.4.0 fix for the same class of bug. `[Extension]`
- **`setContext('github.copilot.clientByokEnabled', true)` workaround.** Keeps the **Manage Models** gear icon in the Copilot Chat picker clickable for BYOK users who are not signed in to GitHub Copilot Chat. The context key defaults to `true` per VS Code's schema but is sometimes left unset until the Copilot extension first touches the context service; forcing it removes that race. Runs only when at least one model is visible to VS Code. `[Extension]`
- **"Set API Key" toast on missing key.** When the activation banner detects that `SecretStorage` is empty, a one-time warning toast (guarded by the `cline.apiKeyMissingNotified` globalState flag) is shown with a `Set API Key` action button that opens the key-entry command directly. Closes the previous blind spot where `provideLanguageModelChatInformation` returned `[]` with no UI feedback. `[Extension]`
- **Explicit logging in `provideLanguageModelChatInformation`.** Now logs when the call is cancelled, when returning `[]` due to a missing key (with an explicit hint that SecretStorage is per-device and is not synced by VS Code Settings Sync), and when advertising N models to VS Code (first 3 model ids included). `[Extension]`

### Fixed

- **Dual-provider race condition in `provideLanguageModelChatInformation`.** The key-resolution fallback to `resolveStoredApiKey` was gated on `opts.configuration` being truthy, but VS Code can invoke the method with `configuration === undefined` early in a session — causing `cline` (pay-per-use) to silently return `[]` even when the key was sitting right there in `SecretStorage`. The asymmetry (`cline-pass` advertised normally, `cline` advertised nothing) was previously invisible without the new diagnostics logging. Fixed by calling `resolveStoredApiKey` unconditionally whenever no key is in hand. Pre-existing bug since v0.1.0, made visible and fixed by this patch. `[Extension]`

---

## [0.1.3] — 2026-07-09

### Fixed

- **Image drag & drop silently discarded.** `LanguageModelDataPart` with `image/*` MIME types was ignored by `convertMessagesToApi()`, so images dragged or pasted into Copilot Chat never reached the API. Now detects image parts, converts `Uint8Array` bytes to base64 data URIs, and builds OpenAI-compatible multipart `content` array (`text` + `image_url`). Pure-text messages keep string format for token efficiency. `[Extension]`
- **Incorrect vision capability metadata.** Verified `VISION_CAPABLE_MODELS` against official provider docs (Jul 2026). Added 5 models that were missing vision support: `openai/o3` (OpenAI: all latest models support vision), `xai/grok-3` and `xai/grok-4` (xAI image input docs), `mistral/mistral-large` (Mistral vision model list), `meta/llama-4-maverick` (Meta: natively multimodal). Removed 4 entries incorrectly marked as vision-capable: `mimo/mimo-v2.5` and `mimo/mimo-v2.5-pro` (both ClinePass and pay-per-use), since MiMo-7B is a reasoning-only text model with no vision evidence in any official source. `[Metadata]`

---

## [0.1.2] — 2026-07-08

### Fixed

- **VS Code 1.128 BYOK utility model error.** VS Code 1.128 introduced `chat.byokUtilityModelDefault` with a default of `"none"`, breaking all background utility tasks (chat title generation, commit messages, intent detection) for BYOK users. The extension now auto-configures `byokUtilityModelDefault = "mainAgent"` on activation (VS Code 1.128+ only), with a one-time toast notification. Skips if the user has already configured any utility model setting explicitly. `[Extension]`

### Changed

- **Extension Development Host launch config.** Replaced the incorrect Chrome web debugger configuration in `.vscode/launch.json` with the correct `extensionHost` configuration. Added `.vscode/tasks.json` with `npm: compile` (build) and `npm: watch` (background watch) tasks. `[DevEx]`

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

