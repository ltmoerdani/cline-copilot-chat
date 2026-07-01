**Status:** ✅ Solved

# DeepSeek V4 Flash Tool Calling Fix — Complete Session Documentation

**Topic:** tool-calling / streaming / byok / vscode  
**Updated:** 2026-07-01  
**Tags:** #tool-calling #streaming #byok #vscode #deepseek #xml-parser #agent-mode

---

## Overview

This document captures the complete debugging and fix session for enabling tool calling support in the Cline Copilot Chat extension, specifically for open-weight models like DeepSeek V4 Flash that don't natively support OpenAI-style `tool_calls` streaming.

The session involved three distinct issues, each requiring a separate fix:

1. **XML Tool Call Parsing** — Models output tool invocations as XML tags in text
2. **Multi-Turn Message Format** — Tool results not properly preserved across turns
3. **Infinite Tool Loop** — Streaming tool calls emitted prematurely with incomplete arguments

---

## Issue #1: XML Tool Call Parsing

### Problem

When using DeepSeek V4 Flash in Copilot Chat agent mode, the model outputs tool invocations as raw XML text instead of structured `tool_calls`:

```
Optimized tool selectionI'll analyze this project by reading the key files...

<read_file>
<file>/Users/ltmoerdani/Startup/cline-copilot-chat/package.json</file>
</read_file>
```

**Symptoms:**
- `toolCalls=0` in stream summary
- `textChars=1281` (XML tags counted as text)
- Agent mode doesn't work — tools never invoked

**Root Cause:**
Open-weight models served via OpenAI-compatible APIs often don't emit native `tool_calls` deltas. Instead, they "hallucinate" tool invocations as XML-like tags in the `content` text stream.

### Solution

Created `src/toolParsing.ts` — a stateful `XmlToolStreamParser` that:

1. **Detects tool tags** matching known tool names from `options.tools`
2. **Parses parameters** via 4 strategies (attributes → JSON body → child tags → bare text)
3. **Converts to `LanguageModelToolCallPart`** with unique `callId`
4. **Smart buffering** — holds text after `<read` until clear if it's `<read_file>` or not
5. **Anti-bloat** — flushes as text if tag not closed within 64KB

**Key Implementation Details:**

```typescript
// Stateful parser with pending buffer
class XmlToolStreamParser {
  private pending = "";
  private insideTool: { name: string; inner: string } | null = null;
  
  feed(chunk: string): FeedResult {
    // Accumulate text, detect tool tags, emit parts
  }
  
  flush(): FeedResult {
    // Emit trailing buffered content at stream end
  }
}
```

**Parameter Parsing Strategies:**

1. **Attributes:** `<read_file file="/path">` → `{ file: "/path" }`
2. **JSON body:** `<read_file>{"file":"/path"}</read_file>` → parse JSON
3. **Child tags:** `<read_file><file>/path</file></read_file>` → extract children
4. **Bare text:** `<read_file>/path</read_file>` → map to primary param (heuristic: `query`, `file`, `path`, etc.)

**Integration:**

Modified `streaming.ts` to route text content through parser when `enableXmlToolParsing=true`:

```typescript
if (xmlParser) {
  const fed = xmlParser.feed(cleaned);
  for (const part of fed.parts) parts.push(part);
} else {
  parts.push(new vscode.LanguageModelTextPart(cleaned));
}
```

**Files Changed:**
- `src/toolParsing.ts` (new, 450+ lines)
- `src/streaming.ts` (added `enableXmlToolParsing`, `toolNames` options)
- `src/extension.ts` (pass `options.tools` to API body, enable parser)

---

## Issue #2: Multi-Turn Message Format

### Problem

After fixing XML parsing, the first turn worked (`messages=3, toolCalls=4` ✅), but subsequent turns returned empty responses:

```
[2026-07-01T05:56:20.424Z] Request: model=cline-pass/deepseek-v4-flash messages=3 tools=97
[stream-summary] textChars=0 toolCalls=4 reasoningChars=0  ✅

[2026-07-01T05:56:26.368Z] Request: model=cline-pass/deepseek-v4-flash messages=12 tools=97
[stream-summary] textChars=0 toolCalls=0 reasoningChars=0  ❌
[warn] empty response from model=cline-pass/deepseek-v4-flash
```

**Symptoms:**
- Turn 1: Works (3 messages, 4 tool calls)
- Turn 2+: Empty responses (12+ messages, 0 tool calls)
- Model loops forever without producing output

