**Status:** 🟢 Active

# Image Attachment Normalization (Ported from opencode-copilot-chat)

**Topic:** vision / provider / token-cost / extension  
**Updated:** 2026-08-19  
**Tags:** #vision #provider #tokens #image-normalization #wasm #port  
**Supersedes:** —

---

## Overview

Image attachments (drag & drop, paste) are now **normalized before the request
leaves the extension**: oversized dimensions are resized to ≤2000×2000
(Lanczos3) and the result is re-encoded PNG → JPEG (quality ladder 80/85/70/55/40)
until the base64 payload fits ≤5MB. Ported from `opencode-copilot-chat`
`src/imageNormalizer.ts` (upstream feature doc:
`docs/features/13-20260803-image-normalization.md`, upstream issue #94).

This fixes two problems at once:

1. **Token cost.** Vision models bill per image tile, so a 4000×3000 screenshot
   costs several × more tokens than its 2000px-normalized self — and the raw
   bytes ride along in the conversation history on **every subsequent turn**.
   This was identified as a leading cause of the extension feeling "boros"
   (token-hungry) in multi-turn sessions with images.
2. **Upstream 400 errors.** Images that are valid pixels but exceed the
   gateway's implicit size contract previously failed the whole request.

---

## Problem

Before this port, `convertMessagesToApi()` in `src/extension.ts` forwarded raw
`Uint8Array` image bytes as base64 data URIs without any transformation:

```typescript
// OLD — raw bytes straight to the wire
imageParts.push({ mimeType: part.mimeType, data: uint8ArrayToBase64(part.data) });
```

There was no dimension cap, no size guard, and no fallback when an image was
too large. A 4K screenshot entered the transcript and was re-sent — full-size —
on every turn of the conversation.

---

## Implementation

### `src/imageNormalizer.ts` (new)

WASM-based normalization via `@silvia-odwyer/photon-node` (≈2.3MB unpacked, no
native deps, cross-platform single artifact — safe for VS Code extensions,
unlike `sharp`).

```
MAX_IMAGE_WIDTH  = 2_000
MAX_IMAGE_HEIGHT = 2_000
MAX_IMAGE_BASE64_BYTES = 5 * 1024 * 1024
JPEG_QUALITIES   = [80, 85, 70, 55, 40]
```

Pipeline (`normalizeImageDataUrl`):

1. Parse base64 data URL. Non-data URLs pass through unchanged.
2. Decode via Photon. Malformed images pass through unchanged.
3. Already in spec (≤2000×2000 AND ≤5MB base64) → return URL **byte-identical**
   (INVARIANT: no re-encode of compliant images).
4. Candidate sizes via geometric decay (0.75× per step, capped at 32 steps).
5. Per size: Lanczos3 resize → try PNG, then JPEG quality ladder. Return the
   first encoding whose base64 ≤5MB.
6. No candidate fits → return original (the caller's final guard decides).

**Lazy loading:** dynamic `import()` — the WASM module loads on the FIRST image
request, never at extension activation. If Photon fails to load (corrupt
install, WASM runtime issue), the normalizer degrades gracefully: original
image preserved, final 5MB guard makes the send/drop decision.

### `convertMessagesToApi()` changes (`src/extension.ts`)

- Now `async`, returns `{ messages, normalizedImageCount }`.
- Image DataParts are normalized **before** the final `MAX_IMAGE_BASE64_BYTES`
  guard; an image whose normalized base64 still exceeds 5MB becomes a
  placeholder text part (`[Image attachment omitted: …]`) — never silently
  dropped.
- `normalizedImageCount > 0` is logged to the output channel for observability.

### What was intentionally NOT ported

- **Tool-result image path** (MCP screenshots inside
  `LanguageModelToolResultPart`): cline-copilot-chat currently flattens tool
  results to text and does not serialize nested image DataParts at all —
  normalizing them would be dead code. That is a separate feature (see
  opencode `docs/features/12-20260720-mcp-tool-result-image-support.md`).
- **MiMo tool-image flattening quirk** — same reason (no tool-image path yet).

---

## Dependency & Packaging

| File | Change |
|---|---|
| `package.json` | New runtime dependency `@silvia-odwyer/photon-node` ^0.3.4 |
| `.vscodeignore` | Exception for `node_modules/@silvia-odwyer/photon-node/**` — `photon_rs.js` reads `photon_rs_bg.wasm` via `fs.readFileSync(__dirname)` at require-time, so the WASM artifact MUST ship in the VSIX |
| `src/imageNormalizer.ts` | New module: `normalizeImageDataUrl`, `getImageDataUrlBase64Bytes`, `MAX_IMAGE_BASE64_BYTES` export |
| `src/extension.ts` | `convertMessagesToApi()` → async + inline normalization + 5MB guard + normalization count logging |

Verified via `vsce ls`: the packaged VSIX includes `photon_rs.js`,
`photon_rs_bg.js`, `photon_rs_bg.wasm`, `photon_rs.d.ts`, `package.json`,
`LICENSE.md`.

> ⚠️ **PACKAGING GOTCHA (verified 2026-08-19):** `vsce package --no-dependencies`
> silently DROPS all `node_modules` runtime deps — `.vscodeignore` exceptions
> do NOT re-include them in that mode. The resulting VSIX (32 files / 178KB vs
> the correct 39 files / 893KB) ships without the WASM, and the normalizer
> degrades to silent passthrough (no error anywhere). Since this extension now
> has a runtime dependency, always package with plain `npx vsce package`
> (the `--no-dependencies` flag was safe only when the extension had zero
> runtime deps).

---

## Verification

- `npm run compile` — pass, no errors.
- Runtime sanity (compiled `out/imageNormalizer.js`):
  - 1px PNG → byte-identical passthrough ✅
  - 2600×10 synthetic PNG → resized, re-encoded, base64 876 → 592 bytes ✅
  - Non-data URL → passthrough ✅
- Smoke test on the **installed extension copy** (`~/.vscode/extensions/ltmoerdani.cline-copilot-chat-0.1.7`), build 2026-08-19:
  - S1: 1px PNG passthrough ✅
  - S2: realistic 4000×3000 image → normalized **61.0MB → 3.4MB base64 (94.4% reduction)**, output `image/jpeg`, within the 5MB limit, 3.2s total ✅
  - S3: non-data URL passthrough ✅
  - S4: malformed image bytes → passthrough without throwing ✅
- Manual smoke test in Copilot Chat with a >2000px image is recommended before
  release: expect one `Normalized 1 oversized image(s) (≤2000×2000, ≤5MB
  base64)` line in the output channel and a successful vision response.

---

## References

- Source port: `opencode-copilot-chat` `src/imageNormalizer.ts` +
  `src/provider/messages.ts`
- Upstream feature doc: `docs/features/13-20260803-image-normalization.md`
  (opencode-copilot-chat, PR #102 by @Wallacy, released v0.5.0)
- Related local history: `docs/bug-fixes/08-20260709-image-drag-drop-and-vision-metadata-fix.md`
  (drag & drop support — the input path this normalizer now guards)
