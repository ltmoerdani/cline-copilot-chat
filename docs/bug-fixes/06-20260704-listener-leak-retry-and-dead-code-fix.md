**Status:** ✅ Solved

# Listener Leak, Retry Dead Code, and Cleanup Fix

**Topic:** streaming / memory-leak / retry / cleanup
**Updated:** 2026-07-04
**Tags:** #streaming #memory-leak #cancellation #retry #dead-code #cleanup #vscode-api
**Supersedes:** —

---

## Overview

During a second deep-dive codebase audit (Session 7), 12 potential bugs were analyzed across
8 source files (~1,200 lines). After verifying each against the actual code, VS Code API docs
(`vscode.d.ts`), and MDN web docs, **5 bugs were confirmed and fixed**. 4 additional findings
were ruled out as false positives with evidence.

---

## Problem 1 — CancellationToken Listener Leak (HIGH)

### Symptom

In `streamChatResponse()` (`src/streaming.ts`), the SSE read loop used `Promise.race` to race
`reader.read()` against a cancellation promise. The cancellation listener was registered **inside
the `while(true)` loop**, meaning every SSE chunk added a new listener to the `CancellationToken`:

```typescript
while (true) {
  const { done, value } = await Promise.race([
    reader.read(),
    new Promise<{ done: true; value: undefined }>((resolve) => {
      const onAbort = () => resolve({ done: true; value: undefined });
      options.token.onCancellationRequested(onAbort);  // ← NEW listener each iteration
    }),
  ]);
  // ...
}
```

**Impact:**

- VS Code's `onCancellationRequested` returns a `Disposable` (confirmed in `vscode.d.ts`).
- The Disposable was captured in a closure variable but **never stored or disposed**.
- For a typical LLM response with 500 SSE chunks → **500 leaked listeners**.
- Listeners persist until the `CancellationTokenSource` is disposed, causing:
  - Progressive memory leak per chat request
  - `MaxListenersExceededWarning` after 10+ listeners
  - Slower cancellation checks as listener count grows

### Root Cause

The code was written to handle cancellation correctly (the promise resolves and breaks the loop),
but overlooked that `Event<T>` in VS Code returns a `Disposable` that must be cleaned up.

### Fix

Register the listener **once** outside the loop, store the Disposable, and dispose in `finally`:

```typescript
// Register ONCE — outside the while(true) loop.
let cancelDisposable: vscode.Disposable | undefined;
const cancelPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
  cancelDisposable = options.token.onCancellationRequested(() =>
    resolve({ done: true, value: undefined }),
  );
});

try {
  while (true) {
    if (options.token.isCancellationRequested) break;
    const { done, value } = await Promise.race([
      reader.read(),
      cancelPromise,  // ← reuse same promise
    ]);
    // ...
  }
} finally {
  reader.releaseLock();
  cancelDisposable?.dispose();  // ← cleanup once
}
```

**Result:** Exactly 1 listener per request, regardless of chunk count. Disposed immediately after
stream completes or errors.

**File:** `src/streaming.ts`

---

## Problem 2 — Retry Logic Dead Code (MEDIUM)

### Symptom

`src/retry.ts` exported two functions — `shouldRetryHttp400` and `retryDelayMs` — but neither
was imported or used anywhere in the codebase (`grep` confirmed: only 2 matches, both in the
file itself). This meant:

- HTTP 429 (rate limited) → thrown directly to user, no retry
- HTTP 500/502/503/504 (server errors) → thrown directly, no retry
- HTTP 400 with "overloaded" / "try again" → thrown directly, no retry
- Network errors (ECONNRESET, ETIMEDOUT) → thrown directly, no retry

**Impact:** Users see error notifications for transient failures that would succeed on retry.

### Root Cause

The retry helpers were written as a standalone module but never wired into `streamChatResponse`.
The `fetch()` call had no retry wrapper.

### Fix

1. **Expanded `shouldRetryHttp`** (renamed from `shouldRetryHttp400`) to cover all transient
   statuses: 429, 5xx (500-599), and 400 with transient keywords.
2. **Added jitter** to `retryDelayMs` (±25%) to prevent thundering herd.
3. **Added `parseRetryAfter`** to honor the `Retry-After` HTTP header for 429 responses.
4. **Wired a unified retry loop** into `streamChatResponse` that handles both network errors
   (catch block) and HTTP-level errors (status check), with a max of 3 retries.

```typescript
for (let attempt = 0; ; attempt++) {
  try {
    response = await fetch(options.url, { ..., signal: controller.signal });
  } catch (err) {
    // Network error — retry if budget remains.
    if (isAbort || attempt >= MAX_HTTP_RETRIES) throw err;
    await sleep(retryDelayMs(attempt));
    continue;
  }

  // HTTP-level retry for transient status codes.
  if (!response.ok && attempt < MAX_HTTP_RETRIES) {
    const body = await response.text().catch(() => "");
    if (shouldRetryHttp(response.status, body)) {
      const delay = parseRetryAfter(response.headers.get("retry-after")) ?? retryDelayMs(attempt);
      await sleep(delay);
      continue;
    }
  }
  break;
}
```

