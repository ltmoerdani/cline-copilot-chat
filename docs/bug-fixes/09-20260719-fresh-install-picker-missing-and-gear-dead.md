**Status:** ✅ Solved

# Fresh Install — Models Missing From Picker & Gear Icon Dead

**Topic:** extension / activation / diagnostics
**Updated:** 2026-07-19
**Tags:** #extension #activation #diagnostics #byok #vscode #port
**Ref:** Internal port from `zai-copilot-chat` v0.4.0 findings (`docs/bug-fixes/vscode-128-byok-utility-model.md` §10, §11, §12)

---

## Overview

When `cline-copilot-chat` is installed on a **fresh VS Code profile** or a **second machine** (e.g. after macOS migration, or a teammate cloning the setup), users can end up in a state where:

1. **No Cline / ClinePass models appear** in the Copilot Chat model picker, even though the extension is installed and activated.
2. The **gear icon (Manage Models…)** in the picker does nothing when clicked — no popup, no error, no visible state change.
3. There is **no log output** that explains why, so the user has no way to self-diagnose.

This is the same class of bug that hit `zai-copilot-chat` v0.4.0 (the sister extension this codebase was forked from). Because both extensions share the same architecture (`LanguageModelChatProvider` API + `languageModelChatProviders` declarative contribution + shared `ClineProvider` class), the same root causes and the same fixes apply here.

This patch (v0.1.4) ports three mitigations from Z.AI v0.4.0:

| # | Mitigation | Purpose |
|---|---|---|
| 1 | **Activation diagnostics banner** in the `Cline Copilot Chat` output channel | Pinpoints exactly where the registration pipeline breaks |
| 2 | **`setContext('github.copilot.clientByokEnabled', true)`** workaround | Keeps the Manage Models gear icon clickable for BYOK users who are not signed in to Copilot Chat |
| 3 | **"Set API Key" toast + explicit empty-list logging** | Closes the blind spot where `provideLanguageModelChatInformation` returned `[]` with no trace |

A bonus fourth fix is also included (see §4 below): a latent **dual-provider race condition** was uncovered during E2E verification, where `cline` (pay-per-use) silently returned `[]` even when the API key was present. This was a pre-existing bug that the new diagnostics made visible.

## Problem

### 1. Models missing from picker on a fresh machine

VS Code Settings Sync **does not sync `SecretStorage`** for security reasons. When a user installs the extension on a second Mac and signs in with Settings Sync, the extension downloads, the `languageModelChatProviders` contribution registers the vendor ids (`cline`, `cline-pass`), but the API key (`clineCopilotChat.apiKey`) is empty on that machine.

When `provideLanguageModelChatInformation` cannot resolve an API key, it returns `[]`. VS Code then shows zero models in the picker for both vendors — with no error, no log, no toast. The user assumes the extension is broken.

Re-registering under the same vendor id throws `"already registered"`. Trying a fresh vendor id (e.g. `cline2`) produces the same empty picker because the underlying problem is the missing key, not the vendor id.

### 2. Gear icon / "Manage Models…" does nothing

The gear icon invokes VS Code's built-in command `workbench.action.chat.manage` ("Manage Language Models"). Its precondition (extracted from `workbench.desktop.main.js`) is:

```javascript
OYt = x.and(
  ee.enabled,                              // chatIsEnabled context key
  x.or(
    ee.Entitlement.planFree,               // chatPlanFree
    ee.Entitlement.planEdu,
    ee.Entitlement.planPro,
    ee.Entitlement.planProPlus,
    ee.Entitlement.planMax,
    ee.Entitlement.planBusiness,
    ee.Entitlement.planEnterprise,
    ee.Entitlement.internal,
    or.clientByokEnabled                   // github.copilot.clientByokEnabled
  )
)
```

`ee.enabled` (`chatIsEnabled`) defaults to `false` and is set to `true` only by the GitHub Copilot Chat extension after the user signs in. On a fresh machine where the user has not yet signed in to Copilot Chat, the AND-branch fails and the command is a no-op.

The escape hatch is `github.copilot.clientByokEnabled` — it defaults to `true` per the schema, but VS Code sometimes leaves it unset until the Copilot extension first touches the context service. Forcing the value removes that race.

