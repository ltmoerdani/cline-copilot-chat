<div align="center">

# 🪶 Cline Copilot Chat

### **Supercharge Copilot** with 33 frontier models
DeepSeek V4 · Claude · GPT · Gemini · Grok · Qwen · MiMo · Kimi · GLM · Mistral · Llama · Sonar · Command R+

**Two providers, one key** · Pay-per-use or subscription · Free model available · Copilot Chat + Agent Mode

[![VS Code](https://img.shields.io/badge/VS%20Code-1.120%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-blue)](https://github.com/ltmoerdani/cline-copilot-chat/releases)

[**⚡ Quick Start**](#-quick-start) · [**🧠 Models**](#-models) · [**🔧 Settings**](#-settings) · [**❓ FAQ**](#-faq)

</div>

---

> ### 💡 What is this?
>
> This extension adds **two providers** to Copilot Chat's model picker — **Cline** (pay-per-use, 23 models) and **ClinePass** ($9.99/mo subscription, 10 curated models). Same API key, same endpoint, one extension.
>
> | Provider | Billing | Models | Best for |
> |---|---|---|---|
> | **Cline** | Pay-per-use | 23 models (DeepSeek, GPT, Gemini, Grok, Qwen, Mistral, Llama, Sonar, Command R+, …) | Flexibility — pick any model, pay per token |
> | **ClinePass** | $9.99/mo flat | 10 curated open-weight models with 2–5× rate limits | Heavy usage — flat rate, no surprises |
>
> **One API key works for both.** Start with the free model (`DeepSeek V4 Flash`) to test, then upgrade as needed.

---

## ⚡ Quick Start

```text
1.  Install GitHub Copilot Chat (free) ──────────────────────────── ✓
2.  Install this extension ──────────────────────────────────────── ✓
3.  Get API key → app.cline.bot → Settings → API Keys ──────────── ✓
4.  Open Copilot Chat → model picker → select a Cline model ────── ✓
5.  Paste API key when prompted → CHAT 🎉
```

> **No subscription required to start** — `DeepSeek V4 Flash` is free and works immediately with just an API key.

<details>
<summary><b>📖 Detailed step-by-step</b></summary>

1. **Install [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat)** — free, requires only a GitHub account.
2. **Install this extension** — press `F5` in this repo for dev mode, or install the `.vsix` file.
3. **Create an API key:**
   - Go to [app.cline.bot](https://app.cline.bot) → **Settings** → **API Keys**
   - Click **Create API Key** and copy it immediately
4. **Open Copilot Chat** (Cmd/Ctrl+Shift+I, or click the Copilot icon).
5. **Click the model picker** (current model name) → **Add Models…**
6. **Select "Cline" or "ClinePass"** from the provider list.
7. **Paste your API key** when prompted (stored securely in VS Code SecretStorage).
8. **Select a model** and start chatting. 🚀

> **💡 Tips:**
> - Your API key is stored in VS Code SecretStorage — it never leaves your machine.
> - One key works for both Cline (pay-per-use) and ClinePass (subscription).
> - Run **Cline Copilot Chat: Set API Key** command to update your key at any time.
> - Run **Cline Copilot Chat: Diagnostics** to inspect registered model metadata.

</details>

---

## 🧠 Models

### Cline — Pay-Per-Use (23 models)

Models are billed per token. No subscription required — just an API key and credits.

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

> ⭐ **Free model** — `deepseek/deepseek-v4-flash` returns 200 OK even with $0 balance.

> All model IDs validated directly against the Cline API. `anthropic/claude-*` models are NOT currently available on Cline's API despite being listed in their docs.

### ClinePass — $9.99/mo Subscription (10 models)

Curated open-weight models with 2–5× rate limits vs direct API access. No per-token charges.

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

## 🧩 Features

| Feature | Details |
|---|---|
| 🔌 **Native Copilot Chat** | Both providers appear in the standard model picker — no separate panel |
| 💳 **Dual billing** | Pay-per-use (Cline) or subscription (ClinePass) — choose per model |
| 🧠 **Thinking mode** | Per-model reasoning controls (DeepSeek, GLM, Kimi, MiniMax, MiMo, Qwen) |
| 🔒 **Secure** | API key stored in VS Code SecretStorage — shared across both providers |
| ⚡ **Fast streaming** | Server-Sent Events for real-time response delivery |
| 🎯 **Smart defaults** | Temperature, timeout, and streaming idle timeout configurable |
| 📊 **Diagnostics** | Run **Cline Copilot Chat: Diagnostics** to inspect model metadata |
| 🧩 **Future-proof** | New models on `api.cline.bot` work without code changes |

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

**How is this different from installing Cline?**
[Cline](https://cline.bot) is a full autonomous coding agent with file editing, terminal access, and browser control. This extension is different — it **adds models to your existing Copilot Chat** picker. Same Chat + Agent Mode, just way more models.

**What's the difference between Cline and ClinePass?**
Same API key, same endpoint — different billing. **Cline** is pay-per-use (credits, 23 models including GPT, Gemini, Grok). **ClinePass** is a $9.99/mo flat subscription (10 curated open-weight models with 2–5× rate limits).

**Can I use this without paying anything?**
Yes. `DeepSeek V4 Flash` is free — returns 200 OK even with $0 balance. Just create an API key at [app.cline.bot](https://app.cline.bot).

**Can I use this with Copilot Agent Mode?**
Yes. All models support tool calling and work in both Chat and Agent Mode.

**Why not just use Copilot's built-in models?**
Copilot's free tier gives you a few models. This unlocks the entire open-weight frontier — 33 models from 12 providers — with the choice of pay-per-use or flat-rate subscription.

**What about rate limits?**
ClinePass gives you 2-5× the standard API rate limits. Usage is measured against 5-hour rolling, weekly, and monthly windows. Check your usage at [app.cline.bot](https://app.cline.bot).

---

## 📁 Project Structure

```
src/
├── extension.ts      # LanguageModelChatProvider — Cline vendor
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

MIT — see [LICENSE](./LICENSE)

