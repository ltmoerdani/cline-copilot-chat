/**
 * Cline Copilot Chat — Extension entry point.
 *
 * Supercharges VS Code Copilot Chat with 10 frontier open-weight models
 * (DeepSeek V4, Qwen 3.7, MiMo V2.5, Kimi K2.7, GLM 5.2, MiniMax M3)
 * plus any future Cline-native model on the same endpoint.
 *
 * Strategy: a single vendor (`cline-copilot-chat`) backed by a unified API
 * base (`https://api.cline.bot/api/v1`). Models are addressed as
 * `cline/<model>` — this keeps the extension forward-compatible with
 * future models without needing a new vendor registration.
 */

import * as vscode from "vscode";
import { CLINE_COPILOT_CHAT_VENDOR, type AllProviderVendor } from "./providerTypes";
import { resolveModelMetadata, type ResolvedModelMetadata } from "./metadata";
import { buildThinkingPayload, buildModelConfigurationSchema, getSettings, type ThinkingSettings } from "./thinking";
import { streamChatCompletions, type TransportRequestSummary } from "./streaming";

// Extended options types that include the BYOK configuration property.
// VS Code supplies this when the provider declares a configuration schema in package.json.
interface ConfiguredInfoOptions extends vscode.PrepareLanguageModelChatModelOptions {
  configuration?: { apiKey?: string };
}
interface ConfiguredResponseOptions extends vscode.ProvideLanguageModelChatResponseOptions {
  configuration?: { apiKey?: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

const SECRET_KEY = "clineCopilotChat.apiKey";
/** Legacy secret key from pre-rebrand versions. We still read from this so
 * existing users don't have to re-enter their API key after upgrading. */
const LEGACY_SECRET_KEY = "clinepass.apiKey";
const BASE_URL = "https://api.cline.bot/api/v1";

/** Resolve the API key from secret storage, checking legacy key first for
 * backward compatibility with pre-rebrand installs. If a legacy key exists,
 * it is migrated to the new key and deleted from the legacy slot. */
async function resolveStoredApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const current = await secrets.get(SECRET_KEY);
  if (current) return current;
  const legacy = await secrets.get(LEGACY_SECRET_KEY);
  if (legacy) {
    // Migrate legacy key to the new slot, then delete the legacy entry.
    await secrets.store(SECRET_KEY, legacy);
    await secrets.delete(LEGACY_SECRET_KEY);
    return legacy;
  }
  return undefined;
}

const CLINE_COPILOT_CHAT_MODELS = [
  { id: "cline-pass/glm-5.2",             name: "GLM 5.2",              family: "Z.ai" },
  { id: "cline-pass/kimi-k2.7-code",      name: "Kimi K2.7 Code",       family: "Moonshot AI" },
  { id: "cline-pass/kimi-k2.6",           name: "Kimi K2.6",            family: "Moonshot AI" },
  { id: "cline-pass/deepseek-v4-pro",     name: "DeepSeek V4 Pro",      family: "DeepSeek" },
  { id: "cline-pass/deepseek-v4-flash",   name: "DeepSeek V4 Flash",    family: "DeepSeek" },
  { id: "cline-pass/mimo-v2.5",           name: "MiMo V2.5",            family: "MiMo" },
  { id: "cline-pass/mimo-v2.5-pro",       name: "MiMo V2.5 Pro",        family: "MiMo" },
  { id: "cline-pass/minimax-m3",          name: "MiniMax M3",           family: "MiniMax" },
  { id: "cline-pass/qwen3.7-max",         name: "Qwen3.7 Max",          family: "Qwen" },
  { id: "cline-pass/qwen3.7-plus",        name: "Qwen3.7 Plus",         family: "Qwen" },
];

interface ClineCopilotChatModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
}

// ── Provider ───────────────────────────────────────────────────────────────

