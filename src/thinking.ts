/**
 * Thinking mode support for Cline Copilot Chat models.
 */

export type ThinkingFamily = "deepseek" | "glm" | "kimi" | "minimax" | "mimo" | "qwen" | null;

export interface ThinkingSettings {
  deepseek: string;
  glm: string;
  kimi: string;
  minimax: string;
  mimo: string;
  qwen: string;
  qwenBudget: string;
}

export function thinkingFamily(modelId: string): ThinkingFamily {
  // Strip vendor prefixes to get the bare model name for family detection.
  // ClinePass:  "cline-pass/deepseek-v4-flash" → "deepseek-v4-flash"
  // Pay-per-use: "deepseek/deepseek-chat" → "deepseek-chat"
  // Direct:     "deepseek-v4-flash" → "deepseek-v4-flash"
  const bare = modelId.replace(/^(?:cline-pass|cline)\//i, "").replace(/^[^/]+\//i, "");
  if (/^deepseek-/i.test(bare)) return "deepseek";
  if (/^glm-/i.test(bare)) return "glm";
  if (/^kimi-/i.test(bare)) return "kimi";
  if (/^minimax-/i.test(bare)) return "minimax";
  if (/^qwen3?(?:\.|-)/i.test(bare)) return "qwen";
  if (/^mimo-/i.test(bare)) return "mimo";
  return null;
}

export function getSettings(): {
  temperature: number;
  maxTokens: number;
  debugReasoning: boolean;
  requestTimeoutMs: number;
  streamIdleTimeoutMs: number;
  thinking: ThinkingSettings;
  stripThinkTags: "never" | "auto" | "always";
} {
  const config = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vscode = require("vscode") as typeof import("vscode");
      return vscode.workspace.getConfiguration("clineCopilotChat");
    } catch {
      return undefined;
    }
  })();

  const get = <T>(key: string, fallback: T): T => {
    return config?.get<T>(key) ?? fallback;
  };

  const thinkingSection = (key: string, fallback: string): string => {
    return get<string>(`thinking.${key}`, fallback);
  };

  return {
    temperature: get("temperature", 0.2),
    maxTokens: get("maxTokens", 0),
    debugReasoning: get("debugReasoning", false),
    requestTimeoutMs: get("requestTimeoutSeconds", 600) * 1000,
    streamIdleTimeoutMs: get("streamIdleTimeoutSeconds", 120) * 1000,
    stripThinkTags: get("stripThinkTags", "auto") as "never" | "auto" | "always",
    thinking: {
      deepseek: thinkingSection("deepseek", "off"),
      glm: thinkingSection("glm", "off"),
      kimi: thinkingSection("kimi", "off"),
      minimax: thinkingSection("minimax", "off"),
      mimo: thinkingSection("mimo", "off"),
      qwen: thinkingSection("qwen", "off"),
      qwenBudget: thinkingSection("qwenBudget", "auto"),
    },
  };
}

/**
 * Build the thinking/reasoning payload for a specific model.
 */
export function buildThinkingPayload(
  modelId: string,
  thinking: ThinkingSettings,
  _hasImageInput: boolean,
): Record<string, unknown> | undefined {
  const family = thinkingFamily(modelId);
  if (!family) return undefined;

  const value = thinking[family];
  if (!value || value === "off") return undefined;

  switch (family) {
    case "deepseek": {
      const effort = value === "on" ? "high" : value;
      return { reasoning_effort: effort };
    }
    case "glm":
      return { thinking: { type: value === "on" ? "enabled" : "disabled" } };
    case "kimi":
      return { thinking: { type: value === "on" ? "enabled" : "disabled" } };
    case "minimax":
      return { thinking: { type: value === "on" ? "enabled" : "disabled" } };
    case "mimo": {
      const effort = value === "on" ? "high" : value;
      return { reasoning_effort: effort };
    }
    case "qwen": {
      if (value === "auto") return undefined;
      const payload: Record<string, unknown> = { enable_thinking: value === "on" };
      if (value === "on" && thinking.qwenBudget && thinking.qwenBudget !== "auto") {
        payload.thinking_budget = parseInt(thinking.qwenBudget, 10);
      }
      return payload;
    }
    default:
      return undefined;
  }
}

/** JSON schema property for the Cline API key — always included in model-level configuration
 * so it remains editable via VS Code's model settings panel regardless of whether VS Code
 * surfaces the vendor-level `languageModelChatProviders.configuration` UI.
 */
const API_KEY_SCHEMA_PROPERTY = {
  apiKey: {
    type: "string",
    title: "Cline API Key",
    description: "Your Cline API key from app.cline.bot → Settings → API Keys.",
    secret: true,
  },
};

/**
 * Build the full model configuration schema: always includes apiKey, plus
 * optional thinking-mode properties for models that support it.
 */
export function buildModelConfigurationSchema(
  modelId: string,
): { properties: Record<string, unknown> } {
  const thinkingSchema = buildFamilyThinkingSchema(modelId);
  return {
    properties: {
      ...API_KEY_SCHEMA_PROPERTY,
      ...(thinkingSchema?.properties ?? {}),
    },
  };
}

export function buildFamilyThinkingSchema(
  modelId: string,
): { properties: Record<string, unknown> } | undefined {
  const family = thinkingFamily(modelId);
  if (!family) return undefined;

  switch (family) {
    case "deepseek":
      return {
        properties: {
          deepseek: {
            type: "string",
            enum: ["off", "low", "medium", "high", "max"],
            default: "off",
            markdownDescription: "DeepSeek thinking depth",
          },
        },
      };
    case "glm":
    case "kimi":
    case "minimax":
      return {
        properties: {
          [family]: {
            type: "string",
            enum: ["off", "on"],
            default: "off",
            markdownDescription: `${family} thinking mode`,
          },
        },
      };
    case "mimo":
      return {
        properties: {
          mimo: {
            type: "string",
            enum: ["off", "low", "medium", "high"],
            default: "off",
            markdownDescription: "MiMo thinking depth",
          },
        },
      };
    case "qwen":
      return {
        properties: {
          qwen: {
            type: "string",
            enum: ["auto", "on", "off"],
            default: "off",
            markdownDescription: "Qwen thinking mode",
          },
          qwenBudget: {
            type: "string",
            enum: ["auto", "4096", "16384", "32768", "81920"],
            default: "auto",
            markdownDescription: "Qwen thinking budget",
          },
        },
      };
    default:
      return undefined;
  }
}
