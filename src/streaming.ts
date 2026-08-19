/**
 * Cline Copilot Chat streaming — handles OpenAI-compatible SSE chat completions.
 */

import * as vscode from "vscode";
import {
  buildClineCopilotChatRequestError,
  formatDuration,
  truncateForLog,
} from "./errors";
import { shouldRetryHttp, retryDelayMs, parseRetryAfter } from "./retry";
import { XmlToolStreamParser } from "./toolParsing";

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Token usage captured from an SSE `usage` block (Issue #4). */
interface CapturedUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
}

export interface StreamRequestOptions {
  url: string;
  providerDisplayName: string;
  apiKey: string;
  modelId: string;
  body: unknown;
  requestHeaders: Record<string, string>;
  progress: vscode.Progress<vscode.LanguageModelResponsePart>;
  token: vscode.CancellationToken;
  output?: vscode.OutputChannel;
  debugReasoning: boolean;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
  stripThinkTags?: "never" | "auto" | "always";
  /**
   * When true, forces think-tag stripping regardless of the `stripThinkTags`
   * mode. Set by the provider when the request has tools (agent mode) to
   * prevent `<think>` tags from leaking into the chat UI as unreadable
   * code blocks. Ported from opencode-copilot-chat.
   */
  forceStripThinkTags?: boolean;
  /**
   * When true, text content is scanned for XML-style tool invocations
   * (e.g. `<read_file>…</read_file>`) and converted to
   * `LanguageModelToolCallPart`. Used for open-weight models that don't
   * emit native `tool_calls` deltas.
   */
  enableXmlToolParsing?: boolean;
  /**
   * Set of tool names eligible for XML parsing. Only tags matching these
   * names are parsed; other XML-like tags pass through as text.
   */
  toolNames?: ReadonlySet<string>;
  onReasoningContent?: (toolCallIds: string[], reasoningContent: string) => void;
}

export interface TransportRequestSummary {
  providerDisplayName: string;
  modelId: string;
  url: string;
  status?: number;
  contentType?: string;
  payloadBytes: number;
  totalBytes: number;
  totalEvents: number;
  durationMs: number;
  ttfbMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  finishReason?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// ThinkTagFilter — streaming stripper for inline `<think>...</think>` tags
//
// Some models (notably MiniMax M-series, DeepSeek V4) inline their
// chain-of-thought directly inside the `content` text field wrapped in
// `<think>` / `</think>` tags rather than using a dedicated
// `reasoning_content` field. When this raw text is emitted to the VS Code
// chat UI the reasoning "leaks" into the visible response, making it
// unreadable.
//
// The filter processes text **as it arrives** (potentially split across many
// SSE chunks) and separates it into:
//   • `visibleText` — content outside think tags (emitted to chat)
//   • `thinkingText` — content inside think tags (accumulated as reasoning)
//
// Edge cases handled:
//   - `<think>` or `</think>` split across chunk boundaries
//   - Unclosed `<think>` at end of stream (flushed as thinking on `finish()`)
//   - Leading whitespace immediately after opening `<think>` is trimmed
//
// Ported from opencode-copilot-chat `src/transports/thinkTags.ts`.
// ---------------------------------------------------------------------------

const OPEN_THINK_TAG = "<think>";
const CLOSE_THINK_TAG = "</think>";

export function shouldStripThinkTags(mode: "never" | "auto" | "always" | undefined, modelId: string): boolean {
  if (mode === "always") {
    return true;
  }
  if (mode === "never" || mode === undefined) {
    return false;
  }
  // "auto" — strip only for models known to inline thinking tags
  return /^minimax-/i.test(modelId);
}

export function createThinkTagFilter(
  mode: "never" | "auto" | "always" | undefined,
  modelId: string,
  forceOverride?: boolean,
): ThinkTagFilter | undefined {
  const effective = forceOverride ? "always" : mode;
  return shouldStripThinkTags(effective, modelId) ? new ThinkTagFilter() : undefined;
}

export class ThinkTagFilter {
  /** Partial text carried over from the previous chunk for boundary matching. */
  private carry = "";
  /** Whether we are currently inside a `<think>` block. */
  private insideThink = false;