### 3. No diagnostics for "why is the picker empty?"

Before this patch, the only log line emitted when the key was missing was:

```
[Cline] No API key — returning empty model list.
```

That line goes to the `Cline Copilot Chat` output channel, but:

- The user has no reason to look there (no toast points them at it).
- The line does not mention that SecretStorage is per-device and not synced.
- There is no one-shot banner summarising the **full** activation state (VS Code version, vendor registration, `selectChatModels` counts, `setContext` result), so debugging "is it the contribution, the key, the registration, or the cache?" requires guessing.

## Root Cause

### Why SecretStorage is per-device

VS Code's `SecretStorage` API stores secrets in the OS keychain (Keychain on macOS, libsecret on Linux, DPAPI on Windows). Settings Sync deliberately excludes this store — syncing API keys across machines would be a security hole. The trade-off is that BYOK extensions must ask the user to re-enter their key on each new machine.

### Why `clientByokEnabled` is sometimes unset

The context key `github.copilot.clientByokEnabled` is owned by the GitHub Copilot Chat extension. Its schema default is `true`, but VS Code context keys are lazily populated — the value is only "live" once some extension reads or writes it. On a machine where Copilot Chat has not yet run (or the user signed out), the key can be in an undefined state that fails the precondition `OR`-branch.

### Why no banner existed

The original `activate()` only logged two lines:

```
[ClineCopilotChat] activate() START
[ClineCopilotChat] ✅ Registered: cline, cline-pass
```

Neither line tells you whether VS Code *actually* picked up the registration, whether the API key is present, or whether the Manage Models command will work. The `selectChatModels({ vendor: "..." })` API — the only reliable way to ask VS Code "how many models do you see for this vendor?" — was only used inside the manual `clineCopilotChat.diagnostics` command, not at activation time.

## Solution

### 1. Activation diagnostics banner

New `logActivationDiagnostics()` function (async, called via `void` from `activate()`). Writes a single banner to the `Cline Copilot Chat` output channel on every activation:

```
=== Cline Copilot Chat activation diagnostics ===
[activate] extension activated, vendors="cline", "cline-pass"
[activate] VS Code version: 1.129.1
[activate] SecretStorage "clineCopilotChat.apiKey": present (len=67)
[activate] selectChatModels({ vendor: "cline" }): 13 model(s) visible to VS Code
[activate] selectChatModels({ vendor: "cline-pass" }): 10 model(s) visible to VS Code
[activate] set 'github.copilot.clientByokEnabled' = true (ensures Manage Models gear icon stays clickable for BYOK users who are not signed in to Copilot)
=== end activation diagnostics ===
```

Key implementation details:

- **SecretStorage presence is reported by length only** — never the key itself.
- **`selectChatModels` is polled three times** at 0 ms / 500 ms / 1500 ms. VS Code caches the picker list per window, and on the very first tick after activation the registration may not yet be visible. If the first poll returns 0, the function waits and re-polls.
- **`setContext` runs only if at least one model is visible.** There's no point forcing the context key if registration genuinely failed.
- **All `banner.push(...)` calls happen BEFORE `channel.appendLine(banner.join("\n"))`.** This is a deliberate fix for a bug found in Z.AI v0.4.0's first iteration, where the `setContext` result was pushed to the array *after* the array had already been flushed — silently dropping the line from the output.

### 2. `setContext` workaround for the gear icon

```typescript
if (totalModels > 0) {
  await vscode.commands.executeCommand(
    "setContext",
    "github.copilot.clientByokEnabled",
    true,
  );
}
```

This satisfies the `OR`-branch of the `OYt` precondition, keeping the gear icon clickable even when the user has not signed in to Copilot Chat. It is defensive — `clientByokEnabled` already defaults to `true` — but forcing it removes the race where VS Code has not yet populated the key.

**Definitive fix for end users:** if the gear icon is still unresponsive after a window reload, sign in to GitHub Copilot Chat. A free personal GitHub account is sufficient — no Copilot Pro subscription is required for BYOK usage. Signing in sets `chatIsEnabled = true`, which satisfies the `AND`-branch of the precondition that `clientByokEnabled` alone cannot reach.

### 3. "Set API Key" toast + explicit empty-list logging

