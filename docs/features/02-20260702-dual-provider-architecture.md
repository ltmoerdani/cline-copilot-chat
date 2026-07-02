**Status:** ✅ Implemented

# Dual Provider Architecture

**Topic:** architecture / provider / byok / vscode / models / billing  
**Updated:** 2026-07-02  
**Tags:** #architecture #provider #byok #vscode #cline #clinepass #billing #dual-provider  
**Supersedes:** —

---

## Overview

Cline Copilot Chat now registers **two separate language model providers** in VS Code's
Copilot Chat model picker:

1. **Cline** (`cline`) — Pay-per-use billing, 13+ models from multiple providers
2. **ClinePass** (`cline-pass`) — $9.99/mo flat subscription, 10 curated open-weight models with 2–5× rate limits

Both share the **same API key** and the **same endpoint** (`https://api.cline.bot/api/v1`).
The model-ID prefix determines billing: `deepseek/` routes to credits, `cline-pass/`
routes to the subscription quota.

---

## Architecture

### Pattern: Shared Provider Class

A single `ClineProvider` class is instantiated twice with different configuration:

```
┌──────────────────────────────────────────────────────────┐
│                    extension.ts                           │
│                                                          │
│  PROVIDER_CONFIGS = {                                     │
│    "cline":     { vendor, displayName, models, ... },    │
│    "cline-pass": { vendor, displayName, models, ... },   │
│  }                                                       │
│                                                          │
│  const paygProvider = new ClineProvider(ctx, configs.cline)│
│  const passProvider = new ClineProvider(ctx, configs["cline-pass"])│
│                                                          │
│  lm.registerLanguageModelChatProvider("cline", paygProvider)    │
│  lm.registerLanguageModelChatProvider("cline-pass", passProvider)│
└──────────────────────────────────────────────────────────┘
```

### API Key Sharing

Both providers share one secret storage key (`clineCopilotChat.apiKey`). The user enters
the API key once; both providers read from the same store.

```
User enters API key once
        ↓
  resolveStoredApiKey() reads from SecretStorage
        ↓
  ├── Cline provider (pay-per-use) ← same key
  └── ClinePass provider (subscription) ← same key
```

### Model Routing

| Provider | Vendor ID | Model ID Format | Billing | Example |
|---|---|---|---|---|
| Cline | `cline` | `provider/model` | Pay-per-use | `deepseek/deepseek-chat` |
| ClinePass | `cline-pass` | `cline-pass/model` | $9.99/mo flat | `cline-pass/glm-5.2` |

---

## Model Catalog

### Cline (Pay-Per-Use) — 13 Models

| Model | ID | Family | Context | Output |
|---|---|---|---|---|
| DeepSeek Chat | `deepseek/deepseek-chat` | DeepSeek | 64K | 8K |
| DeepSeek Reasoner | `deepseek/deepseek-reasoner` | DeepSeek | 64K | 16K |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` | Anthropic | 200K | 65K |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Anthropic | 200K | 16K |
| GPT-4o | `openai/gpt-4o` | OpenAI | 128K | 16K |
| GPT-4o Mini | `openai/gpt-4o-mini` | OpenAI | 128K | 16K |
| Gemini 2.5 Pro | `google/gemini-2.5-pro` | Google | 1M | 65K |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | Google | 1M | 65K |
| Qwen3.7 Max | `qwen/qwen3.7-max` | Qwen | 1M | 65K |
| Qwen3 Coder | `qwen/qwen3-coder` | Qwen | 256K | 32K |
| MiniMax M2.5 | `minimax/minimax-m2.5` | MiniMax | 1M | 65K |
| GLM-5 | `zhipu/glm-5` | Z.ai | 1M | 131K |
| Kimi K2 | `moonshot/kimi-k2` | Moonshot AI | 131K | 65K |

> ⚠️ Pay-per-use models require Cline credits in your account. Free model:
> `minimax/minimax-m2.5`.

### ClinePass ($9.99/mo Subscription) — 10 Models

| Model | ID | Family | Context | Output |
|---|---|---|---|---|
| GLM 5.2 | `cline-pass/glm-5.2` | Z.ai | 1M | 131K |
| Kimi K2.7 Code | `cline-pass/kimi-k2.7-code` | Moonshot AI | 256K | 262K |
| Kimi K2.6 | `cline-pass/kimi-k2.6` | Moonshot AI | 256K | 65K |
| DeepSeek V4 Pro | `cline-pass/deepseek-v4-pro` | DeepSeek | 1M | 384K |
| DeepSeek V4 Flash | `cline-pass/deepseek-v4-flash` | DeepSeek | 1M | 384K |
| MiMo V2.5 | `cline-pass/mimo-v2.5` | MiMo | 1M | 128K |
| MiMo V2.5 Pro | `cline-pass/mimo-v2.5-pro` | MiMo | 1M | 128K |
| MiniMax M3 | `cline-pass/minimax-m3` | MiniMax | 192K | 131K |
| Qwen3.7 Max | `cline-pass/qwen3.7-max` | Qwen | 1M | 65K |
| Qwen3.7 Plus | `cline-pass/qwen3.7-plus` | Qwen | 1M | 65K |

---

## File Structure

```
src/
├── providerTypes.ts    — Vendor constants (CLINE_VENDOR, CLINE_PASS_VENDOR), BASE_URL, routing
├── metadata.ts         — CLINEPASS_MODELS, CLINE_MODELS, resolveModelMetadata()
├── extension.ts        — ClineProvider class, PROVIDER_CONFIGS, activate() with dual registration
├── thinking.ts         — thinkingFamily() (handles both vendor prefixes)
├── streaming.ts        — OpenAI-compatible SSE streaming (shared by both providers)
├── errors.ts           — ClineCopilotChatRequestError (HTTP 401/402/429 handling)
├── toolParsing.ts      — XML tool call parser for non-native tool-calling models
└── retry.ts            — Exponential backoff retry logic
```

---

## Key Design Decisions

### Why Two Providers Instead of One?

The Cline API uses the **same key** for both billing models, but VS Code's provider
system maps each vendor to a separate group in the model picker. Two vendors means:

- **Clear UX separation**: Users see "Cline" and "ClinePass" as distinct groups
- **No confusion about billing**: Each model shows under the correct provider
- **Future extensibility**: Architecture supports adding more vendors if needed

### Why Shared API Key?

Cline's API uses a single endpoint and a single key. The model ID prefix determines
billing. Storing one key avoids the UX burden of requiring two separate key entries.

### Why `cline` (not `cline-payg`)?

Tested and verified against the Cline API:
- `cline` is the recognized vendor name for pay-per-use billing
- `cline-pass` is the recognized vendor name for subscription billing
- `cline-payg` was a custom invention that caused HTTP 401 errors

See: [03-20260702-dual-provider-vendor-rename-fix.md](../bug-fixes/03-20260702-dual-provider-vendor-rename-fix.md)

---

## Related Documents

- [02-20260702-provider-registration-duplicate-fix.md](../bug-fixes/02-20260702-provider-registration-duplicate-fix.md) — Original provider registration & model ID format
- [03-20260702-dual-provider-vendor-rename-fix.md](../bug-fixes/03-20260702-dual-provider-vendor-rename-fix.md) — Vendor rename & thinking.ts fix
- [01-20260701-initial-build-session.md](./01-20260701-initial-build-session.md) — Initial build session
