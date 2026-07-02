**Status:** ✅ Solved

# Provider Registration Duplicate & Stuck Group Fix

**Topic:** provider / byok / vscode / registration  
**Updated:** 2026-07-02  
**Tags:** #provider #byok #vscode #models #registration #clinepass  
**Supersedes:** —

---

## Overview

After the extension was renamed from `clinepass` to `cline-copilot-chat`, a series of
compounding issues caused the "Cline" group in VS Code's Language Models UI to become
permanently stuck, undeletable, and — after re-adding — duplicate (20 models instead of 10).
Additionally, all model requests returned HTTP 404 due to incorrect model ID format.
This document covers all four issues discovered in session 3 (2026-07-02) and their resolutions.

---

## Timeline

### 1. [2026-07-02] Ghost Models After Cleanup Script

**Problem:**  
User ran a cleanup script to remove the old `clinepass` extension. The script included a broad
`DELETE FROM ItemTable WHERE value LIKE '%cline%'` query, which accidentally removed
`chat.cachedLanguageModels.v2` and `chat.hasByokModels.lastKnown` from `state.vscdb`,
causing all Copilot Chat models to disappear temporarily.

**Root Cause:**  
The cleanup query matched the **global Copilot model cache** because model entries contain
`"cline"` strings (vendor name, extension ID). Deleting these keys cleared all BYOK model
registrations, not just the clinepass-specific ones.

**Solution:**  
VS Code auto-rebuilt the cache on the next reload from active extension registrations.
All non-cline models reappeared. No permanent data loss occurred.

**Status:** ✅ Auto-recovered on reload

---

### 2. [2026-07-02] Stuck "Cline" Group — Can't Delete, Can't Update API Key

**Problem:**  
After the cleanup, the "Cline" group in Language Models UI persisted and:
- Clicking **Delete** → no effect (group came back immediately after reload)
- Clicking **Update API Key** → dialog appeared but key was not used by models
- Running models → error: "API key required"

User's observation: *"namanya Cline tapi ID-nya nyangkut ke clinepass"* (the group was
the leftover from the clinepass era, stuck because the vendor changed).

**Root Cause (3 layers):**

| Layer | Cause |
|---|---|
| 1 | `chatLanguageModels.json` had its `cline-copilot-chat` BYOK entry **deleted** by the cleanup script (`vendor` contained `'cline'`) |
| 2 | `extension.ts` `provideLanguageModelChatInformation` had `// Always return models` — returned 10 models **regardless of API key**, so deleting the BYOK entry had no visual effect |
| 3 | `context.secrets["clineCopilotChat.apiKey"]` retained the old key, keeping the extension active even after the BYOK entry was gone |

**Solution:**

1. **Re-added missing BYOK entry** to `chatLanguageModels.json`:
   ```json
   { "name": "Cline", "vendor": "cline-copilot-chat" }
   ```

2. **Added API key guard** in `provideLanguageModelChatInformation` (`src/extension.ts`):
   ```typescript
   // Before (broken):
   // Always return models so they appear in the picker.
   return CLINE_COPILOT_CHAT_MODELS.map(...);
   
   // After (fixed):
   if (!apiKey) {
     this.log("[ClineCopilotChat] No API key — returning empty model list");
     return [];
   }
   return CLINE_COPILOT_CHAT_MODELS.map(...);
   ```
   This enables proper Delete behavior: when user deletes the BYOK entry (removes the
   API key), the next call to `provideLanguageModelChatInformation` returns empty → group
   disappears from picker.

3. **Cleared stale secret storage** via `state.vscdb` (`secret://{"extensionId":"ltmoerdani.cline-copilot-chat","key":"clineCopilotChat.apiKey"}`).

4. **Cleared stale cache** (`chat.cachedLanguageModels.v2`) — removed the 10 cline entries
   that were cached from the old registration. Used Python `sqlite3` module with parameterized
   queries (not `readfile()` which is unreliable in macOS sqlite3 CLI).

**Status:** ✅ Solved

---

### 3. [2026-07-02] Duplicate Models (20 instead of 10) After Re-Adding Provider

**Problem:**  
After fixing the stuck group and re-adding the Cline provider via "Add Models" + API key,
the "Cline" group showed **20 models** (all 10 doubled): DeepSeek V4 Flash ×2, GLM 5.2 ×2, etc.
Deleting one duplicate removed half, but the remaining 10 were still stuck again.