When the activation banner detects that `SecretStorage` is missing, a one-time toast (guarded by the `cline.apiKeyMissingNotified` globalState flag) is shown:

```typescript
const choice = await vscode.window.showWarningMessage(
  "Cline Copilot Chat: No API key found. Models will not appear in the Copilot Chat picker.",
  "Set API Key",
);
if (choice === "Set API Key") {
  void vscode.commands.executeCommand("clineCopilotChat.setApiKey");
}
```

The empty-list branch in `provideLanguageModelChatInformation` was also expanded to explain *why* the list is empty and *what to do about it*:

```
[Cline] No API key — returning empty model list. Run 'Cline Copilot Chat: Set API Key'
then reload the window. Note: SecretStorage is per-device and is NOT synced by VS Code
Settings Sync.
```

And a success log was added so the picker-population path is no longer silent:

```
[ClinePass] advertising 10 model(s) to VS Code [cline-pass/glm-5.2, cline-pass/kimi-k2.7-code, cline-pass/kimi-k2.6, …]
```

### 4. Bonus: dual-provider race condition in `provideLanguageModelChatInformation`

E2E verification (see §5) surfaced a pre-existing bug. The original key-resolution branch was:

```typescript
let apiKey = opts.configuration?.apiKey;
if (!apiKey && opts.configuration) {            // ← checks opts.configuration TWICE
  apiKey = await resolveStoredApiKey(this.context.secrets);
}
```

If VS Code invoked `provideLanguageModelChatInformation` with `opts.configuration === undefined` (which happens early in a session, before the user picks a configuration), the entire `if` block was skipped and `resolveStoredApiKey` was never called. The function then fell through to the `if (!apiKey) return []` branch and the picker stayed empty — even when the key was sitting right there in `SecretStorage`.

This manifested asymmetrically across the two vendors: `cline-pass` happened to receive calls with `opts.configuration` populated (because its picker entry had been cached from a prior session) and advertised 10 models; `cline` received calls without `opts.configuration` and advertised 0. The result — "I can see ClinePass but not Cline" — looked inexplicable without the new logging.

Fix: always fall back to `resolveStoredApiKey` when no key is in hand, regardless of whether `opts.configuration` is set:

```typescript
let apiKey = opts.configuration?.apiKey;
if (!apiKey) {
  apiKey = await resolveStoredApiKey(this.context.secrets);
}
```

This bug predates this patch — it has been present since v0.1.0. The new diagnostics banner simply made it visible enough to fix.

## Files Changed

| File | Change |
|---|---|
| `src/extension.ts` | New `logActivationDiagnostics()` function (one-shot banner to the `Cline Copilot Chat` output channel — VS Code version, SecretStorage presence, `selectChatModels` count polled at 0/500/1500 ms for both vendors, `setContext` workaround result, one-time "Set API Key" toast). New log lines in `provideLanguageModelChatInformation` when returning `[]` due to missing key (with Settings Sync hint), when cancelled, and when advertising N models (first 3 ids). **Bonus fix:** dual-provider race condition — `resolveStoredApiKey` is now called unconditionally when no key is in hand, not only when `opts.configuration` is set. |
| `package.json` | Bumped `0.1.3` → `0.1.4`. Declarative `languageModelChatProviders` contribution **retained** (required — see Z.AI v0.4.0 §10 for the regression analysis). |
| `CHANGELOG.md` | New `0.1.4` entry. |
| `README.md` | New **Troubleshooting** section covering "models missing from picker on a fresh install" and "gear icon does nothing", with the ordered runbook. |
| `docs/bug-fixes/09-20260719-fresh-install-picker-missing-and-gear-dead.md` | This document. |

## Verification

End-to-end smoke test following the same methodology as Z.AI v0.4.0 §12. To simulate a "fresh device" without modifying the developer's main VS Code profile, the extension was installed into a fully isolated environment using `--user-data-dir` and `--extensions-dir`:

```bash
CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
FRESH_DIR="/tmp/cline-014-test"
FRESH_EXT="/tmp/cline-014-test-ext"

rm -rf "$FRESH_DIR" "$FRESH_EXT"
mkdir -p "$FRESH_DIR" "$FRESH_EXT"

"$CODE" --extensions-dir="$FRESH_EXT" \
  --install-extension cline-copilot-chat-0.1.4.vsix --force
```

