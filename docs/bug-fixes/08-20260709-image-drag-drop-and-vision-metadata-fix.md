**Status:** ✅ Solved

# Image Drag & Drop Discarded + Vision Metadata Correction

**Topic:** streaming / models / extension
**Updated:** 2026-07-09
**Tags:** #streaming #models #extension #vscode
**Ref:** Issue #1, PR #2

---

## Overview

Images dragged and dropped (or pasted) into Copilot Chat were silently discarded and never sent to the model. Additionally, the `VISION_CAPABLE_MODELS` set in `metadata.ts` had 5 models missing vision capability and 4 models incorrectly marked as vision-capable. Both issues were fixed in v0.1.3.

## Problem

### 1. Image data silently dropped

When a user drags and drops an image into Copilot Chat, VS Code passes it as a `LanguageModelDataPart` with `mimeType: "image/png"` (or `jpeg`, `webp`) and a `Uint8Array` of bytes. The `convertMessagesToApi()` function in `src/extension.ts` handled three part types:

| Part Type | Handled? |
|---|---|
| `LanguageModelTextPart` | Yes |
| `LanguageModelToolCallPart` | Yes |
| `LanguageModelToolResultPart` | Yes |
| `LanguageModelDataPart` | **No — silently ignored** |

The image bytes never reached the API request body. The model responded as if no image was attached.

Reported by **Giswa Satia Wibowo** via VS Code Marketplace review.

### 2. Incorrect vision metadata

The `VISION_CAPABLE_MODELS` set had two categories of errors:

**Missing (should have been vision-capable):**
- `openai/o3` — OpenAI docs: "All latest OpenAI models support text and image input... and vision"
- `xai/grok-3`, `xai/grok-4` — xAI docs: "Image input models" section, jpg/png supported
- `mistral/mistral-large` — Mistral docs: listed under "Recommended Models with Vision Capabilities"
- `meta/llama-4-maverick` — Meta docs: "Natively multimodal model for image and text understanding"

**Incorrectly included (should NOT have been vision-capable):**
- `mimo/mimo-v2.5`, `mimo/mimo-v2.5-pro` (both ClinePass and pay-per-use) — MiMo-7B is a reasoning-only text model ("Unlocking the Reasoning Potential of Language Model"), zero mention of vision/image/multimodal in any official source

## Root Cause

### 1. Missing part type handler

`convertMessagesToApi()` iterated over message parts with `if/else if` chains for `LanguageModelTextPart`, `LanguageModelToolCallPart`, and `LanguageModelToolResultPart`. No branch existed for `LanguageModelDataPart`, so image parts fell through without being collected.

### 2. Unverified metadata assumptions

The original comment said "All models support vision (confirmed via provider docs)" but the set did not include all models, and some entries were based on assumptions rather than verified provider documentation.

## Solution

### 1. Image handling in `convertMessagesToApi()`

Added detection for `LanguageModelDataPart` with `image/*` MIME types:

```typescript
} else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/")) {
  imageParts.push({ mimeType: part.mimeType, data: uint8ArrayToBase64(part.data) });
}
```

When images are present, the content field uses OpenAI-compatible multipart format:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this image?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

Pure-text messages without images keep the existing string format for token efficiency.

Added `uint8ArrayToBase64()` helper that converts `Uint8Array` to base64 without Node.js `Buffer` dependency (uses `btoa`).

### 2. Vision metadata correction

Updated `VISION_CAPABLE_MODELS` after verifying each model against official provider docs (Jul 2026):

- **Added:** `openai/o3`, `xai/grok-3`, `xai/grok-4`, `mistral/mistral-large`, `meta/llama-4-maverick`
- **Removed:** `mimo/mimo-v2.5`, `mimo/mimo-v2.5-pro`, `cline-pass/mimo-v2.5`, `cline-pass/mimo-v2.5-pro`
- **Kept (verified):** `minimax/minimax-m3` + `cline-pass/minimax-m3` (MiniMax M3 release notes: "多模态 Chat 输入" / multimodal chat input)

## Files Changed

- `src/extension.ts` — added `uint8ArrayToBase64()` helper, image part detection in `convertMessagesToApi()`, multipart content array building
- `src/metadata.ts` — corrected `VISION_CAPABLE_MODELS` set (5 added, 4 removed)

## Verification

- [x] TypeScript compile clean (`tsc -p ./`)
- [x] Extension packaged and installed locally (v0.1.3)
- [x] User confirmed image drag & drop working after install
