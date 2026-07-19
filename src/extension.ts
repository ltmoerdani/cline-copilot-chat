/**
 * Cline Copilot Chat — Extension entry point.
 *
 * Two providers, one API key:
 *   1. **Cline** (pay-per-use) — 100+ models across DeepSeek, Claude, GPT, Gemini…
 *   2. **ClinePass** ($9.99/mo) — 10 curated open-weight models with 2-5× rate limits.
 *
 * Both share the same endpoint (api.cline.bot) and the same API key.
 * The model-ID prefix determines billing: `deepseek/` vs `cline-pass/`.
 */

import * as vscode from "vscode";
import {
  CLINE_VENDOR,
  CLINE_PASS_VENDOR,
  BASE_URL,
  type AllProviderVendor,
} from "./providerTypes";
import { resolveModelMetadata } from "./metadata";
import { buildThinkingPayload, buildModelConfigurationSchema, getSettings } from "./thinking";
import { streamChatCompletions } from "./streaming";

// ── Extended option types ──────────────────────────────────────────────────

interface ConfiguredInfoOptions extends vscode.PrepareLanguageModelChatModelOptions {
  configuration?: { apiKey?: string };
}
interface ConfiguredResponseOptions extends vscode.ProvideLanguageModelChatResponseOptions {
  configuration?: { apiKey?: string };
}

// ── Shared constants ───────────────────────────────────────────────────────

const SECRET_KEY = "clineCopilotChat.apiKey";
const LEGACY_SECRET_KEY = "clinepass.apiKey";

async function resolveStoredApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const current = await secrets.get(SECRET_KEY);
  if (current) return current;
  const legacy = await secrets.get(LEGACY_SECRET_KEY);
  if (legacy) {
    await secrets.store(SECRET_KEY, legacy);
    await secrets.delete(LEGACY_SECRET_KEY);
    return legacy;
  }
  return undefined;
}

// ── Model definitions per vendor ───────────────────────────────────────────

interface ModelDef {
  id: string;
  name: string;
  family: string;
}

