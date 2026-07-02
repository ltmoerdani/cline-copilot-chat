# Changelog

All notable changes to the **Cline Copilot Chat** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