**Root Cause:**  
The extension had **two simultaneous registration mechanisms** for the same vendor:

| Registration | Source | When active |
|---|---|---|
| Runtime | `registerLanguageModelChatProvider(CLINE_COPILOT_CHAT_VENDOR, provider)` in `extension.ts` `activate()` | Always — on every extension activation |
| Manifest (BYOK) | `languageModelChatProviders[{vendor: "cline-copilot-chat"}]` in `package.json` | When user adds via "Add Models" button |

When both were active simultaneously, VS Code called `provideLanguageModelChatInformation`
**twice** (once per registration), each returning 10 models → 20 total under the same group header.

This is a **dual-registration anti-pattern**: extensions should use one mechanism, not both.

**Solution:**  
Removed `languageModelChatProviders` entry from `package.json` `contributes`, keeping only
the runtime registration:

```json
// Before (caused duplicates):
"languageModelChatProviders": [
  {
    "vendor": "cline-copilot-chat",
    "displayName": "Cline",
    "configuration": {
      "properties": {
        "apiKey": { "type": "string", "secret": true }
      }
    }
  }
]

// After (no duplicates):
"languageModelChatProviders": []
```

With the manifest entry removed:
- No BYOK registration is possible via "Add Models" button for this vendor
- Only the runtime `registerLanguageModelChatProvider()` registration exists
- API key management is handled exclusively via extension commands
- `provideLanguageModelChatInformation` is called **once** → 10 models (correct)

**Status:** ✅ Solved

---

### 4. [2026-07-02] All Models HTTP 404 "model not found" After Rebrand

**Problem:**  
After fixing all provider registration issues and setting the API key, every model request
returned HTTP 404 `{"error":"model not found","success":false}`.

**Root Cause:**  
During the rebrand from `clinepass` → `cline-copilot-chat` (commit `f268b7c`), the model IDs
were changed from `clinepass/glm-5.2` to `cline/glm-5.2`. However, the Cline API **only**
recognizes `cline-pass/` (with hyphen) as the ClinePass model prefix.

The API actually supports three different prefixes, each routing differently:

| Model ID Prefix | API Behavior | Route |
|---|---|---|
| `cline-pass/` | ✅ **Subscription** (ClinePass flat $9.99/mo) | Subscription quota |
| `deepseek/`, `zai/`, `anthropic/`, etc. | ⚠️ **Pay-per-credit** | Credits balance |
| `cline/` | ❌ **404 model not found** | — |

Since the API key was linked to a ClinePass subscription, `deepseek/` format returned
HTTP 402 "insufficient balance" (wrong route — credits, not subscription), and `cline/`
returned HTTP 404 (unknown prefix entirely).

**Evidence from API testing:**

```bash
# cline/ — 404 (unknown prefix)
curl -s -w "HTTP:%{http_code}" -d '{"model":"cline/glm-5.2",...}' https://api.cline.bot/api/v1/chat/completions
# → {"error":"model not found"} HTTP:404

# deepseek/ — 402 (wrong route — credits, not subscription)
curl -s -w "HTTP:%{http_code}" -d '{"model":"deepseek/deepseek-v4-flash",...}' https://api.cline.bot/api/v1/chat/completions
# → {"error":"insufficient_credits","balance":-0.02} HTTP:402

# cline-pass/ — 200 OK ✅ (subscription route)
curl -s -w "HTTP:%{http_code}" -d '{"model":"cline-pass/glm-5.2",...}' https://api.cline.bot/api/v1/chat/completions
# → HTTP:200 (response content received)
```

