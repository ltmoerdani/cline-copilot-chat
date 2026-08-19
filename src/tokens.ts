/**
 * Cline Copilot Chat — prompt token estimation.
 *
 * Ported from opencode-copilot-chat (`src/tokenEstimate.ts` +
 * `src/provider/tokens.ts`) for Issue #4: `provideTokenCount` previously
 * flattened text to `length / 4`, ignoring tool calls, tool results, image
 * parts, and message role overhead — which made VS Code's prompt estimate
 * (and therefore the Context Window widget) inaccurate.
 *
 * CONTRACT:
 * - These are ESTIMATES for display purposes. Authoritative usage comes from
 *   the server's `usage` SSE block, reported to VS Code via the "usage"
 *   DataPart emitted at the end of the stream (see `streaming.ts`).
 * - Overheads (4/1/10/6/1024) mirror opencode-copilot-chat `config.ts` so both
 *   extensions estimate identically for the same transcript.
 * - RULE: internal data parts (MIME "usage" emitted by this extension) can
 *   round-trip in the chat history on the next request; they are counted as
 *   0 tokens and must never inflate the estimate.
 */

import * as vscode from "vscode";

const MESSAGE_TOKEN_OVERHEAD = 4;
const MESSAGE_NAME_TOKEN_OVERHEAD = 1;
const TOOL_CALL_TOKEN_OVERHEAD = 10;
const TOOL_RESULT_TOKEN_OVERHEAD = 6;
const IMAGE_TOKEN_ESTIMATE = 1024;

/** MIME of the usage DataPart this extension emits at the end of a stream. */
const USAGE_DATA_MIME = "usage";

/**
 * Estimate tokens for a plain string.
 *
 * RULES:
 * - Whitespace is normalized before counting (JSON structure makes word-count
 *   heuristics too pessimistic; character count is steadier).
 * - +10% code buffer absorbs tokenizer differences on code/JSON-heavy text.
 * - CJK characters count as ~1 token each (one char/4 undercounts them).
 * - Always ≥ 1 for non-empty input.
 */
export function estimateTokenCount(value: string): number {
  if (!value) return 0;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  const cjkCharacters = normalized.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/gu)?.length ?? 0;
  const charEstimate = Math.ceil(normalized.length / 4);
  const codeBuffer = Math.ceil(charEstimate * 0.1);

  return Math.max(1, Math.ceil(charEstimate + codeBuffer + cjkCharacters));
}

/**
 * Estimate tokens for a whole chat message (role/name overhead + all content
 * parts). Mirrors `estimateChatMessageTokenCount` in opencode-copilot-chat.
 */
export function estimateChatMessageTokenCount(message: vscode.LanguageModelChatRequestMessage): number {
  const role = typeof message.role === "string" ? message.role : String(message.role);
  const name = typeof message.name === "string" ? message.name : "";
  const contentTokens = message.content
    .map(partToTokenCount)
    .reduce((total, count) => total + count, 0);

  return (
    MESSAGE_TOKEN_OVERHEAD +
    estimateTokenCount(role) +
    (name ? MESSAGE_NAME_TOKEN_OVERHEAD + estimateTokenCount(name) : 0) +
    contentTokens
  );
}

/** Estimate tokens for a single message part. */
function partToTokenCount(part: unknown): number {
  if (part instanceof vscode.LanguageModelTextPart) {
    return estimateTokenCount(part.value);
  }

  if (part instanceof vscode.LanguageModelToolResultPart) {
    const contentTokens = part.content
      .map(partToTokenCount)
      .reduce((total, count) => total + count, 0);
    return TOOL_RESULT_TOKEN_OVERHEAD + estimateTokenCount(part.callId) + contentTokens;
  }

  if (part instanceof vscode.LanguageModelToolCallPart) {
    return (
      TOOL_CALL_TOKEN_OVERHEAD +
      estimateTokenCount(part.callId) +
      estimateTokenCount(part.name) +
      estimateStructuredTokenCount(part.input)
    );
  }

  if (part instanceof vscode.LanguageModelDataPart) {
    // Internal usage parts ride along in the history — never counted.
    return part.mimeType === USAGE_DATA_MIME ? 0 : estimateDataPartTokenCount(part);
  }

  if (typeof part === "string") {
    return estimateTokenCount(part);
  }

  if (isRecord(part)) {
    return estimateStructuredTokenCount(part);
  }

  return 0;
}

/** Estimate tokens for an arbitrary structured value (JSON-serialized). */
function estimateStructuredTokenCount(value: unknown): number {
  try {
    return estimateTokenCount(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/** Estimate tokens for a data part (images use a fixed per-image estimate). */
function estimateDataPartTokenCount(part: vscode.LanguageModelDataPart): number {
  if (part.mimeType.startsWith("image/")) {
    return IMAGE_TOKEN_ESTIMATE;
  }

  if (part.mimeType.startsWith("text/") || part.mimeType === "application/json") {
    return estimateTokenCount(new TextDecoder().decode(part.data));
  }

  return Math.max(1, Math.ceil(part.data.byteLength / 4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
