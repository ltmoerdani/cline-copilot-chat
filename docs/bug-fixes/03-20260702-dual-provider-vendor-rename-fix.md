**Status:** ✅ Solved

# Dual Provider Vendor Rename Fix

**Topic:** provider / byok / vscode / registration / vendor  
**Updated:** 2026-07-02  
**Tags:** #provider #byok #vscode #vendor #registration #cline #clinepass  
**Supersedes:** —

---

## Overview

After implementing dual providers (Cline pay-per-use + ClinePass subscription),
the extension used vendor IDs `cline-payg` and `cline-pass`. This caused HTTP 401
errors because VS Code's BYOK (Bring Your Own Key) system required re-entering
API keys for the new vendor names, and the previously-stored API key in secret
storage was not properly resolved. Additionally, a `thinkingFamily()` regex bug
broke thinking mode for all ClinePass models.

This document covers the vendor rename fix and the thinking.ts regex fix from
session 4 (2026-07-02).

---

## Timeline

### 1. [2026-07-02] Incorrect Vendor ID `cline-payg` — 401 Unauthorized

**Problem:**  
After implementing dual providers with vendor IDs `cline-payg` and `cline-pass`,
all model requests returned HTTP 401. The extension appeared to work (models
appeared in the picker), but every actual API request failed with 401.

User's observation: *"install gagal — HTTP 401"*

**Root Cause (2 layers):**

