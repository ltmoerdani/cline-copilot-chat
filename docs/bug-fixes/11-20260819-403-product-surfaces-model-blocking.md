**Status:** ✅ Solved

# HTTP 403 "Only Available via Cline Product Surfaces" — Model Blocking & Actionable Error

**Topic:** errors / models / api / provider / cline-server
**Updated:** 2026-08-19
**Tags:** #403 #errors #models #api #product-surfaces #picker
**Ref:** [Issue #3](https://github.com/ltmoerdani/cline-copilot-chat/issues/3) — reported by @SPIERWIN, +1 @M-Kepler

---

## Overview

After Cline changed their platform (Aug 2026), every request to certain models through the public API-key path started failing with **HTTP 403**:

```
Error 403: deepseek/deepseek-v4-flash is only available via Cline product surfaces.
If you are using an old version of Cline, please update to the latest version
```

Users saw a generic `HTTP 403: ClineCopilotChatRequestError` in Copilot Chat with no explanation, and the blocked model remained selectable in the picker.

This patch adds the defensive fixes: an actionable error message for the 403 case, hiding the confirmed-blocked model from the picker, and a Test Connection model that still works.

---

## Problem

### Reported symptoms (Issue #3)

1. All requests fail with `HTTP 403` at `buildClineCopilotChatRequestError` (errors.js:44) ← `streamChatResponse` (streaming.js:351).
2. The same failure persists on v0.1.4 → v0.1.6 and with a **freshly created API key**.
3. The picker model list does not match the Cline CLI model list.

### Root cause (evidence, not guesswork)

The reporter ran the suggested curl probe with a **valid, fresh key**:

```bash
curl -X POST https://api.cline.bot/api/v1/chat/completions \
  -H "Authorization: Bearer $CLINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek/deepseek-v4-flash","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

Response:

```json
{"error":{"code":"API_REQUEST_ERROR_CODE","message":"Error 403: deepseek/deepseek-v4-flash is only available via Cline product surfaces. If you are using an old version of Cline, please update to the latest version"}}
```

Conclusion:

- **Not an auth problem.** A 401 would mean key rejection; 403 means the key is valid but the resource is off-limits.
- **Cline moved the model off the public API-key path.** "Cline product surfaces" = the signed-in Cline IDE extension / CLI (account auth token), not an `sk-` API key.
- This matches the documented pattern: free/promotional models are "not supported through the Cline API" (docs.cline.bot/getting-started/free-models).
- The extension advertised a hardcoded catalog containing the blocked model, so users could select it and hit the 403 every time.

---

## Fix (defensive, three parts)

| # | Change | File |
|---|---|---|
| 1 | Detect the "product surfaces" 403 via `isProductSurfacesOnlyError()` and return an actionable `userMessage` (explains the cause, suggests API-served models) | `src/errors.ts` |
| 2 | New `PRODUCT_SURFACES_ONLY_MODELS` set + `isProductSurfacesOnlyModel()`; picker filters blocked models; blocked models are logged when hidden. **Bundled limits metadata stays intact** (guardrail) | `src/metadata.ts`, `src/extension.ts` |
| 3 | `testModelId` for the `cline` vendor switched `deepseek/deepseek-v4-flash` → `deepseek/deepseek-chat` so **Test Connection** doesn't 403 | `src/extension.ts` |
| 4 | README troubleshooting entry: what the error means, how to probe a model with curl, and how to report newly blocked models | `README.md` |
| 5 | **Wire `userMessage` into the rethrown error** (`throw new Error(error.userMessage)` in the catch). Found during testing: `userMessage` was defined but never consumed anywhere — Copilot Chat displays the thrown `message`, so without this the actionable text would never reach the user | `src/extension.ts` |

### CONTRACT — `PRODUCT_SURFACES_ONLY_MODELS` (metadata.ts)

- **Only add models confirmed by a live 403 with the exact "product surfaces" message.** Do not guess; suspect models stay advertised until confirmed.
- Entries are hidden from the picker but remain in `CLINE_MODELS` / `CLINEPASS_MODELS` so `resolveModelMetadata()` keeps working for cached requests.
- `cline-pass/deepseek-v4-flash` is a **different** model (subscription path) and is unaffected.

---

## Verification

- `npm run compile` — pass (no errors)
- `get_errors` on `errors.ts`, `metadata.ts`, `extension.ts` — clean
- **Unit verification: 25/25 pass** (plain-node harness against compiled `out/`, vscode shimmed):
  - [1] Message detection — exact live server message from Issue #3 matches; case-insensitive; "Invalid API key" / empty / other-403 do NOT match
  - [2] 403 product-surfaces path — `message` parses to server's `error.message`; `userMessage` is the actionable text; no raw HTTP-stack leak
  - [3] No regression — 401/402/404/429 `userMessage` unchanged; generic 403 falls through correctly
  - [4] Picker predicate — flash blocked; `deepseek-chat` / `cline-pass/deepseek-v4-flash` (different model) / unknown NOT blocked
  - [5] Guardrail — bundled snapshots intact (`CLINE_MODELS` 25 entries, `CLINEPASS_MODELS` 12 entries; blocked set = exactly 1 confirmed model)
  - [6] Wiring — catch rethrows `userMessage`; picker filter present; `testModelId` switched
- **Live probe (Aug 19, 2026):** `POST /api/v1/chat/completions` with invalid key → `HTTP 401` `{"error":"Unauthorized: Please make sure you're using the latest version of Cline and re-authenticate your Cline account."}` — endpoint unchanged; confirms the two server error shapes: 401 body has `error` as a **string** (parser falls back to default), 403 body has `error` as an **object** with `code`/`message` (parser extracts `message`)
- **Pending (needs manual E2E):** picker hides flash after reload; a real 403 in Copilot Chat shows the new actionable message. Requires a valid key + VS Code run — reporter's key confirmed the live 403, blocker list can be re-verified on release.

---

## What this fix does NOT do

- It cannot restore API-key access to product-surfaces models — that is a Cline server-side decision.
- It does not implement account-auth-token sign-in (the mechanism the Cline IDE/CLI uses). That would be a larger architectural change, only worth doing if Cline locks out more of the catalog.

## References

- [Issue #3](https://github.com/ltmoerdani/cline-copilot-chat/issues/3) — user report + curl evidence
- docs.cline.bot — [Errors](https://docs.cline.bot/api/errors) (403 = "Key does not have access to this resource"), [Free models](https://docs.cline.bot/getting-started/free-models) ("not supported through the Cline API"), [ClinePass](https://docs.cline.bot/getting-started/clinepass)
- Related repo docs: `docs/issues/01-20260818-context-window-session-info-not-working.md` (Issue #4 — separate root cause, not related)