  /**
   * Process an incoming text chunk.
   * Returns `{ visible, thinking }` where `visible` is safe to emit to the
   * chat and `thinking` should be accumulated as reasoning content.
   */
  process(chunk: string): { visible: string; thinking: string } {
    if (!chunk) {
      return { visible: "", thinking: "" };
    }

    // Prepend carry from the previous chunk so boundary tags can be detected
    // even when they are split across chunks.
    const buffer = this.carry + chunk;
    this.carry = "";

    let visible = "";
    let thinking = "";
    let pos = 0;
    const maxScan = Math.max(OPEN_THINK_TAG.length, CLOSE_THINK_TAG.length);

    while (pos < buffer.length) {
      if (this.insideThink) {
        // Look for closing </think>
        const closeIdx = buffer.indexOf(CLOSE_THINK_TAG, pos);
        if (closeIdx === -1) {
          // No closing tag found — consume the rest, but keep a tail for
          // boundary matching in the next chunk.
          const safeEnd = buffer.length - maxScan;
          if (safeEnd > pos) {
            thinking += buffer.slice(pos, safeEnd);
            this.carry = buffer.slice(safeEnd);
          } else {
            // Entire remaining buffer is shorter than max scan — carry it all
            this.carry = buffer.slice(pos);
          }
          break;
        }
        // Found closing tag
        thinking += buffer.slice(pos, closeIdx);
        pos = closeIdx + CLOSE_THINK_TAG.length;
        this.insideThink = false;
        // Skip a single leading whitespace after </think> for cleaner output
        if (pos < buffer.length && (buffer[pos] === "\n" || buffer[pos] === "\r")) {
          pos += 1;
          if (pos < buffer.length && buffer[pos] === "\n") {
            pos += 1;
          }
        }
      } else {
        // Look for opening <think>
        const openIdx = buffer.indexOf(OPEN_THINK_TAG, pos);
        if (openIdx === -1) {
          // No opening tag — emit visible text but keep a tail for boundary
          const safeEnd = buffer.length - maxScan;
          if (safeEnd > pos) {
            visible += buffer.slice(pos, safeEnd);
            this.carry = buffer.slice(safeEnd);
          } else {
            this.carry = buffer.slice(pos);
          }
          break;
        }
        // Found opening tag
        visible += buffer.slice(pos, openIdx);
        pos = openIdx + OPEN_THINK_TAG.length;
        this.insideThink = true;
        // Skip a single leading whitespace after <think>
        if (pos < buffer.length && (buffer[pos] === "\n" || buffer[pos] === "\r")) {
          pos += 1;
          if (pos < buffer.length && buffer[pos] === "\n") {
            pos += 1;
          }
        }
      }
    }

    return { visible, thinking };
  }