**Files:** `src/retry.ts`, `src/streaming.ts`

---

## Problem 3 — Dead Code in `providerTypes.ts` (LOW)

### Symptom

Three exports in `src/providerTypes.ts` were never imported or used anywhere:

- `PROVIDER_ROUTES` — routing table with `chatCompletionsUrl` and `modelsUrl` per vendor
- `resolveBaseVendor()` — identity function returning the input vendor
- `ProviderRoutingDefinition` — interface only used by `PROVIDER_ROUTES`

`extension.ts` uses `BASE_URL` directly: `` `${BASE_URL}/chat/completions` ``

### Fix

Removed all three unused exports. Kept `BASE_URL` (used in `extension.ts` for both streaming
and `testConnection`).

**File:** `src/providerTypes.ts`

---

## Problem 4 — `testConnection` Blind to Response Body (LOW)

### Symptom

The "Test Connection" command only checked `response.ok` (HTTP 200) without parsing the body:

```typescript
if (response.ok) {
  vscode.window.showInformationMessage("Connection OK (HTTP 200).");
}
```

If the API returned HTTP 200 with an error payload (some providers do this), the test would
report "Connection OK" even though the request actually failed.

### Fix

Parse the response JSON and display the actual reply content:

```typescript
if (response.ok) {
  let reply = "";
  try {
    const json = await response.json();
    reply = json?.choices?.[0]?.message?.content ?? "";
  } catch { /* non-JSON */ }
  const detail = reply ? ` — got reply: "${reply.slice(0, 40)}"` : " (empty content)";
  vscode.window.showInformationMessage(`Connection OK (HTTP ${response.status})${detail}.`);
}
```

**File:** `src/extension.ts`

---

## Problem 5 — `_hasImageInput` Always `false` (LOW)

### Symptom

`buildThinkingPayload` accepts a `hasImageInput` parameter, but the call site hardcoded `false`:

```typescript
const thinkingPayload = buildThinkingPayload(rawModelId, settings.thinking, false);
```

This prevented models from adjusting their thinking/reasoning mode based on whether the request
contained image input (some models have different thinking behavior for vision requests).

### Fix

Detect `LanguageModelDataPart` with `image/*` MIME type in the message array:

```typescript
const hasImageInput = messages.some((msg) => {
  if (typeof msg.content === "string") return false;
  return msg.content.some(
    (part) => part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/"),
  );
});
const thinkingPayload = buildThinkingPayload(rawModelId, settings.thinking, hasImageInput);
```

**File:** `src/extension.ts`

---

## False Positives Ruled Out

During verification, the following were investigated and confirmed **not bugs**:

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Variable shadowing `parts` in `extractStreamParts` | Intentional from [bug-fix 05](05-20260702-cache-leak-and-dead-code-fix.md). The `const parts` inside the usage-logging block is in a separate scope and only builds a log string array — it does not shadow the outer `parts` that gets returned. |
| 2 | `__prewarm__` key delete after read | Intentional security fix (bug-fix 05). Delete-after-read prevents stale key from lingering after user clears API key. The "race condition" for concurrent requests is acceptable — second request falls back to SecretStorage (async, ~1ms). |
| 3 | `thinkingFamily()` regex fragile | The two-step strip (`cline-pass/` then `vendor/`) handles all model ID formats in the current codebase. No model ID has format `cline/vendor/X`. Safe for current and foreseeable model IDs. |
| 4 | Tool result ordering in `convertMessagesToApi` | The batch-push of tool results after the assistant message is **valid** per the OpenAI Chat Completions API spec. The spec requires `tool` messages to follow the assistant message with `tool_calls`, which is exactly what the code does. |

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit --strict` | EXIT_CODE=0 — zero errors, zero output |
| `get_errors` (all files) | "No errors found" |
| `grep shouldRetryHttp400 src/` | 0 matches — old function name fully removed |
| `grep PROVIDER_ROUTES src/` | 0 matches — dead code fully removed |
| `grep resolveBaseVendor src/` | 0 matches — dead code fully removed |
| `grep cancelDisposable src/streaming.ts` | 3 matches: declare, assign, dispose |
| `grep hasImageInput src/extension.ts` | 2 matches: detect, pass to payload |
| `grep parseRetryAfter src/streaming.ts` | 2 matches: import, usage |
| Manual review: retry loop flow | ✅ Network errors retry + HTTP 429/5xx retry + Retry-After honored |

---

## References

- VS Code `vscode.d.ts` — `CancellationToken.onCancellationRequested` returns `Disposable`:
  https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts
- MDN `AbortController` / `AbortSignal` — standard fetch cancellation pattern:
  https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
- OpenAI Chat Completions API — tool message ordering spec:
  https://platform.openai.com/docs/guides/function-calling
- `src/streaming.ts` — SSE read loop + retry integration
- `src/retry.ts` — retry helpers (`shouldRetryHttp`, `retryDelayMs`, `parseRetryAfter`)
- `src/extension.ts` — `testConnection`, `hasImageInput` detection
- `src/providerTypes.ts` — dead code removal

---
