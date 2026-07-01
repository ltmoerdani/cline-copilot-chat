/**
 * XML tool-call parser for open-weight models that don't emit native
 * `tool_calls` deltas (DeepSeek V4 Flash, MiMo, MiniMax, Qwen, etc).
 *
 * These models, when prompted with tool definitions, often hallucinate tool
 * invocations as XML-like tags inside the `content` text stream:
 *
 *   I'll read the file first.
 *   <read_file>
 *     <file>/path/to/file.ts</file>
 *   </read_file>
 *
 * Or sometimes with attributes / self-closing variants:
 *   <read_file file="/path/to/file.ts" />
 *
 * This module converts those tags into `vscode.LanguageModelToolCallPart`
 * so Copilot Chat agent mode works with non-tool-calling models, the same
 * way OpenCode routes these models.
 *
 * Design:
 *   - `XmlToolStreamParser` is stateful — feed it text chunks via `feed()`.
 *   - It buffers everything after a potential open tag and only emits text
 *     that is definitely outside any tool tag.
 *   - When the matching close tag arrives, it parses the inner content and
 *     produces a `LanguageModelToolCallPart`.
 *   - Text outside tags is returned as `LanguageModelTextPart`.
 *
 * Supported parameter shapes (best-effort, multi-format):
 *   1. Child tags:      <read_file><file>x</file></read_file>
 *   2. Attributes:      <read_file file="x"></read_file>
 *   3. Self-closing:    <read_file file="x" />
 *   4. JSON body:       <read_file>{"file":"x"}</read_file>
 *   5. Plain text body: <read_file>x</read_file>  (mapped to first schema prop)
 */

import * as vscode from "vscode";

export interface ParsedToolTag {
  /** Matching tool name (one of the names in `toolNames`). */
  name: string;
  /** Parsed input object — shape matches best-effort extraction. */
  input: Record<string, unknown>;
  /** Raw inner text of the tag (for debugging / fallback). */
  rawInner: string;
}

/**
 * Result of feeding a text chunk. Either flushed text parts to emit, or
 * tool call parts, or both (text may precede a tool call in the same chunk).
 */
export interface FeedResult {
  parts: vscode.LanguageModelResponsePart[];
}

export interface XmlToolStreamParserOptions {
  /**
   * Set of known tool names. Only tags matching these names are parsed as
   * tool calls; other XML-like tags (e.g. `<think>`) are left untouched.
   */
  toolNames: ReadonlySet<string>;
  /**
   * Optional mapping from tool name → first/primary parameter name.
   * Used when the model emits plain text body and we need to guess which
   * property it maps to. Defaults to the first property of the schema, or
   * a heuristic ("query", "file", "path", "command", "input").
   */
  primaryParamByTool?: Record<string, string>;
  /** Optional logger for debug diagnostics. */
  debug?: (message: string) => void;
}

/**
 * Heuristic: the parameter name most likely to hold a bare string body.
 * Ordered by frequency across common coding tools.
 */
const PRIMARY_PARAM_FALLBACKS = [
  "query",
  "file",
  "path",
  "command",
  "pattern",
  "input",
  "text",
  "value",
  "content",
];

export class XmlToolStreamParser {
  private readonly toolNames: ReadonlySet<string>;
  private readonly primaryParamByTool: Record<string, string>;
  private readonly debug: (message: string) => void;

  /**
   * Pending buffer. Holds text that hasn't been flushed yet because it might
   * be the start of a tool tag. We flush text up to the last `<` immediately,
   * and keep the tail buffered until we can decide if it's a tool tag.
   */
  private pending = "";

  /**
   * When we're inside a tool tag, this holds the tool name and the
   * accumulated inner text.
   */
  private insideTool: { name: string; inner: string } | null = null;

  /** Counter to generate unique call IDs. */
  private callCounter = 0;

  constructor(options: XmlToolStreamParserOptions) {
    this.toolNames = options.toolNames;
    this.primaryParamByTool = options.primaryParamByTool ?? {};
    this.debug = options.debug ?? (() => {});
  }

  /**
   * Feed a text chunk. Returns parts to emit immediately.
   * Text outside tool tags → `LanguageModelTextPart`.
   * Completed tool tags → `LanguageModelToolCallPart`.
   */
  feed(chunk: string): FeedResult {
    const parts: vscode.LanguageModelResponsePart[] = [];

    if (this.insideTool) {
      // We're inside a tool tag — accumulate until close tag.
      this.insideTool.inner += chunk;
      this.flushInsideTool(parts);
      return { parts };
    }

    // Not inside a tool tag. Append to pending and try to flush safe text.
    this.pending += chunk;
    this.flushPending(parts);
    return { parts };
  }