const CLINEPASS_MODEL_DEFS: ModelDef[] = [
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

const CLINE_MODEL_DEFS: ModelDef[] = [
  // DeepSeek — terbukti 200 OK (flash) / 402 (pro, v3, r1)
  { id: "deepseek/deepseek-v4-flash",     name: "DeepSeek V4 Flash",     family: "DeepSeek" },
  { id: "deepseek/deepseek-v4-pro",       name: "DeepSeek V4 Pro",       family: "DeepSeek" },
  { id: "deepseek/deepseek-v3",           name: "DeepSeek V3",           family: "DeepSeek" },
  { id: "deepseek/deepseek-r1",           name: "DeepSeek R1",           family: "DeepSeek" },
  { id: "deepseek/deepseek-chat",         name: "DeepSeek Chat",         family: "DeepSeek" },
  // OpenAI — 402 MODEL VALID
  { id: "openai/gpt-4o",                  name: "GPT-4o",                family: "OpenAI" },
  { id: "openai/gpt-5",                   name: "GPT-5",                 family: "OpenAI" },
  { id: "openai/o3",                      name: "o3",                    family: "OpenAI" },
  // Google — 402 MODEL VALID
  { id: "google/gemini-2.5-pro",          name: "Gemini 2.5 Pro",        family: "Google" },
  // Grok / xAI — 402 MODEL VALID
  { id: "xai/grok-3",                     name: "Grok 3",                family: "xAI" },
  { id: "xai/grok-4",                     name: "Grok 4",                family: "xAI" },
  // Z.ai / GLM — 402 MODEL VALID
  { id: "zai/glm-5.2",                    name: "GLM 5.2",               family: "Z.ai" },
  // Moonshot / Kimi — 402 MODEL VALID
  { id: "moonshot/kimi-k2.7-code",        name: "Kimi K2.7 Code",        family: "Moonshot AI" },
  { id: "moonshot/kimi-k2.6",             name: "Kimi K2.6",             family: "Moonshot AI" },
  // MiMo — 402 MODEL VALID
  { id: "mimo/mimo-v2.5",                 name: "MiMo V2.5",             family: "MiMo" },
  { id: "mimo/mimo-v2.5-pro",             name: "MiMo V2.5 Pro",         family: "MiMo" },
  // MiniMax — 402 MODEL VALID
  { id: "minimax/minimax-m3",             name: "MiniMax M3",            family: "MiniMax" },
  // Qwen — 402 MODEL VALID
  { id: "qwen/qwen3.7-max",              name: "Qwen3.7 Max",           family: "Qwen" },
  { id: "qwen/qwen3.7-plus",             name: "Qwen3.7 Plus",          family: "Qwen" },
  // Mistral — 402 MODEL VALID
  { id: "mistral/mistral-large",          name: "Mistral Large",         family: "Mistral" },
  // Meta — 402 MODEL VALID
  { id: "meta/llama-4-maverick",          name: "Llama 4 Maverick",      family: "Meta" },
  // Perplexity — 402 MODEL VALID
  { id: "perplexity/sonar-pro",           name: "Sonar Pro",             family: "Perplexity" },
  // Cohere — 402 MODEL VALID
  { id: "cohere/command-r-plus",          name: "Command R+",            family: "Cohere" },
];

// ── Internal model type ────────────────────────────────────────────────────

interface ClineCopilotChatModel extends vscode.LanguageModelChatInformation {
  rawModelId: string;
}

// ── Provider config ────────────────────────────────────────────────────────

interface ProviderConfig {
  vendor: AllProviderVendor;
  displayName: string;
  models: ModelDef[];
  labelPrefix: string;
  testModelId: string;
}

const PROVIDER_CONFIGS: Record<AllProviderVendor, ProviderConfig> = {
  [CLINE_VENDOR]: {
    vendor: CLINE_VENDOR,
    displayName: "Cline",
    models: CLINE_MODEL_DEFS,
    labelPrefix: "Cline",
    testModelId: "deepseek/deepseek-v4-flash",
  },
  [CLINE_PASS_VENDOR]: {
    vendor: CLINE_PASS_VENDOR,
    displayName: "ClinePass",
    models: CLINEPASS_MODEL_DEFS,
    labelPrefix: "ClinePass",
    testModelId: "cline-pass/deepseek-v4-flash",
  },
};

// ── Shared provider class ──────────────────────────────────────────────────

class ClineProvider implements vscode.LanguageModelChatProvider<ClineCopilotChatModel> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly apiKeysByModelId = new Map<string, string>();
  outputChannel: vscode.OutputChannel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: ProviderConfig,
  ) {}

  private getOutputChannel(): vscode.OutputChannel {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel(this.config.displayName);
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
    this.log(`[${this.config.displayName}] provideLanguageModelChatInformation CALLED`);

    let apiKey = opts.configuration?.apiKey;
    // BUG FIX (v0.1.4, found via E2E smoke test): the original guard was
    //   if (!apiKey && opts.configuration) { ... }
    // which meant: if VS Code calls provideLanguageModelChatInformation WITHOUT
    // a configuration object (common early in the session), resolveStoredApiKey
    // was NEVER invoked and we returned [] even when a key WAS stored. In a
    // dual-provider setup, this manifested as one vendor (e.g. "cline") staying
    // invisible to the picker while the other ("cline-pass") worked — depending
    // on which calls happened to include opts.configuration.
    //
    // Fix: ALWAYS fall back to SecretStorage when no inline key was provided,
    // regardless of whether opts.configuration is present.
    if (!apiKey) {
      apiKey = await resolveStoredApiKey(this.context.secrets);
    }
    if (apiKey) {
      const existing = await this.context.secrets.get(SECRET_KEY);
      if (existing !== apiKey) {
        await this.context.secrets.store(SECRET_KEY, apiKey);
      }
    }

    if (token.isCancellationRequested) {
      this.log(`[${this.config.displayName}] provideLanguageModelChatInformation cancelled — returning [].`);
      return [];
    }

    if (!apiKey) {
      this.log(
        `[${this.config.displayName}] No API key — returning empty model list. ` +
          `Run 'Cline Copilot Chat: Set API Key' then reload the window. ` +
          `Note: SecretStorage is per-device and is NOT synced by VS Code Settings Sync.`,
      );
      return [];
    }

    const models = this.config.models.map((model) => {
      const metadata = resolveModelMetadata(model.id);
      const effectiveId = `${this.config.vendor}:${model.id}`;
      if (apiKey) {
        this.apiKeysByModelId.set(model.id, apiKey);
        this.apiKeysByModelId.set(effectiveId, apiKey);
      }

      const configurationSchema = buildModelConfigurationSchema(model.id);

      return {
        id: effectiveId,
        rawModelId: model.id,
        name: `${this.config.labelPrefix} / ${model.name}`,
        family: model.family,
        version: "1.0.0",
        maxInputTokens: metadata.contextWindow,
        maxOutputTokens: metadata.maxOutputTokens,
        capabilities: {
          imageInput: metadata.supportsVision,
          toolCalling: true,
        },
        configurationSchema,
      };
    });

    this.log(
      `[${this.config.displayName}] advertising ${models.length} model(s) to VS Code ` +
        `[${models.slice(0, 3).map((m) => m.rawModelId).join(", ")}${models.length > 3 ? ", …" : ""}]`,
    );
    return models;
  }

  async provideLanguageModelChatResponse(
    model: ClineCopilotChatModel,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const opts = options as ConfiguredResponseOptions;
    let apiKeySource = "none";
    let apiKey = opts.configuration?.apiKey;
    if (apiKey) {
      apiKeySource = "byok";
      void this.context.secrets.get(SECRET_KEY).then((existing) => {
        if (existing !== apiKey) {
          void this.context.secrets.store(SECRET_KEY, apiKey!);
        }
      });
      this.apiKeysByModelId.set(model.id, apiKey);
      this.apiKeysByModelId.set(model.rawModelId, apiKey);
    }
    if (!apiKey) {
      apiKey =
        this.apiKeysByModelId.get(model.id) ??
        this.apiKeysByModelId.get(model.rawModelId) ??
        this.apiKeysByModelId.get(`${this.config.vendor}:${model.rawModelId}`);
      if (apiKey) {
        apiKeySource = "cache";
      } else {
        // Fallback to pre-warmed key (set during activate). Delete after use to
        // prevent stale key lingering if the user later clears their API key.
        apiKey = this.apiKeysByModelId.get("__prewarm__");
        if (apiKey) {
          apiKeySource = "prewarm";
          this.apiKeysByModelId.delete("__prewarm__");
        }
      }
    }
    if (!apiKey) {
      apiKey = await resolveStoredApiKey(this.context.secrets);
      if (apiKey) {
        apiKeySource = "secret-storage";
        this.apiKeysByModelId.set(model.id, apiKey);
        this.apiKeysByModelId.set(model.rawModelId, apiKey);
      }
    }

    this.log(`[${this.config.displayName}] Key source=${apiKeySource} model=${model.rawModelId}`);

    if (!apiKey) {
      void vscode.window
        .showErrorMessage(`${this.config.displayName}: API key not found.`, "Set API Key")
        .then((choice) => {
          if (choice === "Set API Key") void this.setApiKey();
        });
      throw new Error(`${this.config.displayName} API key required.`);
    }

    const rawModelId = model.rawModelId ?? model.id.replace(`${this.config.vendor}:`, "");
    this.log(`[${this.config.displayName}] rawModelId=${rawModelId} (model.id=${model.id} rawModelId=${model.rawModelId ?? "UNSET"})`);
    const settings = getSettings();

    const apiMessages = convertMessagesToApi(messages);

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

    const body: Record<string, unknown> = {
      model: rawModelId,
      messages: apiMessages,
      stream: true,
    };

    this.log(`[${this.config.displayName}] Request: model=${rawModelId} msgs=${apiMessages.length} tools=${toolNames.size}`);

    if (apiTools.length > 0) {
      body.tools = apiTools;
    }
    if (settings.temperature > 0) {
      body.temperature = settings.temperature;
    }
    if (settings.maxTokens > 0) {
      body.max_tokens = settings.maxTokens;
    }

    const hasImageInput = messages.some((msg) => {
      if (typeof msg.content === "string") return false;
      return msg.content.some(
        (part) => part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/"),
      );
    });
    const thinkingPayload = buildThinkingPayload(rawModelId, settings.thinking, hasImageInput);
    if (thinkingPayload) {
      Object.assign(body, thinkingPayload);
    }

    try {
      await streamChatCompletions({
        url: `${BASE_URL}/chat/completions`,
        providerDisplayName: this.config.displayName,
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
        enableXmlToolParsing: toolNames.size > 0,
        toolNames,
      });
      this.log(`[${this.config.displayName}] Response complete: model=${rawModelId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`[${this.config.displayName}] ERROR model=${rawModelId}: ${message}`);
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
      { title: `${this.config.displayName} Provider`, placeHolder: "Choose an action" },
    );
    if (!choice) return;

    switch (choice.action) {
      case "set": await this.setApiKey(); break;
      case "clear":
        await this.context.secrets.delete(SECRET_KEY);
        this.changeEmitter.fire();
        vscode.window.showInformationMessage(`${this.config.displayName} API key cleared.`);
        break;
      case "test": await this.testConnection(); break;
    }
  }

  async setApiKey(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      title: `${this.config.displayName} API Key`,
      prompt: "Paste your Cline API key (from app.cline.bot → Settings → API Keys).",
      password: true,
      ignoreFocusOut: true,
    });
    if (!apiKey) return;

    await this.context.secrets.store(SECRET_KEY, apiKey.trim());
    this.changeEmitter.fire();
    vscode.window.showInformationMessage(`${this.config.displayName} API key saved.`);
  }

  async testConnection(): Promise<void> {
    const apiKey = await resolveStoredApiKey(this.context.secrets);
    if (!apiKey) {
      vscode.window.showErrorMessage(`${this.config.displayName}: No API key set.`);
      return;
    }

    const statusBar = vscode.window.setStatusBarMessage(`$(loading~spin) Testing ${this.config.displayName}…`);

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.testModelId,
          messages: [{ role: "user", content: "reply with just: ok" }],
          max_tokens: 10,
          stream: false,
        }),
      });
      statusBar.dispose();

      if (response.ok) {
        // Validate response body contains actual content, not just HTTP 200.
        let reply = "";
        try {
          const json = await response.json();
          reply = json?.choices?.[0]?.message?.content ?? "";
        } catch {
          // Non-JSON body — treat as connection OK but note the oddity.
        }
        const detail = reply ? ` — got reply: "${reply.slice(0, 40)}"` : " (empty content)";
        vscode.window.showInformationMessage(
          `${this.config.displayName}: Connection OK (HTTP ${response.status})${detail}.`,
        );
      } else {
        const body = await response.text();
        this.log(`Test failed (${response.status}): ${body}`);
        vscode.window.showErrorMessage(`${this.config.displayName}: Failed (HTTP ${response.status}). Check Output.`);
        this.getOutputChannel().show(true);
      }
    } catch (error) {
      statusBar.dispose();
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Test error: ${message}`);
      vscode.window.showErrorMessage(`${this.config.displayName}: Connection error — ${message}`);
    }
  }
}

