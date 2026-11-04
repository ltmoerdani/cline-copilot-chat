/**
 * Cline Copilot Chat — learned model availability.
 *
 * The live catalog (catalog.ts) answers "does this model exist?". It cannot
 * answer "is this model callable with MY key?" — Cline serves 400+ pay-per-use
 * models regardless of plan, credits, or whether the model was moved behind
 * "Cline product surfaces". So the ground truth is the request itself.
 *
 * CONTRACT:
 *  - Only MODEL-level rejections are suppressed. Account-level failures (401 bad
 *    key, 402 no credits, 429 rate limit) are NEVER suppressed: they would hide
 *    the entire list and make the extension look broken.
 *  - Suppression is sticky per model id in globalState, cleared by the
 *    `resetModelAvailability` command or by the model reappearing as callable
 *    (the user can always refresh).
 *  - Suppressed ids stay resolvable in metadata.ts, so any cached picker
 *    selection still gets sane token limits.
 */

import * as vscode from "vscode";
import { ClineCopilotChatRequestError, isProductSurfacesOnlyError } from "./errors";

const UNAVAILABLE_KEY = "cline.unavailableModels.v1";

export interface UnavailableEntry {
  reason: string;
  at: number;
}

export type UnavailableMap = Record<string, UnavailableEntry>;

/** Read the suppression map. Never throws — corrupt state is ignored. */
export function getUnavailable(context: vscode.ExtensionContext): UnavailableMap {
  const raw = context.globalState.get<unknown>(UNAVAILABLE_KEY);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: UnavailableMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    out[id] = {
      reason: typeof entry.reason === "string" ? entry.reason : "unavailable",
      at: typeof entry.at === "number" ? entry.at : 0,
    };
  }
  return out;
}

/** Set of model ids currently hidden from the picker. */
export function getUnavailableIds(context: vscode.ExtensionContext): Set<string> {
  return new Set(Object.keys(getUnavailable(context)));
}

/**
 * Record a model as unavailable. Returns true when this is new information, so
 * the caller knows it should refresh the picker.
 */
export async function markUnavailable(
  context: vscode.ExtensionContext,
  modelId: string,
  reason: string,
): Promise<boolean> {
  const current = getUnavailable(context);
  if (current[modelId]?.reason === reason) return false;
  current[modelId] = { reason, at: Date.now() };
  await context.globalState.update(UNAVAILABLE_KEY, current);
  return true;
}

/** Forget every suppressed model (used by the reset command). */
export async function clearUnavailable(context: vscode.ExtensionContext): Promise<number> {
  const count = Object.keys(getUnavailable(context)).length;
  await context.globalState.update(UNAVAILABLE_KEY, {});
  return count;
}

/**
 * Classify a request failure as "this model is unusable" — or undefined when the
 * failure is about the account, the network, or the request shape.
 *
 * Matches `isProductSurfacesOnlyError` so the hardcoded PRODUCT_SURFACES_ONLY
 * list in metadata.ts becomes self-populating: a model moved behind Cline
 * product surfaces disappears from the picker the first time it is selected.
 */
export function classifyModelUnavailable(error: unknown): string | undefined {
  if (!(error instanceof ClineCopilotChatRequestError)) return undefined;
  const message = error.message.toLowerCase();

  if (error.status === 403 && isProductSurfacesOnlyError(error.message)) {
    return "product-surfaces-only";
  }
  if (error.status === 404) {
    return "model-not-found";
  }
  if (
    error.status === 400 &&
    /(model|deployment|engine)[^.]{0,40}(not found|not exist|does not exist|unknown|invalid|not supported|unsupported|deprecated|retired)/.test(
      message,
    )
  ) {
    return "model-not-found";
  }
  return undefined;
}

/** One-line human summary for the output channel / diagnostics. */
export function describeUnavailable(map: UnavailableMap): string[] {
  return Object.entries(map)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id, entry]) => `${id} — ${entry.reason} (${new Date(entry.at).toISOString()})`);
}
