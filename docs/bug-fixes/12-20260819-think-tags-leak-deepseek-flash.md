# Think Tags Bocor ke Chat — DeepSeek V4 Flash (Level 1+2 Fix)

**Status:** ✅ Solved (v0.1.8-dev, compile pass 2026-08-19)
**Topic:** streaming / think-tags / reasoning / deepseek / tool-calling
**Updated:** 2026-08-19
**Tags:** #think-tags #reasoning #deepseek #streaming #tool-calling #port
**Ref:** Ported from `opencode-copilot-chat` `src/transports/thinkTags.ts` + `src/provider/OpenCodeProvider.ts`

---

## Overview

Saat menggunakan **DeepSeek V4 Flash** (atau model reasoning lain) di Copilot Chat agent mode, **thinking/reasoning bocor ke output chat** sebagai teks mentah dengan tag `<think>...</think>` dan artefak HTML yang tidak jelas. Ini membuat response tidak terbaca.

## Problem

### Gejala yang dilaporkan

1. **Thinking bocor** — reasoning model muncul sebagai teks biasa di chat, bukan di panel thinking yang collapsible.
2. **HTML/tag tidak jelas** — tag `<think>`, `</think>`, dan artefak markup lain tampil mentah di jawaban.
3. **Terjadi saat agent mode** — ketika tools aktif (yang selalu terjadi di Copilot Chat agent mode).

### Root cause (2 gap arsitektur)

**Gap 1 — `stripThinkTags: "auto"` tidak menarget DeepSeek**

```ts
// streaming.ts (LAMA)
const shouldStrip =
  stripMode === "always" ||
  (stripMode === "auto" && /^minimax-/i.test(modelId));  // ← HANYA minimax
```

Mode `"auto"` (default) hanya strip think tags untuk `minimax-*`. DeepSeek **tidak di-strip**, sehingga tag `<think>` bocor ke chat.

**Gap 2 — Tidak ada `forceStripThinkTags` saat tool call request**

Di opencode, saat ada tools (agent mode), `forceStripThinkTags` di-set `true` yang memaksa mode `"always"`:

```ts
// opencode OpenCodeProvider.ts
const isToolCallRequest = Array.isArray(options.tools) && options.tools.length > 0;
const forceStripThinkTags = isToolCallRequest || undefined;
```

Cline tidak punya mekanisme ini — think tags bocor bahkan saat agent mode.

**Gap 3 — Regex-based filter tidak handle split chunks**

Filter lama pakai regex `replace()` yang tidak menangani tag `<think>` yang **terpotong antar SSE chunk** (mis. chunk 1 berisi `<thi`, chunk 2 berisi `nk>...`). Ini menyebabkan tag tidak terdeteksi dan bocor.

## Fix (Level 1+2, port dari opencode)

| # | Change | File |
|---|---|---|
| 1 | **Port `ThinkTagFilter` class** — stateful streaming filter yang handle split chunks, unclosed tags, dan boundary matching | `src/streaming.ts` |
| 2 | **Tambah `forceStripThinkTags`** — force mode `"always"` saat ada tools (agent mode) | `src/streaming.ts`, `src/extension.ts` |
| 3 | **Flush `thinkFilter.finish()`** di akhir stream — handle unclosed `<think>` | `src/streaming.ts` |

### Detail implementasi

**`ThinkTagFilter` class** (port dari opencode `thinkTags.ts`):
- Stateful: menyimpan `carry` (partial text dari chunk sebelumnya) dan `insideThink` flag.
- `process(chunk)` → `{ visible, thinking }` — pisahkan text di luar vs di dalam tag.
- `finish()` → flush sisa carry; unclosed `<think>` diperlakukan sebagai thinking.
- Handle edge cases: tag terpotong antar chunk, whitespace setelah tag, unclosed tag di akhir stream.

**`forceStripThinkTags`** (port dari opencode `OpenCodeProvider.ts`):
```ts
// extension.ts
forceStripThinkTags: toolNames.size > 0 || undefined,
```
Saat ada tools (agent mode), force mode `"always"` — mencegah think tags bocor ke chat UI.

**`createThinkTagFilter` signature update**:
```ts
export function createThinkTagFilter(
  mode: "never" | "auto" | "always" | undefined,
  modelId: string,
  forceOverride?: boolean,  // ← BARU
): ThinkTagFilter | undefined {
  const effective = forceOverride ? "always" : mode;
  return shouldStripThinkTags(effective, modelId) ? new ThinkTagFilter() : undefined;
}
```

## Verification

- `npm run compile` — pass (0 errors)
- `get_errors` on `streaming.ts`, `extension.ts` — clean
- **Manual test pending** — perlu test dengan DeepSeek V4 Flash di agent mode untuk verifikasi think tags tidak bocor.

## Known limitations

- **Reasoning masih tidak muncul di thinking panel** — `reasoning_content` hanya di-log ke output channel, tidak di-emit sebagai `LanguageModelThinkingPart` (Level 3, future work).
- **Reasoning loop suppression** tidak di-port — opencode punya suffix-repetition guard untuk detect model degradation, tapi ini tidak critical untuk fix kebocoran.

## References

- `opencode-copilot-chat/src/transports/thinkTags.ts` — ThinkTagFilter class
- `opencode-copilot-chat/src/provider/OpenCodeProvider.ts:908` — forceStripThinkTags logic
- `opencode-copilot-chat/src/transports/streamParts.ts` — LanguageModelThinkingPart (Level 3, tidak di-port)
