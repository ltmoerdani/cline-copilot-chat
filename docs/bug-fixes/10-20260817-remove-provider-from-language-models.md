**Status:** ✅ Solved

# Cannot Remove Provider / Group from Language Models

**Topic:** provider / byok / vscode / configuration / languageModelChatProviders
**Updated:** 2026-08-17
**Tags:** #provider #byok #vscode #configuration #languageModelChatProviders #port
**Ref:** Ported from `opencode-copilot-chat` PR #125 (issue #122) + PR #135 (issue #131) — `docs/issues/58-20260811-pr125-agents-window-byok-bridge.md`, `docs/issues/64-20260813-issue131-permodel-config-duplicate-models.md`

---

## Overview

Users of `cline-copilot-chat` could **not remove the Cline / ClinePass providers** (or their groups) from VS Code's **Manage Language Models** list, and **Delete / Update API Key** on a group did nothing. Both providers always appeared in the list and in every model picker, with no working delete/remove path.

This is the same problem `opencode-copilot-chat` hit in **issue #122** (fixed in **PR #125**) and its follow-up **issue #131** (fixed in **PR #135**). Because both extensions share the same architecture (`LanguageModelChatProvider` API + `languageModelChatProviders` declarative contribution + shared provider class), the same root causes and the same fixes apply here.

This patch (v0.1.5) ports **both** mechanisms:

| # | Change | Purpose |
|---|---|---|
| 1 | **Per-provider `enabled` setting** (`clineCopilotChat.enabled`, `clineCopilotChat.clinePass.enabled`) | Kill-switch that removes a provider from the Language Models list and every model picker |
| 2 | **`when` clauses on the vendor contributions** | Hides a disabled provider from the Manage Language Models view, "+ Add Models", the Chat picker, and the Agents window |
| 3 | **Gated runtime registration** | Skips `registerLanguageModelChatProvider` at startup when the setting is off |
| 4 | **"Remove from Language Models" / "Re-add to Language Models" action** in the Manage Provider QuickPick + two new toggle commands | Gives the user an explicit, discoverable remove/re-add path |
| 5 | **Remove `apiKey` from the per-model `configurationSchema`** | Stops VS Code from creating settings-only BYOK groups that block Delete / Update API Key |
| 6 | **Return `[]` for settings-only group calls** (`opts.configuration !== undefined` but no `apiKey`) | Prevents duplicate models and lets Delete / Update API Key work on real BYOK groups |

## Problem

### Reported symptoms

1. **No way to remove the providers.** Both `Cline` and `ClinePass` always appeared in the Manage Language Models list and every model picker with no delete/remove path.
2. **Delete / Update API Key did nothing.** Clicking these on a group had no effect — the provider stayed / the key didn't change.
3. **No kill-switch.** There was no setting or command to hide a provider.

### Root cause

Two independent causes combined:

**A. No kill-switch (PR #125 scope).** The `languageModelChatProviders` contributions in `package.json` declared **no `when` clause** and there was **no `enabled` setting**. VS Code's native BYOK management UI operates on providers that are registered; with no way to un-register or gate a provider, it stays visible forever. The extension's own `manage()` QuickPick only offered `Set API Key / Clear API Key / Test Connection` — no remove action, and it early-returned when no API key was set.

**B. Per-model `apiKey` created settings-only groups (PR #135 scope).** `buildModelConfigurationSchema()` included `apiKey` in **every model's per-model configuration schema**. When a user changed a per-model option (e.g. thinking mode) in the model picker, VS Code wrote a **settings-only group** into `chatLanguageModels.json` — a group carrying only `settings`, **no `apiKey`**. VS Code then called `provideLanguageModelChatInformation` for that group with `opts.configuration = {}` (an empty object, **not** `undefined`). Because the code only distinguished "BYOK key present" vs "no key at all", it fell through to the SecretStorage fallback, duplicating every model AND confusing VS Code's group management — the settings-only group looked like a BYOK group but wasn't, so Delete / Update API Key on it did nothing.

## Fix

### 1. New module `src/providerEnablement.ts`

Ports the opencode `providerEnablement.ts` + `commands/providers.ts` pattern:

- `providerEnabledSetting(vendor)` → the full **root-configuration** key that gates a provider:
  - `cline` → `clineCopilotChat.enabled`
  - `cline-pass` → `clineCopilotChat.clinePass.enabled`
- `toggleProviderEnabled(vendor, displayName)` → flips the setting, then offers a **Reload Now** button (provider registration happens at startup, so a reload is required).

**CONTRACT (critical):** callers must read these keys from the **root** configuration (`vscode.workspace.getConfiguration().get(key, ...)`), never from a section-scoped configuration. `getConfiguration("clineCopilotChat")` resolves keys relative to that section, so passing the full `clineCopilotChat.clinePass.enabled` key there would silently read `clineCopilotChat.clineCopilotChat.clinePass.enabled` and always fall back to `true` — the opposite of the intended behavior. This is the exact bug opencode hit in PR #125 review (commit `99af0c9`).

### 2. `src/extension.ts`

- **Gated registration** in `activate()`: reads both `enabled` settings from the root config and conditionally spreads `registerLanguageModelChatProvider(...)` into the subscriptions array.
- **`manage()` QuickPick** now includes **"Remove from Language Models"** (when enabled) or **"Re-add to Language Models"** (when disabled), and the missing-key early-return is removed so the remove action stays reachable even without an API key.
- **Two new commands** registered: `clineCopilotChat.toggleProvider` (Cline) and `clineCopilotChat.toggleProviderPass` (ClinePass).
- **`provideLanguageModelChatInformation()`** now:
  - Persists a per-vendor `hasByokGroup` flag (`cline.hasByokGroup.v1.<vendor>` in globalState) when a call carries a real BYOK `apiKey`, so a later groupless call (after the user deletes the group) returns `[]` instead of re-advertising from SecretStorage (opencode PR #108 pattern).
  - Returns `[]` when `opts.configuration !== undefined` but carries **no** `apiKey` — i.e. a settings-only group call (opencode PR #135 pattern). The groupless call already serves the models once via SecretStorage; serving them again would duplicate every model and block Delete / Update API Key.
  - `Clear API Key` resets the `hasByokGroup` flag so the SecretStorage fallback path stays usable.

### 3. `src/thinking.ts`

- `buildModelConfigurationSchema()` no longer includes `apiKey` — it returns only the thinking-mode schema (and `undefined` for models with no thinking settings). `apiKey` lives **only** in the vendor-level `languageModelChatProviders.configuration`, so VS Code never creates a settings-only BYOK group from per-model config.

### 4. `package.json`

- **New settings** `clineCopilotChat.enabled` and `clineCopilotChat.clinePass.enabled` (both default `true`).
- **`when` clauses** on the two `languageModelChatProviders` contributions: `config.clineCopilotChat.enabled` and `config.clineCopilotChat.clinePass.enabled`.
- **Two new commands** in `contributes.commands`.

### Behavior

| Scenario | Result |
| --- | --- |
| Provider enabled (default) | Registered normally, appears in picker + Manage list |
| Provider disabled | Disappears from Manage Language Models, "+ Add Models", Chat picker, Agents window |
| API key / BYOK group configured | **Kept** — re-enabling restores the provider exactly as it was |
| No API key set | "Remove from Language Models" still reachable via Manage Provider |
| Settings-only group (thinking changed in picker) | Extension returns `[]` for that group; groupless call serves models once — no duplicates, Delete works |
| Native BYOK group Delete | Provider disappears from picker (groupless call returns `[]` via `hasByokGroup` flag) |
| Update API Key on BYOK group | Works — group carries a real `apiKey` |

## Verification

- `npm run compile` — clean (no TypeScript errors).
- `package.json` — valid JSON, no schema errors.
- **Verified in VS Code (2026-08-17):** Delete group and Update API Key now work; no duplicate models. Confirmed by user after reloading the window.

## Files Changed

| File | Change |
| --- | --- |
| `src/providerEnablement.ts` | **NEW** — `providerEnabledSetting()`, `toggleProviderEnabled()`, `CONFIG_SECTION`, `SETTING_ENABLED` |
| `src/extension.ts` | Gated provider registration; `manage()` remove/re-add action + dropped missing-key early-return; `hasByokGroup` flag + settings-only-group `[]` carve-out; two new toggle commands |
| `src/thinking.ts` | `buildModelConfigurationSchema()` no longer includes `apiKey` (returns thinking schema only) |
| `package.json` | New `enabled` settings; `when` clauses on vendor contributions; two new commands |
| `CHANGELOG.md` | New `[0.1.5] → Added` entry |

## Prevention Notes

- Do **not** remove the `when` clauses from the `languageModelChatProviders` contributions while the `enabled` settings exist — they are what make a disabled provider disappear from the Manage Language Models view.
- Do **not** re-add `apiKey` to the per-model `configurationSchema` — it recreates settings-only groups that block Delete / Update API Key and duplicate models (opencode issue #131).
- Always read the `enabled` keys from the **root** configuration, never section-scoped (see CONTRACT above).
- Provider registration happens at startup — any toggle requires a window reload to take effect (the QuickPick and commands both offer a **Reload Now** button).

## Related Docs

- `docs/bug-fixes/09-20260719-fresh-install-picker-missing-and-gear-dead.md` — the sister fix (v0.1.4) for models missing from the picker; same architecture, same porting approach.
- `opencode-copilot-chat/docs/issues/58-20260811-pr125-agents-window-byok-bridge.md` — source PR #125 (remove provider / kill-switch).
- `opencode-copilot-chat/docs/issues/64-20260813-issue131-permodel-config-duplicate-models.md` — source PR #135 (per-model config group fix).