// ── Message helpers ────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to a base64 string without Node.js Buffer dependency.
 * Works in extension host where Buffer is available, but this avoids relying on it.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractTextContent(msg: vscode.LanguageModelChatRequestMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart)
    .map((p) => p.value)
    .join("");
}

function convertMessagesToApi(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const isUser = msg.role === vscode.LanguageModelChatMessageRole.User;
    const role = isUser ? "user" : "assistant";

    const parts: readonly vscode.LanguageModelInputPart[] =
      typeof msg.content === "string"
        ? [new vscode.LanguageModelTextPart(msg.content)]
        : (msg.content as readonly vscode.LanguageModelInputPart[]);

    const textParts: string[] = [];
    const imageParts: Array<{ mimeType: string; data: string }> = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    const toolResults: Array<Record<string, unknown>> = [];

    for (const part of parts) {
      if (part instanceof vscode.LanguageModelTextPart) {
        if (part.value) textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelDataPart && part.mimeType.startsWith("image/")) {
        // Convert image bytes to base64 data URI for OpenAI-compatible vision API.
        imageParts.push({ mimeType: part.mimeType, data: uint8ArrayToBase64(part.data) });
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({
          id: part.callId,
          type: "function",
          function: { name: part.name, arguments: JSON.stringify(part.input ?? {}) },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        const resultText = part.content
          .map((c) => {
            if (c instanceof vscode.LanguageModelTextPart) return c.value;
            if (typeof c === "string") return c;
            try { return JSON.stringify(c); } catch { return String(c); }
          })
          .join("");
        toolResults.push({ role: "tool", tool_call_id: part.callId, content: resultText });
      }
    }

    const joinedText = textParts.join("");

    if (isUser && !joinedText && toolResults.length > 0 && toolCalls.length === 0) {
      for (const tr of toolResults) result.push(tr);
      continue;
    }

    const entry: Record<string, unknown> = { role };
    if (toolCalls.length > 0) {
      entry.content = joinedText || null;
      entry.tool_calls = toolCalls;
    } else if (imageParts.length > 0) {
      // OpenAI-compatible multipart content: text + image_url entries.
      // Only used when images are present; plain text keeps string format for efficiency.
      const contentParts: Array<Record<string, unknown>> = [];
      if (joinedText) contentParts.push({ type: "text", text: joinedText });
      for (const img of imageParts) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
      }
      entry.content = contentParts;
    } else {
      entry.content = joinedText;
    }
    result.push(entry);
    for (const tr of toolResults) result.push(tr);
  }

  return result;
}