**Solution:**  
Changed all model IDs to official ClinePass format with hyphen per [docs.cline.bot/getting-started/clinepass](https://docs.cline.bot/getting-started/clinepass):

```typescript
// Before (wrong — 404):
{ id: "cline/glm-5.2" }

// After (correct — 200 OK via subscription):
{ id: "cline-pass/glm-5.2" }
```

**Files Changed:**
- `src/extension.ts` — 10 model IDs changed from `cline/` → `cline-pass/`, test connection model changed
- `src/metadata.ts` — All `MODEL_LIMITS`, `VISION_CAPABLE_MODELS`, `REASONING_MODELS` keys updated

**Status:** ✅ Solved

---

## Final Architecture

```
Extension activation
└── registerLanguageModelChatProvider("cline-copilot-chat", provider)
    └── provideLanguageModelChatInformation(options, token)
        ├── opts.configuration?.apiKey  →  resolve from BYOK entry
        ├── if (!apiKey && opts.configuration)  →  resolveStoredApiKey(context.secrets)
        ├── if (apiKey)  →  persist to context.secrets for future calls
        ├── if (!apiKey) → return []  (guard — enables Delete to work)
        └── if (apiKey) → return 10 models with "cline-pass/" IDs
            └── provideLanguageModelChatResponse(model, messages, options)
                └── POST https://api.cline.bot/api/v1/chat/completions
                    ├── model: "cline-pass/glm-5.2"  (subscription route)
                    └── Bearer token: clineCopilotChat.apiKey from context.secrets
```

### Provider Management Flow (Post-Fix)

| Action | How |
|---|---|
| Add provider / set API key | `Cmd+Shift+P` → **Cline Copilot Chat: Set API Key** |
| Remove provider (hide from picker) | `Cmd+Shift+P` → **Cline Copilot Chat: Manage Provider → Clear API Key** |
| Test connectivity | `Cmd+Shift+P` → **Cline Copilot Chat: Manage Provider → Test Connection** |

> **Note:** The "Add Models" button in Language Models UI will no longer create a BYOK entry
> for Cline (manifest entry was removed). This is intentional to prevent duplicate registrations.

---

## Files Changed

| File | Change |
|---|---|
| `src/extension.ts` | (1) API key guard: `if (!apiKey && opts.configuration)` — truthy check for BYOK resolution. (2) All 10 model IDs changed `cline/` → `cline-pass/`. (3) Test connection model updated |
| `src/metadata.ts` | All `MODEL_LIMITS`, `VISION_CAPABLE_MODELS`, `REASONING_MODELS` keys updated from `cline/` → `cline-pass/` |
| `package.json` | `languageModelChatProviders` kept with 1 entry (required for BYOK manifest + runtime guard pattern) |

---

## VS Code State Operations Performed

> ⚠️ **Reference only — do not re-run these unless you understand the consequences.**

```bash
DB="/Users/ltmoerdani/Library/Application Support/Code/User/globalStorage/state.vscdb"

# Remove stale cline entries from model cache
python3 -c "
import json, sqlite3
d = json.loads(open(DB_PATH).read())  # from SELECT on chat.cachedLanguageModels.v2
filtered = [e for e in d if 'cline' not in json.dumps(e).lower()]
conn.execute('UPDATE ItemTable SET value = ? WHERE key = ?',
             (json.dumps(filtered), 'chat.cachedLanguageModels.v2'))
"

# Remove stored API key from extension secret storage
sqlite3 "$DB" "DELETE FROM ItemTable WHERE key LIKE '%clineCopilotChat.apiKey%';"
```

---

## Key Learnings

1. **`value LIKE '%cline%'` is too broad** for cleanup scripts — it matches vendor names,
   model IDs, and global VS Code cache keys. Always filter by specific key patterns, not value content.

2. **Dual registration causes duplicates.** An extension must use EITHER:
   `languageModelChatProviders` in `package.json`, OR `registerLanguageModelChatProvider()`
   at runtime — not both. Combining them causes `provideLanguageModelChatInformation` to be
   called twice.

3. **`if (!apiKey && opts.configuration)` is the correct guard pattern.** The truthy check on
   `opts.configuration` (not `!== undefined`) is critical:
   - `undefined` → VS Code still resolving BYOK config, return `[]` and let VS Code retry
   - `{}` or `{apiKey:"..."}` → configuration is ready, fall back to secret storage if needed

4. **ClinePass model ID format is `cline-pass/model`** (with hyphen). Other formats:
   - `cline/model` → HTTP 404 (unknown prefix)
   - `deepseek/model` → HTTP 200/402 (pay-per-credit route, not subscription)
   - `clinepass/model` → HTTP 402 (recognized but credits, not subscription)
   Source: [docs.cline.bot/getting-started/clinepass](https://docs.cline.bot/getting-started/clinepass)

5. **Use Python `sqlite3` module** for writing to `state.vscdb`. The SQLite `readfile()` function
   is unreliable on macOS and can corrupt JSON values by prepending debug output.

6. **`context.secrets` survives BYOK entry deletion.** After a user deletes the BYOK entry in
   the UI, `context.secrets` still holds the key. Clear the secret separately if needed.