| Layer | Cause |
|---|---|
| 1 | Vendor ID `cline-payg` was wrong — should be `cline`. The docs (bug-fix #02) already established that `cline` is the valid pay-per-use vendor name for the Cline API. |
| 2 | VS Code's BYOK system stores API keys per vendor. When vendor changes from `cline-copilot-chat` → `cline-payg`, the old key in secret storage still resolves, but VS Code's internal BYOK cache (`chatLanguageModels.json`) has no entry for the new vendor, causing a mismatch. |

**Evidence:**  
The docs in `02-20260702-provider-registration-duplicate-fix.md` section 4 documented:
- `cline/{model}` → ❌ HTTP 404 (unknown prefix)
- `cline-pass/{model}` → ✅ HTTP 200 (subscription)
- `deepseek/{model}` → ⚠️ HTTP 402 (pay-per-credit)

But the **vendor name** (not model ID prefix) was never explicitly documented.
The correct vendor for Cline's pay-per-use is `cline`.

**Solution:**  
Renamed vendor constant from `CLINE_PAYG_VENDOR = "cline-payg"` to `CLINE_VENDOR = "cline"`.

```typescript
// Before (wrong):
export const CLINE_PAYG_VENDOR = "cline-payg" as const;

// After (correct):
export const CLINE_VENDOR = "cline" as const;
```

**Files Changed:**
- `src/providerTypes.ts` — `CLINE_PAYG_VENDOR` → `CLINE_VENDOR`, value `"cline-payg"` → `"cline"`
- `src/extension.ts` — All references `CLINE_PAYG_VENDOR` → `CLINE_VENDOR`
- `package.json` — `vendor: "cline-payg"` → `vendor: "cline"`, activation event updated

**Status:** ✅ Solved

---

### 2. [2026-07-02] Thinking Mode Broken for All ClinePass Models

**Problem:**  
After implementing dual providers, thinking mode was completely non-functional for
all 10 ClinePass models. Setting thinking to "low", "medium", or "high" had no
effect on model output.

**Root Cause:**  
The `thinkingFamily()` function in `src/thinking.ts` only stripped the `cline/`
prefix, not the `cline-pass/` prefix:

```typescript
// Before (broken):
const bare = modelId.replace(/^cline\//i, "");
// "cline-pass/deepseek-v4-flash" → "cline-pass/deepseek-v4-flash" (NOT stripped!)
// Then /^deepseek-/i.test("cline-pass/deepseek-v4-flash") → false → returns null
```

Since `cline-pass/deepseek-v4-flash` does NOT start with `deepseek-`, all regex
tests failed and `thinkingFamily()` returned `null` for every ClinePass model.

**Impact:**  
Thinking mode disabled for all 10 ClinePass models: DeepSeek V4 Pro/Flash, GLM 5.2,
Kimi K2.7 Code/K2.6, MiMo V2.5/V2.5 Pro, MiniMax M3, Qwen3.7 Max/Plus.

**Solution:**  
Replaced prefix stripping with a two-step approach that handles all vendor formats:

```typescript
// After (fixed):
const bare = modelId
  .replace(/^(?:cline-pass|cline)\//i, "")  // strip cline-pass/ or cline/
  .replace(/^[^/]+\//i, "");                // strip any other provider/ prefix
// "cline-pass/deepseek-v4-flash" → "deepseek-v4-flash" → ✅ "deepseek"
// "deepseek/deepseek-chat" → "deepseek-chat" → ✅ "deepseek"
// "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6" → ✅ null (correct)
```

**Verification:** 20/20 model IDs resolve to the correct thinking family.

| Model ID | Expected | Got |
|---|---|---|
| `cline-pass/deepseek-v4-flash` | `"deepseek"` | `"deepseek"` ✅ |
| `cline-pass/glm-5.2` | `"glm"` | `"glm"` ✅ |
| `cline-pass/kimi-k2.7-code` | `"kimi"` | `"kimi"` ✅ |
| `cline-pass/mimo-v2.5` | `"mimo"` | `"mimo"` ✅ |
| `cline-pass/minimax-m3` | `"minimax"` | `"minimax"` ✅ |
| `cline-pass/qwen3.7-max` | `"qwen"` | `"qwen"` ✅ |
| `deepseek/deepseek-chat` | `"deepseek"` | `"deepseek"` ✅ |
| `anthropic/claude-sonnet-4-6` | `null` | `null` ✅ |
| `openai/gpt-4o` | `null` | `null` ✅ |
| `qwen/qwen3-coder` | `"qwen"` | `"qwen"` ✅ |

**File Changed:**
- `src/thinking.ts` — `thinkingFamily()` regex

**Status:** ✅ Solved

---

### 3. [2026-07-02] VS Code Cache Required Manual Cleanup

**Problem:**  
After the vendor rename, stale cached model entries with the old vendor ID
(`cline-payg`) persisted in VS Code's `state.vscdb`, potentially causing confusion
or stale model picker entries.

**Root Cause:**  
VS Code caches language model registrations in `chat.cachedLanguageModels.v2` in
its state database. When an extension's vendor ID changes, old cached entries
are not automatically removed — they persist until the cache is rebuilt by a
matching extension registration.

**Solution:**  
Cleaned the VS Code state database using Python `sqlite3`:

```python
# Remove stale cached models
cur.execute("SELECT value FROM ItemTable WHERE key='chat.cachedLanguageModels.v2'")
data = json.loads(cur.fetchone()[0])
data = [m for m in data if "cline-payg" not in str(m.get("identifier",""))]
cur.execute("UPDATE ItemTable SET value=? WHERE key='chat.cachedLanguageModels.v2'",
            (json.dumps(data),))

# Clear BYOK entries to force fresh key entry
cur.execute("DELETE FROM ItemTable WHERE key='chatLanguageModels.json'")
```

**⚠️ Lesson Learned:**  
Do NOT use `pkill` or kill VS Code processes during active development — this can
corrupt the running session and cause marketplace loading issues. Always let the
user manage VS Code restarts.

**Status:** ✅ Solved

---

## Verification Checklist

After applying these fixes:

1. ✅ `vendor=cline` in `package.json` languageModelChatProviders
2. ✅ `vendor=cline-pass` in `package.json` languageModelChatProviders
3. ✅ `onLanguageModelChatProvider:cline` in activationEvents
4. ✅ `onLanguageModelChatProvider:cline-pass` in activationEvents
5. ✅ `thinkingFamily()` handles `cline-pass/`, `cline/`, and `provider/` prefixes
6. ✅ No stale `cline-payg` references in source code
7. ✅ Compile clean (0 errors)
8. ✅ VS Code cache cleaned of old vendor entries

## Related Documents

- [01-20260701-deepseek-v4-flash-tool-calling-fix.md](./01-20260701-deepseek-v4-flash-tool-calling-fix.md) — Tool calling XML parser
- [02-20260702-provider-registration-duplicate-fix.md](./02-20260702-provider-registration-duplicate-fix.md) — Provider registration & model ID format
- [02-20260702-dual-provider-architecture.md](../features/02-20260702-dual-provider-architecture.md) — Feature spec for dual providers
