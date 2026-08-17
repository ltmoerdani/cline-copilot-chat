/**
 * Provider enablement for Cline Copilot Chat.
 *
 * Each provider (`cline` / `cline-pass`) can be removed from VS Code's
 * Manage Language Models list and every model picker via an `enabled` setting.
 * The vendor contribution in `package.json` is gated by a matching `when`
 * clause, and runtime registration is skipped when the setting is off.
 *
 * CONTRACT: callers must read these keys from the ROOT configuration
 * (`vscode.workspace.getConfiguration().get(key, ...)`), never from a
 * section-scoped configuration — `getConfiguration("clineCopilotChat")`
 * resolves keys relative to that section, so passing the full
 * `clineCopilotChat.clinePass.enabled` key there would silently read
 * `clineCopilotChat.clineCopilotChat.clinePass.enabled` and always fall back
 * to the default.
 */

import * as vscode from "vscode";
import { CLINE_VENDOR, CLINE_PASS_VENDOR, type AllProviderVendor } from "./providerTypes";

/** Configuration section under which all extension settings live. */
export const CONFIG_SECTION = "clineCopilotChat";
/** Setting key that gates whether a provider is registered at all. */
export const SETTING_ENABLED = "enabled";

/**
 * The full root-configuration key that gates whether a provider is registered
 * at all:
 *   - `cline`      → `clineCopilotChat.enabled`
 *   - `cline-pass` → `clineCopilotChat.clinePass.enabled`
 */
export function providerEnabledSetting(vendor: AllProviderVendor): string {
  return vendor === CLINE_PASS_VENDOR
    ? `${CONFIG_SECTION}.${CLINE_PASS_VENDOR}.${SETTING_ENABLED}`
    : `${CONFIG_SECTION}.${SETTING_ENABLED}`;
}

/**
 * Toggle whether a provider is registered at all. Disabling removes the
 * provider from the Language Models list and every model picker — the
 * provider's vendor contribution is gated by the same `when` clause
 * (`config.<key>`) and its runtime registration is skipped. Previously
 * configured BYOK groups and API keys are kept, so re-enabling restores the
 * provider exactly as it was.
 *
 * Provider registration happens at startup, so a window reload is required
 * for the change to take effect.
 */
export async function toggleProviderEnabled(
  vendor: AllProviderVendor,
  displayName: string,
): Promise<void> {
  const key = providerEnabledSetting(vendor);
  const cfg = vscode.workspace.getConfiguration();
  const current = cfg.get<boolean>(key, true);
  const next = !current;
  await cfg.update(key, next, vscode.ConfigurationTarget.Global);

  const reload = await vscode.window.showInformationMessage(
    next
      ? `${displayName} re-enabled. Reload the window for the provider to appear in Language Models again.`
      : `${displayName} removed from Language Models. Reload the window for it to disappear from the model picker and the manage list. Your API key and group settings are kept.`,
    "Reload Now",
  );
  if (reload === "Reload Now") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}
