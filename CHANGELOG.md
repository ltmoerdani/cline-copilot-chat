# Changelog

All notable changes to the **Cline Copilot Chat** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-07-01

### Added

- **Initial release** of Cline Copilot Chat — a single Cline vendor for VS Code's native Copilot Chat model picker.
- **Strategy:** one unified Cline vendor (`cline-copilot-chat`) backed by Cline's OpenAI-compatible API at `https://api.cline.bot/api/v1`. This covers the ClinePass curated catalog of 10 open weight models today and any future Cline-native model exposed on the same endpoint — no vendor split required.
- **10 ClinePass curated open weight models** registered in the Copilot Chat model picker:
  - DeepSeek V4 Pro / Flash (1M context, 384K max output)
  - GLM 5.2 (1M context, 131K max output, vision)
  - Kimi K2.7 Code / K2.6 (256K context, vision)
  - MiMo V2.5 / V2.5 Pro (1M context, vision)
  - MiniMax M3 (192K context, vision)
  - Qwen3.7 Max / Plus (1M context, vision on Plus)
- BYOK authentication via VS Code SecretStorage (`clineCopilotChat.apiKey`)
- Thinking mode controls for 6 model families (DeepSeek, GLM, Kimi, MiniMax, MiMo, Qwen)
- SSE streaming for real-time response delivery
- Per-family reasoning effort configuration via settings and model picker
- XML tool-call parsing fallback — converts hallucinated XML-style tool invocations from non-native-tool-calling open weight models into native `LanguageModelToolCallPart`, so Agent Mode works with DeepSeek, MiMo, MiniMax, Qwen, etc.
- Commands: `clineCopilotChat.manage`, `clineCopilotChat.setApiKey`, `clineCopilotChat.diagnostics`, `clineCopilotChat.setThinkingEffort`
- Configuration settings: temperature, maxTokens, timeouts, stripThinkTags, per-family thinking
- Custom logo combining Cline and Copilot branding
- Diagnostics command to inspect registered model metadata

### Fixed

- **Vendor conflict** with `opencode-copilot-chat`: selected the `cline-copilot-chat` vendor ID up front to avoid collision
- **Models not visible in chat picker**: set `toolCalling: true` (Copilot Chat filters out models without tool calling support)
- **API key resolution on first picker load**: added SecretStorage fallback when `configuration=null`
- **Model specs accuracy**: verified all context/output limits from official provider docs (DeepSeek API, Alibaba Bailian, Moonshot, MiniMax)
- **Multi-turn message format**: skip spurious empty user messages, use `content: null` (not `""`) for assistant tool-call messages — fixes empty responses on turn 2+
- **Infinite tool loop on non-native models**: accumulate streaming tool call deltas and only emit on `finish_reason === "tool_calls"` — prevents premature emission of incomplete tool calls

### Removed

- All OpenCode-related code, providers, commands, and configuration (forked from `opencode-copilot-chat`, stripped to Cline-only)