### Launch 1 — no API key

First launch with empty `SecretStorage` (no key copied in yet):

```
=== Cline Copilot Chat activation diagnostics ===
[activate] extension activated, vendors="cline", "cline-pass"
[activate] VS Code version: 1.129.1
[activate] SecretStorage "clineCopilotChat.apiKey": MISSING
[activate] selectChatModels({ vendor: "cline" }): 0 model(s) visible to VS Code
[activate] selectChatModels({ vendor: "cline-pass" }): 0 model(s) visible to VS Code
[activate] selectChatModels re-poll @500ms: cline=0, cline-pass=0
[activate] selectChatModels re-poll @1500ms: cline=0, cline-pass=0
[activate] skipped setContext — no models visible yet (likely API key missing or vendor contribution removed)
=== end activation diagnostics ===

[Cline] provideLanguageModelChatInformation CALLED
[Cline] No API key — returning empty model list. Run 'Cline Copilot Chat: Set API Key' then reload the window. Note: SecretStorage is per-device and is NOT synced by VS Code Settings Sync.
[ClinePass] provideLanguageModelChatInformation CALLED
[ClinePass] No API key — returning empty model list. Run 'Cline Copilot Chat: Set API Key' then reload the window. Note: SecretStorage is per-device and is NOT synced by VS Code Settings Sync.
```

A "Set API Key" warning toast was also displayed (one-time per `cline.apiKeyMissingNotified` globalState flag).

### Launch 2 — API key copied in

The encrypted `SecretStorage` entry was copied from the main profile's `state.vscdb`:

```bash
MAIN_SQLITE="$HOME/Library/Application Support/Code/User/globalStorage/state.vscdb"
FRESH_SQLITE="$FRESH_DIR/User/globalStorage/state.vscdb"
VALUE=$(sqlite3 "$MAIN_SQLITE" \
  "SELECT value FROM ItemTable WHERE key = 'secret://{\"extensionId\":\"ltmoerdani.cline-copilot-chat\",\"key\":\"clineCopilotChat.apiKey\"}';")
sqlite3 "$FRESH_SQLITE" \
  "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('secret://{\"extensionId\":\"ltmoerdani.cline-copilot-chat\",\"key\":\"clineCopilotChat.apiKey\"}', '$VALUE');"
```

Second launch:

```
=== Cline Copilot Chat activation diagnostics ===
[activate] extension activated, vendors="cline", "cline-pass"
[activate] VS Code version: 1.129.1
[activate] SecretStorage "clineCopilotChat.apiKey": present (len=67)
[activate] selectChatModels({ vendor: "cline" }): 0 model(s) visible to VS Code    ← BONUS BUG SURFACED
[activate] selectChatModels({ vendor: "cline-pass" }): 10 model(s) visible to VS Code
[activate] set 'github.copilot.clientByokEnabled' = true (ensures Manage Models gear icon stays clickable for BYOK users who are not signed in to Copilot)
=== end activation diagnostics ===

[ClinePass] advertising 10 model(s) to VS Code [cline-pass/glm-5.2, cline-pass/kimi-k2.7-code, cline-pass/kimi-k2.6, …]
```

The `cline` count of 0 (despite the key being present) was the symptom that led to the bonus race-condition fix in §4. After the fix, both vendors advertise on Launch 2.

### Test matrix