// ── VS Code 1.128 BYOK utility model auto-fix ─────────────────────────────

/**
 * VS Code 1.128 introduced `chat.byokUtilityModelDefault` with a default of "none",
 * which breaks all background utility tasks (title generation, commit messages, intent
 * detection) for BYOK users. This function auto-configures it to "mainAgent" on first
 * activation so background tasks continue to work seamlessly.
 *
 * RULES:
 * - Only runs on VS Code 1.128+.
 * - Skips if any utility model setting is already explicitly configured.
 * - Uses a one-time globalState flag to avoid showing the notification on every activation.
 * - Valid enum (from VS Code 1.128 desktop bundle): "none" | "mainAgent" | "copilot".
 */
function checkUtilityModelConfiguration(context: vscode.ExtensionContext): void {
  const [major, minor] = vscode.version.split(".").map(Number);
  if (major < 1 || (major === 1 && minor < 128)) return;

  const chat = vscode.workspace.getConfiguration("chat");
  const byokDefault    = chat.get<string>("byokUtilityModelDefault", "");
  const utilitySmall   = chat.get<string>("utilitySmallModel", "");
  const utilityGeneral = chat.get<string>("utilityModel", "");

  // Treat VS Code's schema default values as "not configured"
  const isConfigured =
    (byokDefault !== "" && byokDefault !== undefined && byokDefault !== "none") ||
    (utilitySmall !== "" && utilitySmall !== undefined && utilitySmall !== "Default") ||
    (utilityGeneral !== "" && utilityGeneral !== undefined && utilityGeneral !== "Default");
  if (isConfigured) return;

  void chat
    .update("byokUtilityModelDefault", "mainAgent", vscode.ConfigurationTarget.Global)
    .then(() => {
      const NOTICE_KEY = "cline.utilityModelAutoFixed.v1128";
      if (context.globalState.get<boolean>(NOTICE_KEY)) return;
      void context.globalState.update(NOTICE_KEY, true);
      void vscode.window.showInformationMessage(
        "Cline Copilot Chat: Automatically fixed VS Code 1.128 utility model setting. " +
          "Background tasks (chat titles, commit messages) now use your Cline model.",
      );
    });
}

