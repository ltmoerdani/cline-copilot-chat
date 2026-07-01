<div align="center">

# 🪶 Cline Copilot Chat

### **Supercharge Copilot** with 10 frontier open-weight models
DeepSeek V4 · Qwen 3.7 · MiMo V2.5 · Kimi K2.7 · GLM 5.2 · MiniMax M3 — all in your native model picker

**$9.99/mo** · 2-5x rate limits · One API key · Copilot Chat + Agent Mode

[![VS Code](https://img.shields.io/badge/VS%20Code-1.120%2B-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/Version-0.1.0-blue)](https://github.com/ltmoerdani/cline-copilot-chat/releases)

[**⚡ Quick Start**](#-quick-start) · [**🧠 Models**](#-models) · [**🔧 Settings**](#-settings) · [**❓ FAQ**](#-faq)

</div>

---

> ### 💡 What is this?
>
> Copilot Chat ships with GitHub's built-in models. This extension **unlocks 10 more frontier models** directly in the same model picker — no new panels, no new workflows.
>
> | What you get | Details |
> |---|---|
> | **10 open-weight models** | DeepSeek V4, Qwen 3.7, MiMo V2.5, Kimi K2.7, GLM 5.2, MiniMax M3 — all curated |
> | **Native integration** | Appear in Copilot Chat's model picker. Use Chat, Agent Mode, inline assist — same UX |
> | **2-5× rate limits** | ClinePass flat $9.99/mo beats per-token pricing on any single model |
> | **One API key** | One subscription, one endpoint (`api.cline.bot`), zero config |
> | **Future-proof** | New Cline-native models land on the same endpoint — no code changes needed |
>
> **Think of it as Copilot + the entire open-weight frontier, for $9.99/mo.**

---

## ⚡ Quick Start

```text
1.  Install GitHub Copilot Chat (free) ──────────────────────────── ✓
2.  Install this extension ──────────────────────────────────────── ✓
3.  Subscribe to ClinePass → app.cline.bot ──────────────────────── ✓
4.  Create API key → app.cline.bot → Settings → API Keys ───────── ✓
5.  Open Copilot Chat → model picker → select a Cline model ────── ✓
6.  Paste API key when prompted → CHAT 🎉
```

<details>
<summary><b>📖 Detailed step-by-step</b></summary>

1. **Install [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat)** — free, requires only a GitHub account.
2. **Install this extension** — press `F5` in this repo for dev mode, or install the `.vsix` file.
3. **Subscribe to ClinePass:**
   - Go to [app.cline.bot/dashboard/subscription](https://app.cline.bot/dashboard/subscription?personal=true)
   - Subscribe for **$4.99 first month** (then $9.99/mo)
4. **Create an API key:**
   - Go to [app.cline.bot](https://app.cline.bot) → **Settings** → **API Keys**
   - Click **Create API Key** and copy it immediately
5. **Open Copilot Chat** (Cmd/Ctrl+Shift+I, or click the Copilot icon).
6. **Click the model picker** (current model name) → **Add Models…**
7. **Select "Cline"** from the provider list.
8. **Paste your API key** when prompted (stored securely in VS Code SecretStorage).
9. **Pick the models** you want enabled.
10. **Select any Cline model** from the picker and start chatting. 🚀

> **💡 Tips:**
> - Your API key is stored in VS Code SecretStorage — it never leaves your machine.
> - Run **Cline Copilot Chat: Set API Key** command to update your key at any time.
> - Run **Cline Copilot Chat: Diagnostics** from the Manage panel to verify your key works.

</details>

---

## 🧠 Models

10 curated open weight models, all included in the $9.99/mo subscription. No per-token charges.

| Model | ID | Context | Max Output | Vision | Reasoning |
|---|---|---|---|---|---|
| **DeepSeek V4 Flash** | `cline/deepseek-v4-flash` | 1M | 384K | ❌ | ✅ |
| **DeepSeek V4 Pro** | `cline/deepseek-v4-pro` | 1M | 384K | ❌ | ✅ |
| **GLM 5.2** | `cline/glm-5.2` | 1M | 131K | ✅ | ✅ |
| **Kimi K2.7 Code** | `cline/kimi-k2.7-code` | 256K | 262K | ✅ | ✅ |
| **Kimi K2.6** | `cline/kimi-k2.6` | 256K | 65K | ✅ | ✅ |
| **MiMo V2.5** | `cline/mimo-v2.5` | 1M | 128K | ✅ | ✅ |
| **MiMo V2.5 Pro** | `cline/mimo-v2.5-pro` | 1M | 128K | ✅ | ✅ |
| **MiniMax M3** | `cline/minimax-m3` | 192K | 131K | ✅ | ✅ |
| **Qwen3.7 Max** | `cline/qwen3.7-max` | 1M | 65K | ❌ | ✅ |
| **Qwen3.7 Plus** | `cline/qwen3.7-plus` | 1M | 65K | ✅ | ✅ |

Specs verified from official provider docs (DeepSeek API, Alibaba Bailian, Moonshot, MiniMax).

### Reference Pricing

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
| 🔌 **Native Copilot Chat** | Models appear in the standard model picker — no separate panel |
| 🧠 **Thinking mode** | Per-model reasoning controls (DeepSeek, GLM, Kimi, MiniMax, MiMo, Qwen) |
| 🔒 **Secure** | API key stored in VS Code SecretStorage |
| ⚡ **Fast streaming** | Server-Sent Events for real-time response delivery |
| 🎯 **Smart defaults** | Temperature, timeout, and streaming idle timeout configurable |
| 📊 **Diagnostics** | Run **Cline Copilot Chat: Diagnostics** to inspect model metadata |
| 🧩 **Future-proof** | New Cline-native models on `api.cline.bot` work without code changes |

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
[Cline](https://cline.bot) is a full autonomous coding agent with file editing, terminal access, and browser control. This extension is different — it **supercharges your existing Copilot Chat** with 10 frontier open-weight models. Same model picker, same Chat + Agent Mode, just way more powerful models to choose from.

**Why not just use Copilot's built-in models?**
Copilot's free tier gives you a few models. This unlocks the entire open-weight frontier — DeepSeek V4, Qwen 3.7, MiMo V2.5, Kimi K2.7, GLM 5.2, MiniMax M3 — all for a flat $9.99/mo. That's 2-5× rate limits vs direct API access, with zero per-token surprises.

**Can I use this with Copilot Agent Mode?**
Yes. All 10 models support tool calling (confirmed via Alibaba Bailian docs) and work in both Chat and Agent Mode — so you get the full Copilot experience with frontier models.

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