class ClineCopilotChatProvider implements vscode.LanguageModelChatProvider<ClineCopilotChatModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly apiKeysByModelId = new Map<string, string>();
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private getOutputChannel(): vscode.OutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel("Cline Copilot Chat");
      this.context.subscriptions.push(this.outputChannel);
    }
    return this.outputChannel;
  }

  private log(message: string): void {
    this.getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  // ── LanguageModelChatProvider ──────────────────────────────────────────

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    token: vscode.CancellationToken,
  ): Promise<ClineCopilotChatModel[]> {
    const opts = options as ConfiguredInfoOptions;
    this.log(`[ClineCopilotChat] provideLanguageModelChatInformation CALLED, configuration=${JSON.stringify(opts.configuration ?? null)}`);

    // API key resolution strategy (mirrors opencode-copilot-chat pattern):
    //
    //   1. Try BYOK config first (VS Code supplies apiKey via configuration schema).
    //
    //   2. Fall back to secret storage ONLY when VS Code provided a configuration
    //      object (truthy — includes empty {} from VS Code 1.126+).
    //      • configuration=undefined → VS Code still resolving; return []
    //        and let VS Code call again with the real BYOK key.
    //      • configuration={apiKey:"sk-..."} → BYOK key resolved in step 1.
    //      • configuration={} → VS Code sent empty config; fall back to secrets.
    //
    //   3. Persist key to secret storage so it survives extension restarts
    //      and can be inherited by future agent-variant providers.
    //
    //   4. Delete flow: gear → Delete → removes BYOK entry + secret →
    //      configuration=undefined → returns [] → group disappears ✓
    let apiKey = opts.configuration?.apiKey;

    // Step 2: fall back to secret storage when configuration object is present
    if (!apiKey && opts.configuration) {
      apiKey = await resolveStoredApiKey(this.context.secrets);
    }

    // Step 3: persist any resolved key
    if (apiKey) {
      const existing = await this.context.secrets.get(SECRET_KEY);
      if (existing !== apiKey) {
        await this.context.secrets.store(SECRET_KEY, apiKey);
      }
    }

    if (token.isCancellationRequested) return [];

    if (!apiKey) {
      this.log("[ClineCopilotChat] No API key — returning empty model list.");
      return [];
    }

    return CLINE_COPILOT_CHAT_MODELS.map((model) => {
      const metadata = resolveModelMetadata(model.id);
      const effectiveId = `${CLINE_COPILOT_CHAT_VENDOR}:${model.id}`;
      if (apiKey) {
        this.apiKeysByModelId.set(model.id, apiKey);
        this.apiKeysByModelId.set(effectiveId, apiKey);
      }

      // Always include apiKey + optional thinking schema so the model settings
      // panel in VS Code's language model picker shows both fields.
      const configurationSchema = buildModelConfigurationSchema(model.id);

      return {
        id: effectiveId,
        rawModelId: model.id,
        name: `Cline / ${model.name}`,
        family: `${model.family}`,
        version: `1.0.0`,
        maxInputTokens: metadata.contextWindow,
        maxOutputTokens: metadata.maxOutputTokens,
        capabilities: {
          imageInput: metadata.supportsVision,
          toolCalling: true,
        },
        configurationSchema,
      };
    });
  }

  async provideLanguageModelChatResponse(
    model: ClineCopilotChatModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // Resolve API key: BYOK → in-memory cache → secret storage.
    // We look up by multiple keys because VS Code may pass a `model` object
    // whose `id` differs slightly from what we registered (e.g. vendor prefix
    // variants across Copilot versions). Falling back to `rawModelId` (which
    // is stable across reloads) prevents spurious "API key required" errors.
    const opts = options as ConfiguredResponseOptions;
    let apiKeySource = "none";
    let apiKey = opts.configuration?.apiKey;
    if (apiKey) {
      apiKeySource = "byok";
      // Persist BYOK key to secret storage so it survives extension restarts
      // even if VS Code clears its own BYOK storage (e.g. after an update).
      void this.context.secrets.get(SECRET_KEY).then((existing) => {
        if (existing !== apiKey) {
          void this.context.secrets.store(SECRET_KEY, apiKey!);
        }
      });
      // Re-hydrate the in-memory cache for subsequent requests this session.
      this.apiKeysByModelId.set(model.id, apiKey);
      this.apiKeysByModelId.set(model.rawModelId, apiKey);
    }
    if (!apiKey) {
      apiKey =
        this.apiKeysByModelId.get(model.id) ??
        this.apiKeysByModelId.get(model.rawModelId) ??
        this.apiKeysByModelId.get(`${CLINE_COPILOT_CHAT_VENDOR}:${model.rawModelId}`) ??
        this.apiKeysByModelId.get("__prewarm__");
      if (apiKey) apiKeySource = "cache";
    }
    if (!apiKey) {
      apiKey = await resolveStoredApiKey(this.context.secrets);
      if (apiKey) {
        apiKeySource = "secret-storage";
        // Re-hydrate the cache so subsequent requests don't hit storage again.
        this.apiKeysByModelId.set(model.id, apiKey);
        this.apiKeysByModelId.set(model.rawModelId, apiKey);
      }
    }

    this.log(`Key resolution: source=${apiKeySource} model.id=${model.id} rawModelId=${model.rawModelId}`);

    if (!apiKey) {
      // Offer the user a quick way to set the key instead of just erroring.
      void vscode.window.showErrorMessage(
        "Cline Copilot Chat: API key not found. Re-enter it to continue.",
        "Set API Key",
      ).then((choice) => {
        if (choice === "Set API Key") {
          void this.setApiKey();
        }
      });
      throw new Error(
        "Cline Copilot Chat API key required. Run 'Cline Copilot Chat: Set API Key' from the Command Palette, or re-enter it in VS Code's language model settings.",
      );
    }

    // Defensive: VS Code may not preserve custom properties on the model object
    // passed back to this method. Derive rawModelId from model.id if missing.
    const rawModelId = model.rawModelId
      ?? model.id.replace(`${CLINE_COPILOT_CHAT_VENDOR}:`, "");
    const settings = getSettings();
    const metadata = resolveModelMetadata(rawModelId);

    // Convert messages to OpenAI-compatible API format.
    // Preserves tool call history so multi-turn agent flows work:
    //   - Assistant messages may contain LanguageModelToolCallPart
    //   - User messages may contain LanguageModelToolResultPart (tool results)
    const apiMessages = convertMessagesToApi(messages);

    // Build tool definitions from Copilot-provided tools.
    // These are sent to the model in OpenAI function-calling format so that
    // models which support native tool calls use them, and models that don't
    // at least see the schema in their context (helping XML fallback accuracy).
    const copilotTools = options.tools;
    const toolNames = new Set<string>();
    const apiTools: unknown[] = [];
    if (copilotTools && copilotTools.length > 0) {
      for (const tool of copilotTools) {
        toolNames.add(tool.name);
        apiTools.push({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema ?? { type: "object", properties: {} },
          },
        });
      }
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: rawModelId,
      messages: apiMessages,
      stream: true,
    };

    this.log(`Request body: model=${body.model} stream=${body.stream} messages=${apiMessages.length} url=${BASE_URL}/chat/completions`);

    // Attach tools when available. We always send them so the model knows the
    // available tool names + schemas — this dramatically improves the accuracy
    // of XML-style tool invocations from non-native-tool-calling models.
    if (apiTools.length > 0) {
      body.tools = apiTools;
      // Some providers reject `tool_choice` when they don't support tools
      // natively. We omit it and let the model decide. Native tool callers
      // will emit `tool_calls`; non-native ones will emit XML tags we parse.
    }

    if (settings.temperature > 0) {
      body.temperature = settings.temperature;
    }
    if (settings.maxTokens > 0) {
      body.max_tokens = settings.maxTokens;
    }

    // Add thinking payload
    const thinkingPayload = buildThinkingPayload(rawModelId, settings.thinking, false);
    if (thinkingPayload) {
      Object.assign(body, thinkingPayload);
    }

    this.log(
      `Request: model=${rawModelId} messages=${apiMessages.length} tools=${toolNames.size} thinking=${JSON.stringify(thinkingPayload ?? {})}`,
    );

    try {
      await streamChatCompletions({
        url: `${BASE_URL}/chat/completions`,
        providerDisplayName: "Cline Copilot Chat",
        apiKey,
        modelId: rawModelId,
        body,
        requestHeaders: {},
        progress,
        token,
        output: this.getOutputChannel(),
        debugReasoning: settings.debugReasoning,
        requestTimeoutMs: settings.requestTimeoutMs,
        streamIdleTimeoutMs: settings.streamIdleTimeoutMs,
        stripThinkTags: settings.stripThinkTags,
        // Enable XML tool-call parsing so non-native-tool-calling models still
        // work in Copilot Chat agent mode (OpenCode-style fallback).
        enableXmlToolParsing: toolNames.size > 0,
        toolNames,
      });
      this.log(`Response complete: model=${rawModelId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`ERROR model=${rawModelId}: ${message}`);
      throw error;
    }
  }

  provideTokenCount(
    _model: ClineCopilotChatModel,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Thenable<number> {
    const content = typeof text === "string" ? text : extractTextContent(text);
    return Promise.resolve(Math.ceil(content.length / 4));
  }

  // ── Commands ──────────────────────────────────────────────────────────

  async manage(): Promise<void> {
    const apiKey = await resolveStoredApiKey(this.context.secrets);

    if (!apiKey) {
      await this.setApiKey();
      return;
    }

    const choice = await vscode.window.showQuickPick(
      [
        { label: "Set API Key", action: "set" as const },
        { label: "Clear API Key", action: "clear" as const },
        { label: "Test Connection", action: "test" as const },
      ],
      { title: "Manage Cline Copilot Chat", placeHolder: "Choose an action" },
    );

    if (!choice) return;

    switch (choice.action) {
      case "set": await this.setApiKey(); break;
      case "clear":
        await this.context.secrets.delete(SECRET_KEY);
        this.changeEmitter.fire();
        vscode.window.showInformationMessage("Cline Copilot Chat API key cleared.");
        break;
      case "test": await this.testConnection(); break;
    }
  }

  async setApiKey(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      title: "Cline Copilot Chat API Key",
      prompt: "Paste your Cline API key (from app.cline.bot → Settings → API Keys). Unlocks 10 frontier models in Copilot Chat + Agent Mode.",
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiKey) return;

    await this.context.secrets.store(SECRET_KEY, apiKey.trim());
    this.changeEmitter.fire();
    vscode.window.showInformationMessage("Cline Copilot Chat API key saved.");
  }

  async testConnection(): Promise<void> {
    const apiKey = await resolveStoredApiKey(this.context.secrets);
    if (!apiKey) {
      vscode.window.showErrorMessage("Cline Copilot Chat: No API key set.");
      return;
    }

    const statusBar = vscode.window.setStatusBarMessage("$(loading~spin) Testing Cline Copilot Chat connection...");

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "cline-pass/deepseek-v4-flash",
          messages: [{ role: "user", content: "reply with just: ok" }],
          max_tokens: 10,
          stream: false,
        }),
      });

      statusBar.dispose();

      if (response.ok) {
        vscode.window.showInformationMessage(`Cline Copilot Chat: Connection OK (HTTP ${response.status}).`);
      } else {
        const body = await response.text();
        this.log(`Test failed (${response.status}): ${body}`);
        vscode.window.showErrorMessage(`Cline Copilot Chat: Connection failed (HTTP ${response.status}). Check Output.`);
        this.getOutputChannel().show(true);
      }
    } catch (error) {
      statusBar.dispose();
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Test error: ${message}`);
      vscode.window.showErrorMessage(`Cline Copilot Chat: Connection error — ${message}`);
    }
  }

  async showDiagnostics(): Promise<void> {
    const models = await vscode.lm.selectChatModels({ vendor: CLINE_COPILOT_CHAT_VENDOR });
    const lines = models.map((m) => {
      const raw = (m as unknown as { rawModelId?: string }).rawModelId ?? m.id;
      const meta = resolveModelMetadata(raw);
      return [
        `- ${raw}`,
        `  name: ${m.name}`,
        `  family: ${m.family}`,
        `  maxInputTokens: ${m.maxInputTokens}`,
        `  maxOutputTokens: ${meta.maxOutputTokens}`,
        `  reasoning: ${meta.reasoning}`,
      ].join("\n");
    });

    const content = [
      "# Cline Copilot Chat Diagnostics",
      "",
      `Models visible: ${models.length}`,
      "",
      ...lines,
    ].join("\n");

    const doc = await vscode.workspace.openTextDocument({ content, language: "markdown" });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract only the text portions of a message (for token counting + simple cases).
 */
function extractTextContent(msg: vscode.LanguageModelChatRequestMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
    .map((p) => p.value)
    .join("");
}

/**
 * Convert Copilot Chat messages to the OpenAI-compatible chat completions format.
 *
 * Handles three part types:
 *   - LanguageModelTextPart      → contributes to `content`
 *   - LanguageModelToolCallPart  → emitted as `tool_calls` on assistant messages
 *   - LanguageModelToolResultPart → emitted as a separate `{ role: "tool", tool_call_id, content }` message
 *
 * Tool result messages are injected after their parent user message. This keeps
 * the conversation valid for providers that validate tool message ordering.
 */
function convertMessagesToApi(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const isUser = msg.role === vscode.LanguageModelChatMessageRole.User;
    const role = isUser ? "user" : "assistant";

    // Normalize content to an array of parts.
    const parts: readonly vscode.LanguageModelInputPart[] =
      typeof msg.content === "string"
        ? [new vscode.LanguageModelTextPart(msg.content)]
        : (msg.content as readonly vscode.LanguageModelInputPart[]);

    const textParts: string[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    const toolResults: Array<Record<string, unknown>> = [];

    for (const part of parts) {
      if (part instanceof vscode.LanguageModelTextPart) {
        if (part.value) textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        // Assistant requested a tool call in a previous turn.
        toolCalls.push({
          id: part.callId,
          type: "function",
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        // User message carries tool results from a previous tool invocation.
        const resultText = part.content
          .map((c) => {
            if (c instanceof vscode.LanguageModelTextPart) return c.value;
            if (typeof c === "string") return c;
            try {
              return JSON.stringify(c);
            } catch {
              return String(c);
            }
          })
          .join("");
        toolResults.push({
          role: "tool",
          tool_call_id: part.callId,
          content: resultText,
        });
      }
    }

    const joinedText = textParts.join("");

    // User message that carries ONLY tool results (no text) — emit tool result
    // messages directly WITHOUT a wrapping empty user message. An empty
    // `{ role: "user", content: "" }` before tool messages is invalid in the
    // OpenAI API and causes models to return empty responses.
    if (isUser && !joinedText && toolResults.length > 0 && toolCalls.length === 0) {
      for (const tr of toolResults) {
        result.push(tr);
      }
      continue;
    }

    // Emit the primary message.
    const entry: Record<string, unknown> = { role };

    if (toolCalls.length > 0) {
      // OpenAI spec: assistant message with tool_calls must have content = null
      // (not ""). Sending content: "" causes some models to return empty responses.
      entry.content = joinedText || null;
      entry.tool_calls = toolCalls;
    } else {
      entry.content = joinedText;
    }

    result.push(entry);

    // Inject any tool results that co-exist with text in a user message.
    for (const tr of toolResults) {
      result.push(tr);
    }
  }

  return result;
}

// ── Activation ─────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Create output channel FIRST so we can debug
  const outputChannel = vscode.window.createOutputChannel("Cline Copilot Chat");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("[ClineCopilotChat] activate() START");
  outputChannel.appendLine(`[ClineCopilotChat] CLINE_COPILOT_CHAT_VENDOR = ${CLINE_COPILOT_CHAT_VENDOR}`);

  const provider = new ClineCopilotChatProvider(context);
  // Inject output channel into provider
  (provider as unknown as { outputChannel: vscode.OutputChannel }).outputChannel = outputChannel;

  // Pre-warm the in-memory API key cache from secret storage so that the very
  // first chat request (which may race ahead of `provideLanguageModelChatInformation`)
  // can resolve the key without prompting the user again.
  void resolveStoredApiKey(context.secrets).then((stored) => {
    if (stored) {
      (provider as unknown as { apiKeysByModelId: Map<string, string> }).apiKeysByModelId.set("__prewarm__", stored);
      outputChannel.appendLine("[ClineCopilotChat] API key pre-warmed from secret storage.");
    } else {
      outputChannel.appendLine("[ClineCopilotChat] No API key found in secret storage during pre-warm.");
    }
  });

  try {
    const disposable = vscode.lm.registerLanguageModelChatProvider(CLINE_COPILOT_CHAT_VENDOR, provider);
    context.subscriptions.push(disposable);
    outputChannel.appendLine(`[ClineCopilotChat] ✅ registerLanguageModelChatProvider(${CLINE_COPILOT_CHAT_VENDOR}) succeeded`);
  } catch (err) {
    outputChannel.appendLine(`[ClineCopilotChat] ❌ registerLanguageModelChatProvider FAILED: ${err}`);
    throw err;
  }

  const subscriptions: vscode.Disposable[] = [
    vscode.commands.registerCommand("clineCopilotChat.manage", () => provider.manage()),
    vscode.commands.registerCommand("clineCopilotChat.setApiKey", () => provider.setApiKey()),
    vscode.commands.registerCommand("clineCopilotChat.diagnostics", () => provider.showDiagnostics()),
    vscode.commands.registerCommand("clineCopilotChat.setThinkingEffort", async () => {
      const families = [
        { label: "DeepSeek", key: "deepseek", options: ["off", "low", "medium", "high", "max"] },
        { label: "GLM", key: "glm", options: ["off", "on"] },
        { label: "Kimi", key: "kimi", options: ["off", "on"] },
        { label: "MiniMax", key: "minimax", options: ["off", "on"] },
        { label: "MiMo", key: "mimo", options: ["off", "low", "medium", "high"] },
        { label: "Qwen", key: "qwen", options: ["off", "on", "auto"] },
      ];

      const family = await vscode.window.showQuickPick(
        families.map((f) => ({ label: f.label, family: f })),
        { placeHolder: "Pick a model family to configure Thinking" },
      );
      if (!family) return;

      const choice = await vscode.window.showQuickPick(family.family.options, {
        placeHolder: `Set ${family.family.label} thinking`,
      });
      if (!choice) return;

      const cfg = vscode.workspace.getConfiguration("clineCopilotChat.thinking");
      await cfg.update(family.family.key, choice, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Cline Copilot Chat Thinking — ${family.family.label}: ${choice}`);
    }),
  ];

  context.subscriptions.push(...subscriptions);
}

export async function deactivate(): Promise<void> {}