/**
 * One-shot activation diagnostics banner — mirrors the Z.AI v0.4.0 fix for
 * "models missing from picker on a fresh device / second machine".
 *
 * The banner writes to the `Cline Copilot Chat` output channel and reports:
 *   - VS Code version
 *   - SecretStorage presence (and length, never the key itself)
 *   - selectChatModels({ vendor: "cline" }) and ({ vendor: "cline-pass" }) counts
 *     polled at 0 / 500 / 1500 ms (the picker cache may need a tick to populate)
 *   - the result of setting `github.copilot.clientByokEnabled = true` so the
 *     Manage Models gear icon stays clickable for BYOK users who are not signed
 *     in to GitHub Copilot Chat.
 *
 * If the API key is missing, a one-time toast with a `Set API Key` action is
 * shown. The banner is intentionally NOT guarded behind a globalState flag so
 * it always appears once per activation — that is the point of a diagnostic.
 *
 * Lesson (Z.AI v0.4.0): when pushing lines into a banner array, run ALL
 * `lines.push(...)` calls BEFORE the final `channel.appendLine(lines.join("\n"))`.
 * The output channel only sees the snapshot at flush time.
 */
async function logActivationDiagnostics(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const secrets = context.secrets;
  const key = await secrets.get(SECRET_KEY);
  const keyStatus = key ? `present (len=${key.length})` : "MISSING";

  const banner: string[] = [
    `=== Cline Copilot Chat activation diagnostics ===`,
    `[activate] extension activated, vendors="${CLINE_VENDOR}", "${CLINE_PASS_VENDOR}"`,
    `[activate] VS Code version: ${vscode.version}`,
    `[activate] SecretStorage "${SECRET_KEY}": ${keyStatus}`,
  ];

  // Poll selectChatModels three times — VS Code caches the picker list per window
  // and the registration may not be visible on the very first tick after activation.
  const countModels = async (vendor: AllProviderVendor): Promise<number> => {
    try {
      return (await vscode.lm.selectChatModels({ vendor })).length;
    } catch {
      return -1;
    }
  };

  let paygCount = await countModels(CLINE_VENDOR);
  let passCount = await countModels(CLINE_PASS_VENDOR);
  banner.push(
    `[activate] selectChatModels({ vendor: "${CLINE_VENDOR}" }): ${paygCount} model(s) visible to VS Code`,
    `[activate] selectChatModels({ vendor: "${CLINE_PASS_VENDOR}" }): ${passCount} model(s) visible to VS Code`,
  );

  // Re-poll after a short delay if the first poll returned 0 — the picker cache
  // may not have flushed the registration yet.
  if (paygCount === 0 || passCount === 0) {
    await new Promise((r) => setTimeout(r, 500));
    paygCount = await countModels(CLINE_VENDOR);
    passCount = await countModels(CLINE_PASS_VENDOR);
    banner.push(
      `[activate] selectChatModels re-poll @500ms: ${CLINE_VENDOR}=${paygCount}, ${CLINE_PASS_VENDOR}=${passCount}`,
    );
  }
  if (paygCount === 0 || passCount === 0) {
    await new Promise((r) => setTimeout(r, 1000));
    paygCount = await countModels(CLINE_VENDOR);
    passCount = await countModels(CLINE_PASS_VENDOR);
    banner.push(
      `[activate] selectChatModels re-poll @1500ms: ${CLINE_VENDOR}=${paygCount}, ${CLINE_PASS_VENDOR}=${passCount}`,
    );
  }

  // setContext workaround — keeps the Manage Models gear icon clickable even
  // when the user is not signed in to Copilot Chat. Defaults to true per VS Code
  // schema but is sometimes left unset until the Copilot extension first touches
  // the context service, so we force it.
  const totalModels = paygCount + passCount;
  if (totalModels > 0) {
    try {
      await vscode.commands.executeCommand(
        "setContext",
        "github.copilot.clientByokEnabled",
        true,
      );
      banner.push(
        `[activate] set 'github.copilot.clientByokEnabled' = true ` +
          `(ensures Manage Models gear icon stays clickable for BYOK users who are not signed in to Copilot)`,
      );
    } catch (err) {
      banner.push(
        `[activate] setContext 'github.copilot.clientByokEnabled' FAILED: ${String(err)}`,
      );
    }
  } else {
    banner.push(
      `[activate] skipped setContext — no models visible yet (likely API key missing or vendor contribution removed)`,
    );
  }

  banner.push(`=== end activation diagnostics ===`);

  // CRITICAL: flush the banner AFTER all lines have been pushed.
  // (Z.AI v0.4.0 had a bug where setContext result was pushed after flush.)
  outputChannel.appendLine(banner.join("\n"));

  // One-time toast if the API key is missing — give the user an action button
  // that opens the Set API Key command, rather than silently reporting 0 models.
  if (!key) {
    const NOTICE_KEY = "cline.apiKeyMissingNotified";
    if (context.globalState.get<boolean>(NOTICE_KEY)) return;
    void context.globalState.update(NOTICE_KEY, true);
    const choice = await vscode.window.showWarningMessage(
      "Cline Copilot Chat: No API key found. Models will not appear in the Copilot Chat picker.",
      "Set API Key",
    );
    if (choice === "Set API Key") {
      void vscode.commands.executeCommand("clineCopilotChat.setApiKey");
    }
  }
}