**Root Cause:**

The message converter `convertMessagesToApi()` had two bugs:

1. **Spurious empty user message** — When Copilot sends tool results (user message with `LanguageModelToolResultPart`), converter emitted `{ role: "user", content: "" }` before tool messages. This is invalid in OpenAI API.

2. **`content: ""` on assistant tool_calls** — OpenAI spec requires `content: null` (not `""`) for assistant messages with `tool_calls`.

**Generated Messages (Before Fix):**

```json
[
  { "role": "user", "content": "Analyze project" },
  { "role": "assistant", "content": "", "tool_calls": [...] },
  { "role": "user", "content": "" },  // ❌ Spurious empty user message
  { "role": "tool", "tool_call_id": "...", "content": "..." },
  { "role": "tool", "tool_call_id": "...", "content": "..." }
]
```

### Solution

Refactored `convertMessagesToApi()` in `extension.ts`:

1. **Skip empty user messages** — If user message contains only tool results (no text), emit tool messages directly without wrapping user message
2. **Set `content: null`** — For assistant messages with `tool_calls`, use `null` instead of `""`

**Generated Messages (After Fix):**

```json
[
  { "role": "user", "content": "Analyze project" },
  { "role": "assistant", "content": null, "tool_calls": [...] },
  { "role": "tool", "tool_call_id": "...", "content": "..." },
  { "role": "tool", "tool_call_id": "...", "content": "..." }
]
```

**Key Code:**

```typescript
// User message that carries ONLY tool results — emit tool messages directly
if (isUser && !joinedText && toolResults.length > 0 && toolCalls.length === 0) {
  for (const tr of toolResults) {
    result.push(tr);
  }
  continue;  // Skip empty user message
}

// Assistant with tool_calls — content must be null
if (toolCalls.length > 0) {
  entry.content = joinedText || null;  // ✅ null, not ""
  entry.tool_calls = toolCalls;
}
```

**Files Changed:**
- `src/extension.ts` (refactored `convertMessagesToApi()`)

---

## Issue #3: Infinite Tool Loop

### Problem

After fixing message format, the model worked but got stuck in an infinite tool loop:

```
messages=3   toolCalls=3  ✅
messages=7   toolCalls=4  ✅
messages=12  toolCalls=4  ✅
...
messages=215 toolCalls=1  ❌ (loop continues forever)
```

**Symptoms:**
- Model keeps calling tools across 200+ turns
- Each turn returns 1 tool call with empty/incorrect arguments
- Copilot Chat never completes the task

**Root Cause:**

Streaming tool calls were emitted **prematurely** with incomplete arguments.

OpenAI streams `tool_calls` across multiple deltas:

```
Chunk 1: { index: 0, id: "call_abc", function: { name: "read_file", arguments: "" } }
Chunk 2: { index: 0, function: { arguments: '{"file":' } }
Chunk 3: { index: 0, function: { arguments: '"/path"}' } }
Chunk N: finish_reason: "tool_calls"  ← Only now should we emit
```

**Old Code (Buggy):**

```typescript
// Emit immediately on each delta — WRONG!
if (fnName) {
  emittedTools++;
  let input = {};
  if (fnArgs) {
    try { input = JSON.parse(fnArgs); }  // ❌ Partial JSON → {}
    catch { /* ignore */ }
  }
  parts.push(new vscode.LanguageModelToolCallPart(callId, fnName, input));
}
```

**Result:** Tool called with `{}` (empty args) → tool returns error/wrong result → model retries → loop forever.

### Solution

Implemented **accumulate+flush pattern** (same as OpenCode):

1. **Accumulate** tool call chunks into `pendingToolCalls` Map
2. **Flush** only when `finish_reason === "tool_calls"` or stream ends

**New Code (Fixed):**

