<div align="center">

# 🪶 Cline Copilot Chat: BYOK 33+ AI Models

### Use **33+ AI models** (DeepSeek V4, Kimi K2.7, GLM 5.2, GPT-5, Gemini 2.5, Grok 4, Qwen3.7, MiMo V2.5, MiniMax M3, Mistral, Llama, Sonar) in GitHub Copilot Chat. **BYOK.**

**Bring Your Own Key (BYOK)** · Cline (pay-per-use + free model) or ClinePass ($9.99/mo, $4.99 first month) · Works with native Copilot Agent Mode

[![VS Code](https://img.shields.io/badge/VS%20Code-1.120%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![VS Code Marketplace](https://img.shields.io/badge/Install-VS%20Code%20Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=ltmoerdani.cline-copilot-chat)
[![Version](https://img.shields.io/github/v/release/ltmoerdani/cline-copilot-chat?label=Version&color=6c47ff)](https://github.com/ltmoerdani/cline-copilot-chat/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen)](./CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/ltmoerdani/cline-copilot-chat?style=social)](https://github.com/ltmoerdani/cline-copilot-chat)

[**✨ Why bother**](#-why-bother) · [**⚡ Quick Start (60 sec)**](#-quick-start-60-sec) · [**🧠 Models**](#-models) · [**📊 Compare**](#-github-copilot-vs-this-extension) · [**🔧 Settings**](#-settings) · [**❓ FAQ**](#-faq) · [**💬 Community**](#-community)

</div>

---

> ### 💡 The pitch
>
> Copilot Pro+ is $39 a month. The free tier caps you at 2,000 completions and a couple of models.
>
> This extension adds Cline's models to the Copilot Chat picker you already use. Two options, same API key. **Cline** is pay-per-use across 23 models from 12 providers (GPT, Gemini, Grok, Claude, DeepSeek, Qwen, Kimi, GLM, MiMo, MiniMax, Mistral, Llama, plus Sonar and Command R+). One of them, `DeepSeek V4 Flash`, costs nothing at $0 balance. **ClinePass** is a flat $9.99/mo subscription ($4.99 first month) for 10 open-weight models with 2 to 5 times the standard rate limits.
>
> You keep the native Copilot UI, tool-calling, Agent Mode. You just get more models to pick from, and the bill often comes out lower than Pro+.

---

## 🔥 Why bother

Copilot's model picker is locked to whatever GitHub decides to offer. This extension opens it up.

| | What you get |
|---|---|
| 💸 **Cost** | $0 with the free model. Or $9.99/mo ClinePass ($4.99 first month). Pay-per-use for anything in between. |
| 🌍 **Models** | 33 across 12 providers: DeepSeek V4, Kimi K2.7, GLM 5.2, Qwen3.7 Max, MiMo V2.5, MiniMax M3, GPT-5, Gemini 2.5, Grok 4, Mistral Large, Llama 4, Sonar Pro |
| 🤖 **Agent Mode** | Tool-calling works: read files, edit, run terminal. Not just chat. |
| 🧠 **Thinking controls** | Per-model reasoning effort. DeepSeek goes to `max`, Qwen takes a `thinking_budget`, MiniMax toggles, MiMo picks `low`/`med`/`high`. |
| 🔌 **Two providers, one key** | Cline (pay-per-use) and ClinePass (subscription). Both active at once, switch from the picker. |
| 🆓 **Free model** | `DeepSeek V4 Flash` returns 200 OK at $0 balance. No card needed. |
| 🔒 **Key storage** | VS Code SecretStorage. The key stays on your machine. |

---

## ⚡ Quick Start (60 sec)

```text
1.  Install GitHub Copilot Chat (free) ──────────────────────────── ✓
2.  Install this extension ──────────────────────────────────────── ✓
3.  Get API key → app.cline.bot → Settings → API Keys ──────────── ✓
4.  Open Copilot Chat → model picker → "Add Models" → Cline ────── ✓
5.  Paste API key → pick a model → CHAT 🎉
```

<details>
<summary><b>📖 Detailed step-by-step</b></summary>

1. **Install [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat)** first. Free, only needs a GitHub account.
2. **Install this extension** from the VS Code Marketplace. Or press `F5` in this repo for dev mode.
3. **Get an API key** at [app.cline.bot](https://app.cline.bot) → Settings → API Keys.
   - `DeepSeek V4 Flash` works at $0 balance. Good for testing.
   - Want ClinePass instead? Subscribe at [app.cline.bot/dashboard/subscription](https://app.cline.bot/dashboard/subscription?personal=true). $4.99 first month, then $9.99/mo.
4. **Open Copilot Chat** (Cmd/Ctrl+Shift+I, or click the Copilot icon).
5. **Click the model picker** (the current model name) → **Add Models…**
6. **Pick Cline or ClinePass.**
7. **Press Enter** for the default group name.
8. **Paste your API key** when asked. Stored in VS Code SecretStorage.
9. **Pick a model. Start chatting.** 🚀

> **💡 Tips:**
> - Cline and ClinePass are separate provider groups. Both can be active at once. Switch from the picker.
> - One API key covers both.
> - Model shows in Language Models but not the chat picker? Hover its row and click the **eye icon (👁)** to enable it.

</details>

---

## 📊 GitHub Copilot vs This Extension

GitHub Copilot has four tiers: **Free**, **Pro ($10/mo)**, **Pro+ ($39/mo)**, and **Max ($100/mo)**. This is how BYOK via Cline stacks up:

| | **Copilot Free** | **Copilot Pro $10/mo** | **Copilot Pro+ $39/mo** | **Cline for Copilot Chat** |
|---|---|---|---|---|
| 💰 **Cost** | $0 | $10/mo | $39/mo | $0 with free model. ClinePass $9.99/mo ($4.99 first month). |
| 🤖 **Models** | GPT-5 mini, Haiku 4.5 (2,000 completions) | Pro catalog + Claude Code/Codex agents | Premium (Opus) | 33 models: DeepSeek V4, Kimi K2.7, GLM 5.2, Qwen3.7, MiMo V2.5, MiniMax M3, GPT-5, Gemini 2.5, Grok 4, plus a free one |
| 🧠 **Reasoning controls** | None | Per-model (GitHub decides) | Per-model (GitHub decides) | Per-family thinking effort you control |
| 🔧 **Agent Mode / tool-calling** | None | Yes | Yes | Yes. Read, edit, terminal. |
| 🎁 **Free model?** | No | No | No (paid tier only) | Yes. `DeepSeek V4 Flash` at $0 balance. |
| 🚫 **Rate limit** | 2,000 completions/mo | Unlimited (rate-limited) | 4× Pro credits | Pay-per-use, or ClinePass 2-5× limits |
| 🔌 **Provider** | GitHub only | GitHub only | GitHub only | Bring any Cline key |

> **Not a replacement.** This extension *extends* Copilot Chat. You still need the free Copilot Chat extension and a GitHub account. BYOK models bypass Copilot billing entirely. You pay Cline directly, or nothing at all on the free model.

---

## 🧠 Models

### Cline: Pay-Per-Use (23 models)

Models are billed per token. No subscription required, just an API key and credits.

| Model | ID | Context | Max Output |
|---|---|---|---|
| **DeepSeek V4 Flash** ⭐ | `deepseek/deepseek-v4-flash` | 1M | 384K |
| **DeepSeek V4 Pro** | `deepseek/deepseek-v4-pro` | 1M | 384K |
| **DeepSeek V3** | `deepseek/deepseek-v3` | 64K | 8K |
| **DeepSeek R1** | `deepseek/deepseek-r1` | 64K | 16K |
| **DeepSeek Chat** | `deepseek/deepseek-chat` | 64K | 8K |
| **GPT-4o** | `openai/gpt-4o` | 128K | 16K |
| **GPT-5** | `openai/gpt-5` | 256K | 16K |
| **o3** | `openai/o3` | 200K | 100K |
| **Gemini 2.5 Pro** | `google/gemini-2.5-pro` | 1M | 65K |
| **Grok 3** | `xai/grok-3` | 131K | 16K |
| **Grok 4** | `xai/grok-4` | 256K | 16K |
| **GLM 5.2** | `zai/glm-5.2` | 1M | 131K |
| **Kimi K2.7 Code** | `moonshot/kimi-k2.7-code` | 256K | 262K |
| **Kimi K2.6** | `moonshot/kimi-k2.6` | 256K | 65K |
| **MiMo V2.5** | `mimo/mimo-v2.5` | 1M | 128K |
| **MiMo V2.5 Pro** | `mimo/mimo-v2.5-pro` | 1M | 128K |
| **MiniMax M3** | `minimax/minimax-m3` | 192K | 131K |
| **Qwen3.7 Max** | `qwen/qwen3.7-max` | 1M | 65K |
| **Qwen3.7 Plus** | `qwen/qwen3.7-plus` | 1M | 65K |
| **Mistral Large** | `mistral/mistral-large` | 128K | 8K |
| **Llama 4 Maverick** | `meta/llama-4-maverick` | 1M | 8K |
| **Sonar Pro** | `perplexity/sonar-pro` | 127K | 8K |
| **Command R+** | `cohere/command-r-plus` | 128K | 4K |

> ⭐ **Free model.** `deepseek/deepseek-v4-flash` returns 200 OK even at $0 balance.

> All model IDs validated directly against the Cline API. `anthropic/claude-*` models are NOT currently available on Cline's API despite being listed in their docs.

### ClinePass: $9.99/mo Subscription (10 models)

Open-weight models with 2 to 5× rate limits vs direct API access. No per-token charges.

| Model | ID | Context | Max Output | Vision | Reasoning |
|---|---|---|---|---|---|
| **DeepSeek V4 Flash** | `cline-pass/deepseek-v4-flash` | 1M | 384K | ❌ | ✅ |
| **DeepSeek V4 Pro** | `cline-pass/deepseek-v4-pro` | 1M | 384K | ❌ | ✅ |
| **GLM 5.2** | `cline-pass/glm-5.2` | 1M | 131K | ✅ | ✅ |
| **Kimi K2.7 Code** | `cline-pass/kimi-k2.7-code` | 256K | 262K | ✅ | ✅ |
| **Kimi K2.6** | `cline-pass/kimi-k2.6` | 256K | 65K | ✅ | ✅ |
| **MiMo V2.5** | `cline-pass/mimo-v2.5` | 1M | 128K | ✅ | ✅ |
| **MiMo V2.5 Pro** | `cline-pass/mimo-v2.5-pro` | 1M | 128K | ✅ | ✅ |
| **MiniMax M3** | `cline-pass/minimax-m3` | 192K | 131K | ✅ | ✅ |
| **Qwen3.7 Max** | `cline-pass/qwen3.7-max` | 1M | 65K | ❌ | ✅ |
| **Qwen3.7 Plus** | `cline-pass/qwen3.7-plus` | 1M | 65K | ✅ | ✅ |

> Subscribe at [app.cline.bot/dashboard/subscription](https://app.cline.bot/dashboard/subscription?personal=true)

### ClinePass Reference Pricing

You pay a flat $9.99/mo. These per-token rates are for quota comparison only:

| Model | Input | Output | Cached Read |
|---|---|---|---|
| DeepSeek V4 Flash | $0.14/M | $0.28/M | $0.003/M |
| DeepSeek V4 Pro | $1.74/M | $3.48/M | $0.015/M |
| MiMo V2.5 | $0.14/M | $0.28/M | $0.003/M |
| MiMo V2.5 Pro | $1.74/M | $3.48/M | $0.015/M |
| MiniMax M3 | $0.30/M | $1.20/M | $0.06/M |
| GLM 5.2 | $1.40/M | $4.40/M | $0.26/M |
| Kimi K2.7 Code | $0.95/M | $4.00/M | $0.19/M |
| Kimi K2.6 | $0.95/M | $4.00/M | $0.16/M |
| Qwen3.7 Plus | $0.40/M | $1.60/M | $0.04/M |
| Qwen3.7 Max | $2.50/M | $7.50/M | $0.50/M |

---

## 🔧 Settings

| Setting | Default | Description |
|---|---|---|
| `clineCopilotChat.temperature` | `0.2` | Sampling temperature |
| `clineCopilotChat.maxTokens` | `0` | Max output tokens (0 = model default) |
| `clineCopilotChat.requestTimeoutSeconds` | `600` | Request timeout |
| `clineCopilotChat.streamIdleTimeoutSeconds` | `120` | Stream idle timeout |
| `clineCopilotChat.debugReasoning` | `false` | Log reasoning content to output channel |
| `clineCopilotChat.stripThinkTags` | `auto` | Handle `<think>` tags in output |
| `clineCopilotChat.thinking.*` | `off` | Per-family thinking mode (deepseek, glm, kimi, minimax, mimo, qwen) |

---

## ❓ FAQ

**How is this different from the Cline extension?**
[Cline](https://cline.bot) is a full autonomous coding agent. File edits, terminal, browser, the works. This extension does something narrower: it puts Cline's models into the Copilot Chat picker you already have. Same Chat, same Agent Mode, more models to choose from.

**Cline vs ClinePass?**
Same API key, same endpoint. Different billing. **Cline** is pay-per-use across 23 models (GPT, Gemini, Grok, and friends). **ClinePass** is $9.99/mo flat for 10 open-weight models with 2 to 5 times the rate limits.

**Can I use this without paying?**
Yes. `DeepSeek V4 Flash` returns 200 OK at $0 balance. Create a key at [app.cline.bot](https://app.cline.bot) and you're in.

**Does Agent Mode work?**
Yes. All models support tool calling. Both Chat and Agent Mode.

**Why not just use Copilot's built-in models?**
Copilot Free gives you a couple. This adds 33 from 12 providers, with a free one included. Pay-per-use or flat subscription, your call.

**Rate limits?**
ClinePass gives 2-5× the standard API limits. Measured over 5-hour rolling, weekly, and monthly windows. Check usage at [app.cline.bot](https://app.cline.bot).

---

## 📁 Project Structure

```
src/
├── extension.ts      # LanguageModelChatProvider, Cline vendor
├── providerTypes.ts  # Vendor constant
├── metadata.ts       # Model limits & capabilities
├── thinking.ts       # Thinking mode for 6 model families
├── streaming.ts      # SSE chat-completions streaming
├── errors.ts         # Error handling
└── retry.ts          # Retry logic
```

---

## 🛠️ Development

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript
npm run watch        # Watch mode
# Press F5 to launch Extension Development Host
```

---

## 📄 License

MIT. See [LICENSE](./LICENSE).

---

## 💬 Community

[GitHub Issues](https://github.com/ltmoerdani/cline-copilot-chat/issues) · [X / Twitter](https://twitter.com/intent/tweet?text=Using%2033%2B%20AI%20models%20in%20GitHub%20Copilot%20Chat%20with%20BYOK!&url=https://github.com/ltmoerdani/cline-copilot-chat&hashtags=vscode%2ccopilot%2cai%2cbyok%2ccline) · [Reddit](https://www.reddit.com/submit?url=https://github.com/ltmoerdani/cline-copilot-chat&title=Cline%20for%20Copilot%20Chat)

If this saved you money or got a model working you needed, ⭐ star the repo.

> 📝 **Found this useful?** [Leave a review on the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ltmoerdani.cline-copilot-chat&ssr=false#review-details). It helps others find the extension.

### 🚀 Also from this publisher

Looking for **OpenCode Zen / Go** models in Copilot Chat? Check out [**OpenCode for Copilot Chat**](https://marketplace.visualstudio.com/items?itemName=ltmoerdani.opencode-copilot-chat). 5,000+ installs, 30+ models, rotating free tier.

---

<div align="center">

Independent project. Not affiliated with GitHub, Microsoft, Cline Bot Inc., or any model provider.

⬆ [Back to top](#-cline-copilot-chat-byok-33-ai-models)

</div>