// ── Activation ─────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Cline Copilot Chat");
  context.subscriptions.push(outputChannel);
  outputChannel.appendLine("[ClineCopilotChat] activate() START");

  // Create both providers — same class, different config
  const paygProvider = new ClineProvider(context, PROVIDER_CONFIGS[CLINE_VENDOR]);
  const passProvider = new ClineProvider(context, PROVIDER_CONFIGS[CLINE_PASS_VENDOR]);

  // Inject output channels
  paygProvider.outputChannel = outputChannel;
  passProvider.outputChannel = outputChannel;

  // Pre-warm API key from secret storage for both providers
  void resolveStoredApiKey(context.secrets).then((stored) => {
    if (stored) {
      const cache = (p: ClineProvider) =>
        (p as unknown as { apiKeysByModelId: Map<string, string> }).apiKeysByModelId;
      cache(paygProvider).set("__prewarm__", stored);
      cache(passProvider).set("__prewarm__", stored);
      outputChannel.appendLine("[ClineCopilotChat] API key pre-warmed from secret storage.");
    } else {
      outputChannel.appendLine("[ClineCopilotChat] No API key in secret storage during pre-warm.");
    }
  });

  // Register both providers
  const subscriptions: vscode.Disposable[] = [
    vscode.lm.registerLanguageModelChatProvider(CLINE_VENDOR, paygProvider),
    vscode.lm.registerLanguageModelChatProvider(CLINE_PASS_VENDOR, passProvider),
  ];

  outputChannel.appendLine(`[ClineCopilotChat] ✅ Registered: ${CLINE_VENDOR}, ${CLINE_PASS_VENDOR}`);

  // Commands — shared across both providers (same API key)
  subscriptions.push(
    vscode.commands.registerCommand("clineCopilotChat.manage", () => paygProvider.manage()),
    vscode.commands.registerCommand("clineCopilotChat.setApiKey", () => paygProvider.setApiKey()),
    vscode.commands.registerCommand("clineCopilotChat.diagnostics", async () => {
      const paygModels = await vscode.lm.selectChatModels({ vendor: CLINE_VENDOR });
      const passModels = await vscode.lm.selectChatModels({ vendor: CLINE_PASS_VENDOR });

      const fmt = (m: vscode.LanguageModelChat) => {
        const raw = (m as unknown as { rawModelId?: string }).rawModelId ?? m.id;
        const meta = resolveModelMetadata(raw);
        return [
          `- ${raw}`,
          `  name: ${m.name}  family: ${m.family}`,
          `  context: ${m.maxInputTokens.toLocaleString()}  output: ${meta.maxOutputTokens.toLocaleString()}  reasoning: ${meta.reasoning}`,
        ].join("\n");
      };

      const content = [
        "# Cline Copilot Chat Diagnostics",
        "",
        `## Cline (pay-per-use) — ${paygModels.length} models`,
        ...paygModels.map(fmt),
        "",
        `## ClinePass ($9.99/mo) — ${passModels.length} models`,
        ...passModels.map(fmt),
      ].join("\n");

      const doc = await vscode.workspace.openTextDocument({ content, language: "markdown" });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }),
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
  );

  context.subscriptions.push(...subscriptions);

  // VS Code 1.128+ — auto-fix BYOK utility model so background tasks work
  checkUtilityModelConfiguration(context);

  // Activation diagnostics + setContext workaround — addresses the same class
  // of "models missing from picker on a fresh device / second machine" bug that
  // hit Z.AI v0.4.0. Runs async; we intentionally do not await.
  void logActivationDiagnostics(context, outputChannel);
}

export async function deactivate(): Promise<void> {}
