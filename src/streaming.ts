/**
 * Cline Copilot Chat streaming — handles OpenAI-compatible SSE chat completions.
 */

import * as vscode from "vscode";
import {
  buildClineCopilotChatRequestError,
  formatDuration,
  truncateForLog,
} from "./errors";
import { XmlToolStreamParser } from "./toolParsing";

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
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

function createThinkTagFilter(
  stripMode: "never" | "auto" | "always" | undefined,
  modelId: string,
): (text: string) => { cleaned: string; extractedReasoning: string } {
  const shouldStrip =
    stripMode === "always" ||
    (stripMode === "auto" && /^minimax-/i.test(modelId));

  if (!shouldStrip) {
    return (text) => ({ cleaned: text, extractedReasoning: "" });
  }

  return (text: string) => {
    const tagRegex = /<think>([\s\S]*?)<\/think>/gi;
    let extractedReasoning = "";
    const cleaned = text.replace(tagRegex, (_match, reasoning: string) => {
      extractedReasoning += reasoning;
      return "";
    });
    return { cleaned, extractedReasoning };
  };
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
  const thinkFilter = createThinkTagFilter(options.stripThinkTags, options.modelId);
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

  await streamOpenCodeResponse({
    ...options,
    extractStreamParts: (data: unknown) => {
      const parts: vscode.LanguageModelResponsePart[] = [];
      if (!isRecord(data)) return parts;

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
          const { cleaned, extractedReasoning } = thinkFilter(content);
          if (extractedReasoning) {
            reasoningChars += extractedReasoning.length;
            debugReasoning(extractedReasoning);
          }
          if (cleaned) {
            emittedText += cleaned.length;
            if (xmlParser) {
              const fed = xmlParser.feed(cleaned);
              for (const part of fed.parts) parts.push(part);
            } else {
              parts.push(new vscode.LanguageModelTextPart(cleaned));
            }
          }
        }
      }

      // Flush complete tool calls ONLY when finish_reason signals they are done.
      const finishReason = first.finish_reason;
      if (typeof finishReason === "string") {
        if (finishReason === "tool_calls" || finishReason === "stop") {
          const toolParts = flushNativeToolCalls();
          emittedTools += toolParts.length;
          parts.push(...toolParts);
        }

        // Emit usage data when available
        if (isRecord(data.usage)) {
          const usage = data.usage;
          parts.push(createUsageDataPart(
            typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
            typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
            typeof usage.cached_tokens === "number" ? usage.cached_tokens : undefined,
          ));
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
        const { cleaned } = thinkFilter(content);
        if (cleaned) {
          emittedText += cleaned.length;
          if (xmlParser) {
            const fed = xmlParser.feed(cleaned);
            for (const part of fed.parts) parts.push(part);
          } else {
            parts.push(new vscode.LanguageModelTextPart(cleaned));
          }
        }
      }

      if (isRecord(data.usage)) {
        const usage = data.usage;
        parts.push(createUsageDataPart(
          typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
          typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
          typeof usage.cached_tokens === "number" ? usage.cached_tokens : undefined,
        ));
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

  // Flush any accumulated tool calls that didn't get a finish_reason delta
  // (some providers send finish_reason only once then close the stream).
  const remainingTools = flushNativeToolCalls();
  for (const part of remainingTools) {
    emittedTools++;
    options.progress.report(part);
  }

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

interface StreamOpenCodeResponseOptions extends StreamRequestOptions {
  extractStreamParts: (data: unknown) => vscode.LanguageModelResponsePart[];
  extractFullParts: (data: unknown) => vscode.LanguageModelResponsePart[];
}

async function streamOpenCodeResponse(
  options: StreamOpenCodeResponseOptions,
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

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

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

    try {
      while (true) {
        if (options.token.isCancellationRequested) break;

        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined }>((resolve) => {
            const onAbort = () => resolve({ done: true, value: undefined });
            options.token.onCancellationRequested(onAbort);
          }),
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

function createUsageDataPart(
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): vscode.LanguageModelResponsePart {
  const usage: Record<string, unknown> = {};
  if (promptTokens !== undefined) usage.inputTokens = promptTokens;
  if (completionTokens !== undefined) usage.outputTokens = completionTokens;
  if (cachedTokens !== undefined) usage.cachedTokens = cachedTokens;

  // Use internal data part for usage reporting
  return new vscode.LanguageModelTextPart("") as unknown as vscode.LanguageModelResponsePart;
}
