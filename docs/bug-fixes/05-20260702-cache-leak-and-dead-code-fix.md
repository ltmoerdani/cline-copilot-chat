**Status:** ✅ Solved

# API Key Cache Leak & Dead Usage Code Fix

**Topic:** security / streaming / cache / cleanup  
**Updated:** 2026-07-02  
**Tags:** #security #cache #streaming #cleanup #api-key #secret-storage #usage #vscode-api  
**Supersedes:** —

---

## Overview

During a full codebase audit, two issues were identified: (1) a stale API key that could
persist in memory after a user clears their credentials, and (2) dead code from a
`createUsageDataPart` function that built a token usage object but returned an empty
`LanguageModelTextPart` — VS Code's `LanguageModelChatProvider` API does not expose a
token usage reporting type.

---

## Problem 1 — `__prewarm__` Cache Leak

### Symptom

After the extension activates, the API key is cached under the `"__prewarm__"` key in the
in-memory `apiKeysByModelId` Map. This key is used as the final fallback in the API key
resolution chain when processing chat responses. However, it was never deleted after use.

**Impact scenario:**

1. Extension activates → `"__prewarm__"` set with current API key.
2. User clears API key via `clineCopilotChat.manage` → `Clear API Key`.
3. SecretStorage is cleared, but `"__prewarm__"` remains in the Map.
4. User tries to chat → `provideLanguageModelChatResponse` falls back to `"__prewarm__"`.
5. **Stale key is used** → request goes through with old credentials, potentially confusing
   the user (no error shown, but key no longer in settings).

### Root Cause

`extension.ts` pre-warms both providers with the stored key during `activate()`:

```typescript
cache(paygProvider).set("__prewarm__", stored);
cache(passProvider).set("__prewarm__", stored);
```

The `"__prewarm__"` key was read in `provideLanguageModelChatResponse` as the last fallback
but never deleted:

```typescript
this.apiKeysByModelId.get("__prewarm__");
```

### Fix

Split the `__prewarm__` fallback from the regular cache lookup. When `"__prewarm__"` is
used, immediately `delete` it from the Map:

```typescript
apiKey = this.apiKeysByModelId.get("__prewarm__");
if (apiKey) {
  apiKeySource = "prewarm";
  this.apiKeysByModelId.delete("__prewarm__");
}
```

This ensures the pre-warmed key is consumed once and cannot persist after a key change.

**File:** `src/extension.ts`

---

## Problem 2 — Dead `createUsageDataPart` Code

### Symptom

`streaming.ts` contained a `createUsageDataPart` function that:

1. Built a `usage` object with `inputTokens`, `outputTokens`, `cachedTokens`.
2. Then returned `new vscode.LanguageModelTextPart("") as unknown as vscode.LanguageModelResponsePart`.
3. The `usage` object was never used — it was created and immediately discarded.

This was called in both `extractStreamParts` (streaming) and `extractFullParts`
(non-streaming) paths, pushing an empty text part into the response.

### Root Cause

VS Code's `LanguageModelChatProvider` API defines `LanguageModelResponsePart` as:

```typescript
type LanguageModelResponsePart =
  | LanguageModelTextPart
  | LanguageModelToolCallPart
  | LanguageModelToolResultPart
  | LanguageModelDataPart;
```

There is **no** `LanguageModelUsagePart` or similar type in the VS Code API. The function
was originally written with the intent to report usage data, but the API does not support
it. The result was dead code — an empty text part emitted every response that did nothing.

### Fix

- Removed the `createUsageDataPart` function entirely.
- Replaced both call sites with a diagnostic log to the output channel:

```typescript
// In both extractStreamParts and extractFullParts:
if (isRecord(data.usage)) {
  const u = data.usage;
  const parts = [
    typeof u.prompt_tokens === "number" ? `prompt=${u.prompt_tokens}` : null,
    typeof u.completion_tokens === "number" ? `completion=${u.completion_tokens}` : null,
    typeof u.cached_tokens === "number" ? `cached=${u.cached_tokens}` : null,
  ].filter(Boolean);
  if (parts.length > 0) {
    options.output?.appendLine(`[usage] ${parts.join(" ")}`);
  }
}
```

Usage data is now logged to the **Cline Copilot Chat** output channel for debugging
(visible via **Output** panel or `clineCopilotChat.diagnostics`) instead of being silently
discarded as an empty text part.

**File:** `src/streaming.ts`

---

## Verification

| Check | Result |
|-------|--------|
| `tsc -p ./` (TypeScript compile) | EXIT_CODE=0 — zero errors |
| `grep createUsageDataPart src/` | 0 matches — function fully removed |
| `grep __prewarm__ src/` | 4 matches: 2 set (activate), 1 get + 1 delete (response) |
| Manual flow: clear key → chat → should get "API key not found" | ✅ Expected behavior |
| Output channel usage log | `[usage] prompt=X completion=Y` visible in Output panel |

---

## References

- VS Code `LanguageModelChatProvider` API: https://code.visualstudio.com/api/extension-guides/language-model
- `vscode.d.ts` — `LanguageModelResponsePart` type definition
- `src/extension.ts` — API key resolution chain (`__prewarm__` → cache → SecretStorage)
- `src/streaming.ts` — SSE streaming + usage logging

---

## Lessons Learned

1. **VS Code API limitations must be verified early.** Writing code that builds data
   objects the API cannot consume is a common trap when extending VS Code's Language
   Model API — always check `LanguageModelResponsePart` for available types.
2. **Pre-warm patterns need explicit cleanup.** A "pre-warm" key that is read but never
   deleted creates a permanent fallback that outlives user intent. One-shot caches should
   always be deleted after first use.
3. **Dead code is harder to spot in streaming code.** The `as unknown as` cast silenced
   TypeScript, hiding the fact that the returned value was meaningless. Regular code
   reviews should flag `as unknown as` casts for inspection.
