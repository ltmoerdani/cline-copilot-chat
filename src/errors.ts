import * as vscode from "vscode";

export class ClineCopilotChatRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseText?: string,
  ) {
    super(message);
    this.name = "ClineCopilotChatRequestError";
  }

  get userMessage(): string {
    if (this.status === 401) {
      return "Cline Copilot Chat: Invalid API key. Run 'Cline Copilot Chat: Set API Key' to update.";
    }
    if (this.status === 402) {
      return "Cline Copilot Chat: Insufficient credits. Add credits at app.cline.bot or use ClinePass models instead.";
    }
    if (this.status === 403 && isProductSurfacesOnlyError(this.message)) {
      return (
        "Cline Copilot Chat: This model is only available inside the Cline app " +
        "(IDE extension / CLI), not through a public API key.\n\n" +
        "Pick a different model (e.g. deepseek/deepseek-chat, minimax/minimax-m3, or a " +
        "ClinePass model) that is still served over the API. See the README for the list " +
        "of models that no longer work via API key."
      );
    }
    if (this.status === 404) {
      return "Cline Copilot Chat: Model not found. For pay-per-use models, enable Cline (usage-billing) at app.cline.bot and add credits. Use ClinePass models for subscription access.";
    }
    if (this.status === 429) {
      return "Cline Copilot Chat: Rate limited. Wait a moment and try again.";
    }
    return `Cline Copilot Chat error (${this.status ?? "network"}): ${this.message}`;
  }
}

/**
 * CONTRACT: Detects the Cline server's "product surfaces" rejection.
 *
 * RULES:
 * - Cline returns HTTP 403 with a message like:
 *   "Error 403: <model> is only available via Cline product surfaces.
 *    If you are using an old version of Cline, please update to the latest version"
 *   when a model has been moved off the public API-key path (Issue #3).
 * - Match on lowercase substrings so it is resilient to exact wording changes.
 * - Only used for user-facing error messages; never changes request behavior.
 */
export function isProductSurfacesOnlyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("only available via cline product surfaces") ||
    lower.includes("cline product surfaces")
  );
}

export function buildClineCopilotChatRequestError(
  status: number,
  responseText: string,
): ClineCopilotChatRequestError {
  let message = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(responseText);
    if (parsed.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // use default message
  }
  return new ClineCopilotChatRequestError(message, status, responseText);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function truncateForLog(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