| Check | Expected | Actual | Result |
|---|---|---|---|
| `.vsix` builds clean | `tsc -p ./` clean, no errors | clean | ✅ |
| TypeScript `get_errors` | 0 errors | 0 errors | ✅ |
| Extension activates in fresh env | activation log in exthost | `ExtensionService#_doActivateExtension ltmoerdani.cline-copilot-chat` | ✅ |
| No `UNKNOWN vendor cline` error | declarative contribution present | `grep -c languageModelChatProviders package.json` = 1 (with 2 vendor entries) | ✅ |
| Banner appears on Launch 1 (no key) | full banner with `MISSING` | matches expected | ✅ |
| `selectChatModels` re-poll logic | runs when first poll = 0 | `re-poll @500ms` + `re-poll @1500ms` lines present | ✅ |
| `setContext` skipped when 0 models | logged as skipped | `skipped setContext — no models visible yet` | ✅ |
| "Set API Key" toast on missing key | shown once | shown, button opens command | ✅ |
| Banner appears on Launch 2 (key present) | full banner with `present (len=67)` + `setContext` runs | matches expected | ✅ |
| `setContext` runs when ≥1 model visible | `set 'github.copilot.clientByokEnabled' = true` line present | ✅ | ✅ |
| `provideLanguageModelChatInformation` logs advertising count | `advertising N model(s)` line present | `advertising 10 model(s)` for ClinePass | ✅ |
| Empty-list logging has Settings Sync hint | hint text in log | `Note: SecretStorage is per-device and is NOT synced by VS Code Settings Sync.` | ✅ |
| Bonus race fix: `cline` also advertises on Launch 2 | `cline` count > 0 | verified after rebuild | ✅ |

### Build artifact

```
DONE  Packaged: /Users/ltmoerdani/Startup/cline-copilot-chat/cline-copilot-chat-0.1.4.vsix
```

## Runbook (final, ordered)

If a user reports "Cline / ClinePass models don't appear in the picker" or "the gear icon does nothing":

1. **Check the `Cline Copilot Chat` output channel.** It now prints a single activation banner that pinpoints the failure mode.
2. **If `SecretStorage "clineCopilotChat.apiKey": MISSING`** → run `Cline Copilot Chat: Set API Key`, then `Developer: Reload Window`. SecretStorage is per-device and is not synced by VS Code Settings Sync.
3. **If `selectChatModels` reports 0 models for one vendor while the key is present** → check the Extension Host log for `Chat model provider uses UNKNOWN vendor cline` (or `cline-pass`). If present, the declarative `languageModelChatProviders` contribution has been removed from `package.json` and must be restored. If absent, this is the dual-provider race condition (§4) — fixed in v0.1.4; ask the user to upgrade.
4. **If `selectChatModels` reports N models but the picker is still empty** → reload the window. VS Code caches the picker list per window.
5. **If the gear icon is still unresponsive after reload** → sign in to GitHub Copilot Chat (free tier is enough). The `setContext` workaround should keep the gear clickable in most cases, but signing in is the definitive fix because it sets `chatIsEnabled = true` which satisfies the `AND`-branch of the precondition that `clientByokEnabled` cannot reach on its own.

## Lessons Learned

1. **Bugs that were silent before stay silent without telemetry.** The dual-provider race condition (§4) had been present since v0.1.0 but was never reported — users just saw "ClinePass works, Cline doesn't" and either lived with it or switched vendors. The new `advertising N model(s)` log line was what made the bug visible enough to fix.
2. **`selectChatModels({ vendor })` is the source of truth, not `registerLanguageModelChatProvider`.** Registration succeeding only means VS Code accepted the programmatic provider. The declarative contribution in `package.json` must list the same vendor ids, otherwise `selectChatModels` returns 0 with no error.
3. **Banner ordering matters.** The Z.AI v0.4.0 bug where `setContext` result was pushed after `channel.appendLine(...)` is easy to reintroduce when adding new lines to a banner. Always push everything into the array first, flush once at the end.
4. **`opts.configuration` is not always populated.** VS Code can invoke `provideLanguageModelChatInformation` with `configuration === undefined` early in a session. Key-resolution fallbacks must not be gated on `opts.configuration` being truthy — they should run unconditionally whenever the in-hand key is empty.
5. **Port fixes between sister extensions.** This codebase and `zai-copilot-chat` were forked from the same base. When a bug is found in one, the other almost certainly has it too. The cost of porting is small; the cost of users hitting the same bug twice is not.

## References

- Z.AI v0.4.0 fix document (sister extension, same root cause): `docs/bug-fixes/vscode-128-byok-utility-model.md` §10 (picker missing on second device), §11 (gear icon dead), §12 (fresh-env smoke test methodology)
- VS Code 1.128 release notes — "Configure the default utility model for BYOK": https://code.visualstudio.com/updates/v1_128#_configure-the-default-utility-model-for-byok
- VS Code Language Model Chat Provider API: https://code.visualstudio.com/api/extension-guides/language-model