  /**
   * Flush any remaining buffered content. Call this when the stream ends
   * to emit trailing text or an incomplete tool tag as text.
   */
  flush(): FeedResult {
    const parts: vscode.LanguageModelResponsePart[] = [];

    if (this.insideTool) {
      // Stream ended inside a tool tag — treat as text (incomplete tool call).
      this.debug(
        `[tool-parser] stream ended inside <${this.insideTool.name}> — emitting as text`,
      );
      parts.push(
        new vscode.LanguageModelTextPart(
          `<${this.insideTool.name}>${this.insideTool.inner}`,
        ),
      );
      this.insideTool = null;
      this.pending = "";
      return { parts };
    }

    if (this.pending) {
      parts.push(new vscode.LanguageModelTextPart(this.pending));
      this.pending = "";
    }
    return { parts };
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private flushInsideTool(parts: vscode.LanguageModelResponsePart[]): void {
    const inner = this.insideTool!.inner;
    const name = this.insideTool!.name;
    const closeTag = `</${name}>`;

    const closeIdx = inner.indexOf(closeTag);
    if (closeIdx === -1) {
      // Close tag not yet arrived — keep buffering. But if the buffer is
      // getting huge (> 64KB) without a close tag, assume it's not a tool
      // call and flush as text to avoid memory bloat.
      if (inner.length > 65_536) {
        this.debug(
          `[tool-parser] <${name}> exceeded 64KB without close tag — flushing as text`,
        );
        parts.push(
          new vscode.LanguageModelTextPart(`<${name}>${inner}`),
        );
        this.insideTool = null;
      }
      return;
    }

    // Found close tag. Extract inner content and emit tool call.
    const innerContent = inner.slice(0, closeIdx);
    const afterClose = inner.slice(closeIdx + closeTag.length);

    const parsed = this.parseToolInput(name, innerContent);
    const callId = `cline-copilot-chat-${Date.now()}-${this.callCounter++}`;
    parts.push(new vscode.LanguageModelToolCallPart(callId, name, parsed.input));

    this.debug(
      `[tool-parser] emitted tool call: ${name} callId=${callId} rawInner=${innerContent.slice(0, 100)}${innerContent.length > 100 ? "…" : ""}`,
    );

    this.insideTool = null;

    // Anything after the close tag is new pending text — recurse to handle
    // possible chained tool tags or text.
    if (afterClose) {
      this.pending += afterClose;
      this.flushPending(parts);
    }
  }

  private flushPending(parts: vscode.LanguageModelResponsePart[]): void {
    // Look for the earliest position where a known tool tag starts.
    // We scan for `<toolname>` or `<toolname ` or `<toolname/>` or `<toolname>`.
    while (this.pending) {
      const openLt = this.pending.indexOf("<");
      if (openLt === -1) {
        // No `<` at all — safe to flush everything.
        parts.push(new vscode.LanguageModelTextPart(this.pending));
        this.pending = "";
        break;
      }

      if (openLt > 0) {
        // Flush text before the `<`.
        parts.push(new vscode.LanguageModelTextPart(this.pending.slice(0, openLt)));
        this.pending = this.pending.slice(openLt);
      }

      // Now `this.pending` starts with `<`. Try to parse a tag name.
      const tagMatch = this.tryMatchToolOpen(this.pending);
      if (!tagMatch) {
        // Not a tool tag. Could be:
        //  (a) another XML tag like `<think>` — flush the `<` and continue.
        //  (b) an incomplete tool tag name (stream not fully arrived) — hold.
        if (this.isPotentialIncompleteToolTag(this.pending)) {
          // Hold buffering — wait for more chunks.
          break;
        }
        // Flush the `<` as text and continue scanning after it.
        parts.push(new vscode.LanguageModelTextPart("<"));
        this.pending = this.pending.slice(1);
        continue;
      }

      // It's a tool open tag. Check if self-closing.
      if (tagMatch.selfClosing) {
        // Self-closing tool tag — emit immediately with attribute params.
        const parsed = this.parseToolInput(
          tagMatch.name,
          "",
          tagMatch.attributes,
        );
        const callId = `cline-copilot-chat-${Date.now()}-${this.callCounter++}`;
        parts.push(
          new vscode.LanguageModelToolCallPart(callId, tagMatch.name, parsed.input),
        );
        this.debug(
          `[tool-parser] emitted self-closing tool call: ${tagMatch.name} callId=${callId} attrs=${JSON.stringify(tagMatch.attributes)}`,
        );
        this.pending = this.pending.slice(tagMatch.endIndex);
        continue;
      }

      // Non-self-closing tool tag — enter "inside tool" mode.
      this.insideTool = {
        name: tagMatch.name,
        inner: tagMatch.afterOpenTag,
      };
      this.pending = "";
      // The inner content may already contain the close tag (arrived in same chunk).
      this.flushInsideTool(parts);
      return;
    }
  }

  /**
   * Try to match a tool open tag at the start of `text`.
   * Returns null if no match (either not a tool tag, or incomplete).
   */
  private tryMatchToolOpen(
    text: string,
  ): {
    name: string;
    selfClosing: boolean;
    attributes: Record<string, string>;
    endIndex: number;
    afterOpenTag: string;
  } | null {
    // Match: <name ...> or <name ... /> or <name>
    // Name must be one of known tool names.
    const match = /^<([a-zA-Z_][a-zA-Z0-9_]*)\b([^>]*?)\s*(\/?)>([\s\S]*)$/.exec(
      text,
    );
    if (!match) return null;

    const [, name, attrStr, selfClose, afterOpenTag] = match;
    if (!this.toolNames.has(name)) return null;

    return {
      name,
      selfClosing: selfClose === "/",
      attributes: parseAttributes(attrStr),
      endIndex: match[0].length - afterOpenTag.length,
      afterOpenTag,
    };
  }

  /**
   * Heuristic: does `text` look like the start of a tool tag that hasn't
   * fully arrived yet? E.g. `<read` could become `<read_file>` or `<readme>`.
   * If so, hold buffering until more data arrives.
   */
  private isPotentialIncompleteToolTag(text: string): boolean {
    // Must start with `<`.
    if (!text.startsWith("<")) return false;

    // Extract the partial name (letters/digits/underscore after `<`).
    const nameMatch = /^<([a-zA-Z0-9_]*)$/.exec(text);
    if (!nameMatch) {
      // Could be `<name` followed by space/attrs but no `>` yet.
      const partialMatch = /^<([a-zA-Z_][a-zA-Z0-9_]*)\b([\s\S]*)$/.exec(text);
      if (!partialMatch) return false;
      const [, name] = partialMatch;
      // If the name itself isn't a prefix of any known tool, don't hold.
      return this.isPrefixOfToolName(name);
    }

    const partial = nameMatch[1];
    return this.isPrefixOfToolName(partial);
  }

  private isPrefixOfToolName(prefix: string): boolean {
    if (!prefix) return false;
    for (const toolName of this.toolNames) {
      if (toolName.startsWith(prefix)) return true;
    }
    return false;
  }

  /**
   * Parse the inner content of a tool tag into an input object.
   * Tries multiple strategies in order:
   *   1. If attributes were provided on the open tag, use those.
   *   2. Try JSON.parse on the inner content.
   *   3. Try child tags: <param>value</param>.
   *   4. Fallback: map entire body to the tool's primary param.
   */
  private parseToolInput(
    name: string,
    inner: string,
    attributes?: Record<string, string>,
  ): ParsedToolTag {
    const trimmed = inner.trim();

    // 1. Attributes from open tag.
    if (attributes && Object.keys(attributes).length > 0) {
      this.debug(`[tool-parser] ${name}: using attributes`);
      return { name, input: { ...attributes }, rawInner: inner };
    }

    // 2. JSON body.
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          this.debug(`[tool-parser] ${name}: parsed JSON body`);
          return {
            name,
            input: parsed as Record<string, unknown>,
            rawInner: inner,
          };
        }
      } catch {
        // not valid JSON — fall through
      }
    }

    // 3. Child tags: <param>value</param>.
    const childParams = parseChildTags(trimmed);
    if (childParams && Object.keys(childParams).length > 0) {
      this.debug(`[tool-parser] ${name}: parsed child tags`);
      return { name, input: childParams, rawInner: inner };
    }

    // 4. Fallback: bare text body → primary param.
    if (trimmed) {
      const primary =
        this.primaryParamByTool[name] ?? PRIMARY_PARAM_FALLBACKS[0];
      this.debug(`[tool-parser] ${name}: bare body → ${primary}`);
      return { name, input: { [primary]: trimmed }, rawInner: inner };
    }

    // Empty body.
    return { name, input: {}, rawInner: inner };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse XML-like attributes from a tag's attribute string.
 * Handles: `key="value"`, `key='value'`, `key=value`, `key` (boolean).
 */
export function parseAttributes(attrStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!attrStr) return result;

  // Match key="value" | key='value' | key=value | key (boolean)
  const attrRegex = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRegex.exec(attrStr)) !== null) {
    const key = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "true";
    result[key] = value;
  }
  return result;
}

/**
 * Parse child tags from inner content: `<param>value</param>`.
 * Only matches simple flat child tags (no nesting).
 * Returns null if no child tags found.
 */
export function parseChildTags(
  inner: string,
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const childRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = childRegex.exec(inner)) !== null) {
    matched = true;
    const [, key, value] = m;
    const trimmedValue = value.trim();

    // Try to parse value as JSON (for numbers, booleans, arrays).
    const parsed = tryParseJson(trimmedValue);
    result[key] = parsed ?? trimmedValue;
  }

  // Also match self-closing child tags: <param />
  const selfClosingRegex = /<([a-zA-Z_][a-zA-Z0-9_]*)\s*\/>/g;
  while ((m = selfClosingRegex.exec(inner)) !== null) {
    matched = true;
    const [, key] = m;
    if (!(key in result)) {
      result[key] = true;
    }
  }

  return matched ? result : null;
}

function tryParseJson(value: string): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