```typescript
const pendingToolCalls = new Map<number, PendingToolCall>();

function collectToolCallsDelta(toolCallsArray: unknown): void {
  if (!Array.isArray(toolCallsArray)) return;
  for (const tc of toolCallsArray) {
    if (!isRecord(tc)) continue;
    const idx = typeof tc.index === "number" ? tc.index : pendingToolCalls.size;
    const pending = pendingToolCalls.get(idx) ?? { id: "", name: "", arguments: "" };
    
    // Accumulate across chunks
    if (typeof tc.id === "string") pending.id = tc.id;
    const fn = tc.function;
    if (isRecord(fn)) {
      if (typeof fn.name === "string") pending.name += fn.name;
      if (typeof fn.arguments === "string") pending.arguments += fn.arguments;
    }
    
    pendingToolCalls.set(idx, pending);
  }
}

function flushNativeToolCalls(): vscode.LanguageModelToolCallPart[] {
  const parts: vscode.LanguageModelToolCallPart[] = [];
  for (const [idx, tc] of pendingToolCalls) {
    if (!tc.name) continue;
    const callId = tc.id || `clinepass-tool-${Date.now()}-${idx}`;
    let input: Record<string, unknown> = {};
    if (tc.arguments) {
      try { input = JSON.parse(tc.arguments); }  // ✅ Complete JSON
      catch { /* malformed — pass empty */ }
    }
    parts.push(new vscode.LanguageModelToolCallPart(callId, tc.name, input));
  }
  pendingToolCalls.clear();
  return parts;
}

// In extractStreamParts:
collectToolCallsDelta(delta.tool_calls);  // Accumulate, don't emit

// Only flush on finish_reason
if (typeof finishReason === "string") {
  if (finishReason === "tool_calls" || finishReason === "stop") {
    const toolParts = flushNativeToolCalls();  // ✅ Emit complete tool calls
    emittedTools += toolParts.length;
    parts.push(...toolParts);
  }
}

// After stream ends, flush any remaining
const remainingTools = flushNativeToolCalls();
for (const part of remainingTools) {
  emittedTools++;
  options.progress.report(part);
}
```

**Files Changed:**
- `src/streaming.ts` (refactored tool call handling with accumulate+flush)

---

## Complete Fix Summary

### Files Modified

| File | Changes |
|------|---------|
| `src/toolParsing.ts` | **NEW** — XML tool-call parser (450+ lines) |
| `src/streaming.ts` | Added XML parser integration, accumulate+flush for native tool calls |
| `src/extension.ts` | Pass `options.tools` to API, fix message converter for tool history |

### Key Patterns Implemented

1. **XML Tool Call Parsing** — Stateful parser for open-weight models
2. **Tool History Preservation** — Proper OpenAI message format for multi-turn flows
3. **Tool Call Accumulation** — Accumulate streaming chunks, emit on finish

### Testing

After all fixes:

```
✅ Turn 1: messages=3, toolCalls=3 (model reads files)
✅ Turn 2: messages=7, toolCalls=4 (model analyzes code)
✅ Turn 3: messages=12, toolCalls=1 (model provides summary)
✅ Task completes successfully
```

No more infinite loops, no more empty responses, agent mode works correctly.

---

## Lessons Learned

### 1. Open-Weight Models ≠ Native Tool Calling

Open-weight models (DeepSeek, MiMo, MiniMax, Qwen) served via OpenAI-compatible APIs often don't support native `tool_calls`. They need XML fallback parsing.

### 2. Streaming Tool Calls Must Be Accumulated

Never emit `LanguageModelToolCallPart` on each delta. Accumulate across chunks, emit only on `finish_reason === "tool_calls"`. Otherwise you get partial JSON → empty args → infinite loop.

### 3. OpenAI Message Format Is Strict

- Assistant messages with `tool_calls` must have `content: null` (not `""`)
- Tool results should not be wrapped in empty user messages
- Invalid format → model returns empty responses

### 4. Reference Implementation Matters

OpenCode's `OpenAiResponseExtractor` pattern (accumulate+flush) is the correct approach. Always check reference implementations for complex streaming logic.

---

## Related Documentation

- [OpenCode Copilot Chat](https://github.com/ltmoerdani/opencode-copilot-chat) — Reference implementation
- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) — Official docs
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) — Message format spec

---

## Appendix: Debugging Commands

### Check Extension Logs

```bash
# View ClinePass output channel
Cmd+Shift+P → "ClinePass: Show Output Channel"
```

### Key Log Patterns

```
[tool-parser] enabled for model=... tools=97
[stream-summary model=...] textChars=X toolCalls=Y reasoningChars=Z
[warn] empty response from model=... (no text, no tool calls)
```

### Test Tool Calling

```
1. Open Copilot Chat
2. Select "ClinePass / DeepSeek V4 Flash"
3. Type: "Analyze this project"
4. Watch Output channel for tool calls
5. Verify task completes (no infinite loop)
```

---

**Document Version:** 1.0  
**Session Duration:** ~2 hours  
**Issues Resolved:** 3  
**Lines of Code Changed:** ~600 (new + modified)