  /**
   * Call at end of stream to flush any remaining carry.
   * If we were inside an unclosed `<think>`, that content is treated as
   * thinking. Otherwise the remaining carry is visible text.
   */
  finish(): { visible: string; thinking: string } {
    const remaining = this.carry;
    this.carry = "";
    if (this.insideThink) {
      // Unclosed think tag at end of stream — treat as thinking
      this.insideThink = false;
      return { visible: "", thinking: remaining };
    }
    return { visible: remaining, thinking: "" };
  }
}

function createReasoningDebugger(
  output: vscode.OutputChannel | undefined,
  debug: boolean,
): (content: string) => void {
  if (!debug || !output) {
    return () => {};
  }
  return (content: string) => {
    output.appendLine(`[reasoning] ${truncateForLog(content, 500)}`);
  };
}

/**
 * Stream an OpenAI-compatible chat completions response.
 */
export async function streamChatCompletions(
  options: StreamRequestOptions,
): Promise<void> {
  const thinkFilter = createThinkTagFilter(options.stripThinkTags, options.modelId, options.forceStripThinkTags);
  const debugReasoning = createReasoningDebugger(options.output, options.debugReasoning);
  let emittedText = 0;
  let emittedTools = 0;
  let reasoningChars = 0;

  // XML tool-call parser — enabled when the model doesn't support native
  // tool calling but we still want agent mode to work. Converts XML-style
  // tool tags in the text stream into LanguageModelToolCallPart.
  const xmlParser =
    options.enableXmlToolParsing && options.toolNames && options.toolNames.size > 0
      ? new XmlToolStreamParser({
          toolNames: options.toolNames,
          debug: options.debugReasoning && options.output
            ? (msg: string) => options.output!.appendLine(msg)
            : undefined,
        })
      : null;

  if (xmlParser) {
    options.output?.appendLine(
      `[tool-parser] enabled for model=${options.modelId} tools=${options.toolNames?.size ?? 0}`,
    );
  }

  // Accumulator for native streaming tool calls.
  // OpenAI streams tool_calls across multiple deltas (id/name/arguments arrive
  // in separate chunks). We MUST accumulate them and only emit when the stream
  // signals finish_reason === "tool_calls" — otherwise we emit partial tool
  // calls with empty arguments, causing the model to loop forever.
  const pendingToolCalls = new Map<number, PendingToolCall>();

  function collectToolCallsDelta(toolCallsArray: unknown): void {
    if (!Array.isArray(toolCallsArray)) return;
    for (const tc of toolCallsArray) {
      if (!isRecord(tc)) continue;
      const idx = typeof tc.index === "number" ? tc.index : pendingToolCalls.size;
      const pending = pendingToolCalls.get(idx) ?? { id: "", name: "", arguments: "" };
      if (typeof tc.id === "string") pending.id = tc.id;
      const fn = tc.function;
      if (isRecord(fn)) {
        if (typeof fn.name === "string") pending.name += fn.name;
        if (typeof fn.arguments === "string") pending.arguments += fn.arguments;
      }
      pendingToolCalls.set(idx, pending);
    }
  }

  // ── Usage capture & reporting (Issue #4) ─────────────────────────────────
  //
  // CONTRACT: Copilot Chat's Context Window widget and Session Info only
  // update when the provider emits a LanguageModelDataPart with MIME "usage"
  // at the end of the stream — the same mechanism used by Copilot's own BYOK
  // providers (AnthropicLMProvider / GeminiNativeProvider) and by
  // opencode-copilot-chat (`chatParts.ts` → `createUsageDataParts`).
  //
  // RULES:
  //   - Usage is captured from ANY SSE chunk carrying a `usage` record: both
  //     the finish_reason chunk and the usage-only final chunk that
  //     `stream_options.include_usage` produces (choices: []).
  //   - cached_tokens is read from the OpenAI-style nested
  //     `prompt_tokens_details.cached_tokens` OR a top-level `cached_tokens`.
  //   - The DataPart is emitted ONLY on the success path — a thrown stream
  //     error skips the emit entirely (matches opencode engine.ts).
  //   - Reporting failure must never fail the response.
  let capturedUsage: CapturedUsage | undefined;

  function captureUsageFromRecord(u: Record<string, unknown>): void {
    const usage: CapturedUsage = capturedUsage ?? {};
    if (typeof u.prompt_tokens === "number") usage.promptTokens = u.prompt_tokens;
    if (typeof u.completion_tokens === "number") usage.completionTokens = u.completion_tokens;
    if (typeof u.total_tokens === "number") usage.totalTokens = u.total_tokens;
    const details = u.prompt_tokens_details;
    const nestedCached =
      isRecord(details) && typeof details.cached_tokens === "number" ? details.cached_tokens : undefined;
    const topLevelCached = typeof u.cached_tokens === "number" ? u.cached_tokens : undefined;
    const cached = nestedCached ?? topLevelCached;
    if (cached !== undefined) usage.cachedTokens = cached;
    capturedUsage = usage;
  }

  /** Emit the captured usage as a "usage" DataPart so VS Code can update
   *  the Context Window widget and Session Info. No-op when nothing usable
   *  was captured. */
  function emitUsageDataPart(): void {
    if (!capturedUsage) return;
    const { promptTokens, completionTokens, totalTokens, cachedTokens } = capturedUsage;
    if (
      promptTokens === undefined &&
      completionTokens === undefined &&
      totalTokens === undefined
    ) {
      return; // nothing usable captured
    }

    const total =
      totalTokens ??
      (promptTokens !== undefined || completionTokens !== undefined
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : undefined);

    // OpenAI-compatible usage payload (same shape as opencode-copilot-chat
    // toProviderUsagePayload — minus copilotCredits, which cline has no
    // pricing table for yet).
    const payload: Record<string, unknown> = {};
    if (promptTokens !== undefined) payload.prompt_tokens = promptTokens;
    if (completionTokens !== undefined) payload.completion_tokens = completionTokens;
    if (total !== undefined) payload.total_tokens = total;
    if (cachedTokens !== undefined) {
      payload.prompt_tokens_details = { cached_tokens: cachedTokens };
    }

    try {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      options.progress.report(new vscode.LanguageModelDataPart(encoded, "usage"));
      options.output?.appendLine(
        `[usage] prompt=${promptTokens ?? "n/a"} completion=${completionTokens ?? "n/a"} ` +
          `total=${total ?? "n/a"}${cachedTokens !== undefined ? ` cached=${cachedTokens}` : ""} → reported to VS Code`,
      );
    } catch (error) {
      // Never fail the response because usage reporting failed.
      const message = error instanceof Error ? error.message : String(error);
      options.output?.appendLine(`[usage] failed to report usage DataPart: ${message}`);
    }
  }

  function flushNativeToolCalls(): vscode.LanguageModelToolCallPart[] {
    const parts: vscode.LanguageModelToolCallPart[] = [];
    for (const [idx, tc] of pendingToolCalls) {
      if (!tc.name) continue;
      const callId = tc.id || `cline-copilot-chat-tool-${Date.now()}-${idx}`;
      let input: Record<string, unknown> = {};
      if (tc.arguments) {
        try { input = JSON.parse(tc.arguments) as Record<string, unknown>; }
        catch { /* malformed JSON — pass empty */ }
      }
      parts.push(new vscode.LanguageModelToolCallPart(callId, tc.name, input));
    }
    pendingToolCalls.clear();
    return parts;
  }

  await streamChatResponse({
    ...options,
    extractStreamParts: (data: unknown) => {
      const parts: vscode.LanguageModelResponsePart[] = [];
      if (!isRecord(data)) return parts;

      // Capture usage BEFORE the choices guard — with
      // stream_options.include_usage the final SSE chunk carries an EMPTY
      // choices array plus the usage block (Issue #4). The previous code
      // gated usage on finish_reason and never saw that chunk.
      if (isRecord(data.usage)) {
        captureUsageFromRecord(data.usage);
      }

      const choices = data.choices;
      if (!Array.isArray(choices) || choices.length === 0) return parts;

      const first = choices[0];
      if (!isRecord(first)) return parts;

      const delta = first.delta;
      if (isRecord(delta)) {
        // Reasoning content (DeepSeek / MiMo style)
        const reasoningContent = delta.reasoning_content;
        if (typeof reasoningContent === "string" && reasoningContent.length > 0) {
          reasoningChars += reasoningContent.length;
          debugReasoning(reasoningContent);
        }

        // Accumulate tool calls — do NOT emit yet (arguments arrive incrementally).
        collectToolCallsDelta(delta.tool_calls);

        // Text content
        const content = delta.content;
        if (typeof content === "string" && content.length > 0) {
          const { visible, thinking } = thinkFilter ? thinkFilter.process(content) : { visible: content, thinking: "" };
          if (thinking) {
            reasoningChars += thinking.length;
            debugReasoning(thinking);
          }
          if (visible) {
            emittedText += visible.length;
            if (xmlParser) {
              const fed = xmlParser.feed(visible);
              for (const part of fed.parts) parts.push(part);
            } else {
              parts.push(new vscode.LanguageModelTextPart(visible));
            }
          }
        }
      }

      // Flush complete tool calls ONLY when finish_reason signals they are done.
      // (Usage for this chunk was already captured above the choices guard.)
      const finishReason = first.finish_reason;
      if (typeof finishReason === "string") {
        if (finishReason === "tool_calls" || finishReason === "stop") {
          const toolParts = flushNativeToolCalls();
          emittedTools += toolParts.length;
          parts.push(...toolParts);
        }
      }

      return parts;
    },
    extractFullParts: (data: unknown) => {
      const parts: vscode.LanguageModelResponsePart[] = [];
      if (!isRecord(data)) return parts;

      const choices = data.choices;
      if (!Array.isArray(choices) || choices.length === 0) return parts;

      const message = choices[0]?.message;
      if (!isRecord(message)) return parts;

      // Non-streaming path: tool_calls are complete on the message object.
      const msgToolCalls = message.tool_calls;
      if (Array.isArray(msgToolCalls)) {
        for (let i = 0; i < msgToolCalls.length; i++) {
          const tc = msgToolCalls[i];
          if (!isRecord(tc)) continue;
          const fn = tc.function;
          if (!isRecord(fn)) continue;
          const fnName = typeof fn.name === "string" ? fn.name : "";
          if (!fnName) continue;
          const fnArgs = typeof fn.arguments === "string" ? fn.arguments : "";
          let input: Record<string, unknown> = {};
          if (fnArgs) {
            try { input = JSON.parse(fnArgs) as Record<string, unknown>; }
            catch { /* ignore */ }
          }
          const callId = typeof tc.id === "string" ? tc.id : `cline-copilot-chat-full-${Date.now()}-${i}`;
          emittedTools++;
          parts.push(new vscode.LanguageModelToolCallPart(callId, fnName, input));
        }
      }

      const content = message.content;
      if (typeof content === "string" && content.length > 0) {
        const { visible, thinking } = thinkFilter ? thinkFilter.process(content) : { visible: content, thinking: "" };
        if (thinking) {
          reasoningChars += thinking.length;
          debugReasoning(thinking);
        }
        if (visible) {
          emittedText += visible.length;
          if (xmlParser) {
            const fed = xmlParser.feed(visible);
            for (const part of fed.parts) parts.push(part);
          } else {
            parts.push(new vscode.LanguageModelTextPart(visible));
          }
        }
      }

      if (isRecord(data.usage)) {
        captureUsageFromRecord(data.usage);
      }

      return parts;
    },
  });

  // Flush any remaining buffered text / incomplete tool tags from the XML parser.
  if (xmlParser) {
    const flushed = xmlParser.flush();
    for (const part of flushed.parts) {
      options.progress.report(part);
    }
  }

  // Flush any remaining carry from the think-tag filter. If the stream ended
  // inside an unclosed `<think>`, that content is treated as thinking (not
  // emitted to chat). Otherwise the remaining carry is visible text.
  if (thinkFilter) {
    const { visible, thinking } = thinkFilter.finish();
    if (thinking) {
      reasoningChars += thinking.length;
      debugReasoning(thinking);
    }
    if (visible) {
      emittedText += visible.length;
      options.progress.report(new vscode.LanguageModelTextPart(visible));
    }
  }

  // Flush any accumulated tool calls that didn't get a finish_reason delta
  // (some providers send finish_reason only once then close the stream).
  const remainingTools = flushNativeToolCalls();
  for (const part of remainingTools) {
    emittedTools++;
    options.progress.report(part);
  }

  // Report captured usage to VS Code so the Copilot Chat Context Window
  // widget and Session Info update (Issue #4). Success path only — a thrown
  // stream error skips this, matching opencode-copilot-chat's behavior.
  emitUsageDataPart();

  options.output?.appendLine(
    `[stream-summary model=${options.modelId}] textChars=${emittedText} toolCalls=${emittedTools} reasoningChars=${reasoningChars}`,
  );
  if (emittedText === 0 && emittedTools === 0) {
    options.output?.appendLine(
      `[warn] empty response from model=${options.modelId} (no text, no tool calls). Try a different model.`,
    );
    options.output?.show(true);
  }
}

interface StreamChatResponseOptions extends StreamRequestOptions {
  extractStreamParts: (data: unknown) => vscode.LanguageModelResponsePart[];
  extractFullParts: (data: unknown) => vscode.LanguageModelResponsePart[];
}

const MAX_HTTP_RETRIES = 3;

async function streamChatResponse(
  options: StreamChatResponseOptions,
): Promise<void> {
  const controller = new AbortController();
  // requestTimeoutMs and streamIdleTimeoutMs are already in milliseconds — no * 1000.
  const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);

