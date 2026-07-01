/**
 * Vendor + routing type definitions for Cline Copilot Chat.
 *
 * Strategy: a single unified provider for 10+ frontier open-weight models
 * via Cline's API (api.cline.bot). New models land on the same endpoint
 * without needing a new vendor ID.
 */

export const CLINE_COPILOT_CHAT_VENDOR = "cline-copilot-chat" as const;

/** Base vendor ID used for metadata lookups and API routing. */
export type ProviderVendor = typeof CLINE_COPILOT_CHAT_VENDOR;

/** All vendor IDs (currently only Cline Copilot Chat). */
export type AllProviderVendor = typeof CLINE_COPILOT_CHAT_VENDOR;

/** Resolve vendor — identity function since there's only one vendor. */
export function resolveBaseVendor(vendor: AllProviderVendor): ProviderVendor {
  return vendor;
}

export interface ProviderRoutingDefinition {
  vendor: AllProviderVendor;
  chatCompletionsUrl: string;
  modelsUrl: string;
}