  let idleTimeout: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => controller.abort(), options.streamIdleTimeoutMs);
  };
  resetIdleTimer();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${options.apiKey}`,
    ...options.requestHeaders,
  };

  const startTime = Date.now();
  let ttfbMs: number | undefined;
  let totalBytes = 0;
  let totalEvents = 0;
  let lastStatus: number | undefined;
  let lastContentType: string | undefined;

  let response: Response;
  try {
    // Retry loop for transient failures: network errors + HTTP 429/5xx/transient-400.
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(options.url, {
          method: "POST",
          headers,
          body: JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch (err) {
        // Network error — retry if budget remains (AbortError = timeout, not retryable here).
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort || attempt >= MAX_HTTP_RETRIES) throw err;
        const delay = retryDelayMs(attempt);
        options.output?.appendLine(
          `[retry] network error attempt=${attempt + 1}/${MAX_HTTP_RETRIES + 1} delay=${delay}ms model=${options.modelId}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // HTTP-level retry for transient status codes.
      if (!response.ok && attempt < MAX_HTTP_RETRIES) {
        const body = await response.text().catch(() => "");
        if (shouldRetryHttp(response.status, body)) {
          // Honor Retry-After header (mainly for 429).
          const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
          const delay = retryAfterMs ?? retryDelayMs(attempt);
          options.output?.appendLine(
            `[retry] HTTP ${response.status} attempt=${attempt + 1}/${MAX_HTTP_RETRIES + 1} delay=${delay}ms model=${options.modelId}`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      break; // success or non-retryable — exit loop.
    }

    lastStatus = response.status;
    lastContentType = response.headers.get("content-type") ?? undefined;

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      options.output?.appendLine(
        `[http-error] status=${response.status} url=${options.url} model=${options.modelId} body=${truncateForLog(body)}`,
      );
      throw buildClineCopilotChatRequestError(response.status, body);
    }

    if (!response.body) {
      throw new Error("No response body for streaming.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Register cancellation listener ONCE outside the loop to prevent listener leak.
    // Each onCancellationRequested call returns a Disposable that must be disposed.
    let cancelDisposable: vscode.Disposable | undefined;
    const cancelPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
      cancelDisposable = options.token.onCancellationRequested(() =>
        resolve({ done: true, value: undefined }),
      );
    });

    try {
      while (true) {
        if (options.token.isCancellationRequested) break;

        const { done, value } = await Promise.race([
          reader.read(),
          cancelPromise,
        ]);

        if (done) break;

        if (!ttfbMs) ttfbMs = Date.now() - startTime;
        resetIdleTimer();

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        totalBytes += chunk.length;

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            totalEvents++;
            const parts = options.extractStreamParts(parsed);
            for (const part of parts) {
              options.progress.report(part);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim() && !buffer.trim().startsWith("data: [DONE]")) {
        try {
          const data = buffer.trim().replace(/^data:\s*/, "");
          if (data && data !== "[DONE]") {
            const parsed = JSON.parse(data);
            totalEvents++;
            const parts = options.extractStreamParts(parsed);
            for (const part of parts) {
              options.progress.report(part);
            }
          }
        } catch {
          // Skip
        }
      }
    } finally {
      reader.releaseLock();
      // Dispose the single cancellation listener to prevent memory leak.
      cancelDisposable?.dispose();
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    options.output?.appendLine(
      `[error] model=${options.modelId} status=${lastStatus} duration=${formatDuration(durationMs)} bytes=${totalBytes} events=${totalEvents} message=${message}`,
    );
    throw error;
  } finally {
    clearTimeout(timeout);
    if (idleTimeout) clearTimeout(idleTimeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
