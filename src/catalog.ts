/**
 * Cline Copilot Chat — dynamic model catalog.
 *
 * The model list is NOT hardcoded any more. Cline publishes its own catalog at
 * two unauthenticated endpoints — the same ones Cline's extension reads
 * (`function aIu` in `cline/dist/extension.js`, 10s timeout, no auth header):
 *
 *   GET /api/v1/ai/cline/models
 *     → { data: [{ id, name, description, created, context_length,
 *                  top_provider: { context_length, max_completion_tokens },
 *                  architecture: { input_modalities }, supported_parameters }] }
 *     → 438 entries today, every one carrying limits + capabilities.
 *
 *   GET /api/v1/ai/cline/recommended-models
 *     → { recommended, free, clinePass, clineCloud }
 *     → `clinePass` is Cline's own list of what the subscription serves today.
 *
 * CONTRACT (do not break these):
 *  1. `loadCatalog()` NEVER throws-and-loses and never yields an empty list from
 *     the caller's perspective — extension.ts degrades live → snapshot →
 *     bundled. Returning `[]` makes the provider look deleted in the picker.
 *  2. Model IDs pass through verbatim. The `cline-pass/` prefix is what routes
 *     billing, so ids must never be rewritten or re-prefixed.
 *  3. Only tool-capable models are advertised for pay-per-use: Copilot Chat
 *     filters non-tool models out anyway (see CHANGELOG 0.1.0 "Models not
 *     visible in chat picker").
 */

import * as vscode from "vscode";
import { resolveModelMetadata } from "./metadata";
import { CONFIG_SECTION } from "./providerEnablement";

// ── Public types ───────────────────────────────────────────────────────────

/** Which provider's catalog to build. */
export type CatalogKind = "pass" | "payg";

/** Where a resolved list came from — surfaced in logs and diagnostics. */
export type CatalogSource = "live" | "snapshot" | "bundled";

export interface CatalogModel {
  id: string;
  name: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  vision: boolean;
  reasoning: boolean;
  /** True for the free-tier models Cline advertises separately. */
  free?: boolean;
}

export interface CatalogResult {
  models: CatalogModel[];
  source: CatalogSource;
  detail: string;
  fetchedAt: number;
}

/** Structural subset of `ModelDef` in extension.ts (avoids a circular import). */
export interface FallbackModelDef {
  id: string;
  name: string;
  family: string;
}

export interface DynamicModelSettings {
  enabled: boolean;
  refreshHours: number;
  baseUrl: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_CATALOG_BASE_URL = "https://api.cline.bot";
const MODELS_PATH = "/api/v1/ai/cline/models";
const RECOMMENDED_PATH = "/api/v1/ai/cline/recommended-models";

const FETCH_TIMEOUT_MS = 10_000;
/** Shared raw-doc cache so both providers reuse one download per refresh. */
const DOC_CACHE_TTL_MS = 60_000;

/** Mirrors DEFAULT_LIMITS in metadata.ts — used when a model ships no specs. */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;

const REASONING_PARAMS = new Set(["reasoning", "reasoning_effort", "include_reasoning"]);
const TOOL_PARAMS = new Set(["tools", "tool_choice"]);

// ── Settings ───────────────────────────────────────────────────────────────

/**
 * Read the dynamic-catalog settings. Like providerEnablement, these live under
 * the `clineCopilotChat` section, so a section-scoped configuration resolves
 * `dynamicModels.enabled` correctly.
 */
export function getDynamicModelSettings(): DynamicModelSettings {
  const config = (() => {
    try {
      return vscode.workspace.getConfiguration(CONFIG_SECTION);
    } catch {
      return undefined;
    }
  })();
  const rawHours = config?.get<number>("dynamicModels.refreshHours", 6) ?? 6;
  const rawBase = config?.get<string>("dynamicModels.catalogBaseUrl", DEFAULT_CATALOG_BASE_URL);
  return {
    enabled: config?.get<boolean>("dynamicModels.enabled", true) ?? true,
    // Never refresh more often than every 15 minutes: the payload is ~300 KB.
    refreshHours: Math.max(0.25, Number.isFinite(rawHours) ? rawHours : 6),
    baseUrl: (rawBase?.trim() || DEFAULT_CATALOG_BASE_URL).replace(/\/+$/, ""),
  };
}

// ── Fetching ───────────────────────────────────────────────────────────────

/** A catalog entry after normalization — includes the sort key and tool flag. */
interface RawEntry {
  id: string;
  name: string;
  family: string;
  created: number;
  contextWindow: number;
  maxOutputTokens: number;
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
}

interface RawDocs {
  catalog: RawEntry[];
  recommended: Record<string, unknown> | undefined;
}

const docCache = new Map<string, { at: number; value: RawDocs }>();

/** Drop the shared doc cache — used by the manual "Refresh Models" command. */
export function invalidateDocCache(): void {
  docCache.clear();
}

async function fetchJson(url: string): Promise<unknown> {
  // AbortController instead of AbortSignal.timeout() so this compiles against
  // any @types/vscode + lib combination the engine range allows.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function loadRawDocs(baseUrl: string): Promise<RawDocs> {
  const cached = docCache.get(baseUrl);
  if (cached && Date.now() - cached.at < DOC_CACHE_TTL_MS) return cached.value;

  // Both providers need both documents: `clinePass` is the subscription list,
  // and the big catalog supplies specs for the non-prefixed twins.
  const [modelsDoc, recommendedDoc] = await Promise.all([
    fetchJson(`${baseUrl}${MODELS_PATH}`),
    fetchJson(`${baseUrl}${RECOMMENDED_PATH}`),
  ]);

  const value: RawDocs = {
    catalog: normalizeCatalog(modelsDoc),
    recommended: asRecord(recommendedDoc),
  };
  docCache.set(baseUrl, { at: Date.now(), value });
  return value;
}

// ── JSON guards ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCatalog(doc: unknown): RawEntry[] {
  const list = Array.isArray(doc) ? doc : asArray(asRecord(doc)?.data);
  const entries: RawEntry[] = [];
  for (const item of list) {
    const entry = normalizeEntry(item);
    if (entry) entries.push(entry);
  }
  return entries;
}

function normalizeEntry(raw: unknown): RawEntry | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const id = asString(record.id);
  if (!id) return undefined;

  const topProvider = asRecord(record.top_provider);
  const architecture = asRecord(record.architecture);
  const inputModalities = asArray(architecture?.input_modalities).map((v) => asString(v) ?? "");
  const parameters = asArray(record.supported_parameters).map((v) => asString(v) ?? "");

  return {
    id,
    name: cleanCatalogName(asString(record.name) ?? id, id),
    family: familyFor(id),
    created: asNumber(record.created) ?? 0,
    contextWindow:
      asPositiveInt(topProvider?.context_length) ??
      asPositiveInt(record.context_length) ??
      DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens:
      asPositiveInt(topProvider?.max_completion_tokens) ?? DEFAULT_MAX_OUTPUT_TOKENS,
    vision: inputModalities.includes("image"),
    reasoning: parameters.some((p) => REASONING_PARAMS.has(p)),
    tools: parameters.some((p) => TOOL_PARAMS.has(p)),
  };
}

// ── Naming ─────────────────────────────────────────────────────────────────

const FAMILY_BY_VENDOR: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "x-ai": "xAI",
  xai: "xAI",
  "z-ai": "Z.ai",
  zai: "Z.ai",
  moonshotai: "Moonshot AI",
  moonshot: "Moonshot AI",
  xiaomi: "MiMo",
  mimo: "MiMo",
  minimax: "MiniMax",
  qwen: "Qwen",
  mistralai: "Mistral",
  mistral: "Mistral",
  "meta-llama": "Meta",
  meta: "Meta",
  perplexity: "Perplexity",
  deepseek: "DeepSeek",
  "cline-free": "Cline",
  "cline-pass": "ClinePass",
};

const FAMILY_BY_BRAND: Array<[RegExp, string]> = [
  [/^deepseek/i, "DeepSeek"],
  [/^glm/i, "Z.ai"],
  [/^kimi/i, "Moonshot AI"],
  [/^minimax/i, "MiniMax"],
  [/^mimo/i, "MiMo"],
  [/^qwen/i, "Qwen"],
  [/^muse/i, "Meta"],
];

/** Brand tokens that need fixed casing when prettifying a raw model id. */
const NAME_TOKENS: Record<string, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  kimi: "Kimi",
  minimax: "MiniMax",
  mimo: "MiMo",
  qwen: "Qwen",
  gpt: "GPT",
  ai: "AI",
  vl: "VL",
  omni: "Omni",
};

function familyFor(id: string): string {
  const slash = id.indexOf("/");
  const vendor = (slash === -1 ? "" : id.slice(0, slash)).toLowerCase();
  const known = FAMILY_BY_VENDOR[vendor];
  if (known) return known;
  const bare = slash === -1 ? id : id.slice(slash + 1);
  for (const [pattern, family] of FAMILY_BY_BRAND) {
    if (pattern.test(bare)) return family;
  }
  if (!vendor) return "Cline";
  return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

/**
 * "kimi-k3.1-pro" → "Kimi K3.1 Pro", "qwen3.8-max" → "Qwen3.8 Max",
 * "glm-5.3-flash" → "GLM 5.3 Flash". Version suffixes stay attached to their
 * brand token so ids read like the provider's own marketing name.
 */
export function prettifyModelName(raw: string): string {
  const tokens = raw.split(/[-_]+/).filter(Boolean);
  const pretty = tokens.map((token) => {
    const match = /^([A-Za-z]+)(.*)$/.exec(token);
    if (!match) return token;
    const brand = NAME_TOKENS[match[1].toLowerCase()];
    return brand ? `${brand}${match[2]}` : token.charAt(0).toUpperCase() + token.slice(1);
  });
  return pretty.join(" ") || raw;
}

/**
 * Catalog names look like "MoonshotAI: Kimi K3.1 Pro" — drop the vendor prefix
 * (the picker already shows "Cline / …") and tag free-tier duplicates.
 */
function cleanCatalogName(label: string, id: string): string {
  let name = label.replace(/:free$/i, "").trim();
  const separator = name.lastIndexOf(": ");
  if (separator !== -1) name = name.slice(separator + 2).trim();
  if (id.endsWith(":free") && !/\(free\)$/i.test(name)) name = `${name} (free)`;
  return name || id;
}

// ── List builders ──────────────────────────────────────────────────────────

function toCatalogModel(entry: RawEntry): CatalogModel & { created: number } {
  return {
    id: entry.id,
    name: entry.name,
    family: entry.family,
    contextWindow: entry.contextWindow,
    maxOutputTokens: entry.maxOutputTokens,
    vision: entry.vision,
    reasoning: entry.reasoning,
    free: entry.id.endsWith(":free") || undefined,
    created: entry.created,
  };
}

/**
 * Pay-per-use: the full tool-capable catalog, newest first.
 *
 * Excluded on purpose:
 *  - `:batch` entries — async batch endpoints, unusable from chat.
 *  - `~vendor/…` aliases — internal "latest" pointers with unstable ids.
 *  - models without tool calling — Copilot Chat hides them regardless and Agent
 *    Mode needs tools (CHANGELOG 0.1.0 "Models not visible in chat picker").
 * The free-tier ids Cline advertises separately are not part of the catalog, so
 * they get conservative defaults and a "(free)" tag.
 */
function buildPaygModels(docs: RawDocs): CatalogModel[] {
  const models: Array<CatalogModel & { created: number }> = [];
  const seen = new Set<string>();

  for (const entry of docs.catalog) {
    if (entry.id.endsWith(":batch")) continue;
    if (entry.id.startsWith("~")) continue;
    if (!entry.tools) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    models.push(toCatalogModel(entry));
  }

  for (const raw of asArray(docs.recommended?.free)) {
    const id = asString(asRecord(raw)?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      name: `${prettifyModelName(id.slice(id.lastIndexOf("/") + 1))} (free)`,
      family: familyFor(id),
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      vision: false,
      reasoning: false,
      free: true,
      // Cline-specific free routes: keep them above the catalog, in Cline's order.
      created: Number.MAX_SAFE_INTEGER,
    });
  }

  models.sort((a, b) => b.created - a.created);
  return models.map(({ created: _created, ...model }) => model);
}

/**
 * ClinePass: Cline's own `clinePass` list (the subscription's source of truth).
 *
 * Those entries carry no specs, so each `cline-pass/<bare>` is matched against
 * the non-prefixed twin in the big catalog (`cline-pass/glm-5.3` → `z-ai/glm-5.3`).
 * Falls back to the bundled snapshot in metadata.ts, then to defaults.
 */
function buildPassModels(docs: RawDocs): CatalogModel[] {
  const twins = new Map<string, RawEntry>();
  for (const entry of docs.catalog) {
    const bare = entry.id.slice(entry.id.lastIndexOf("/") + 1);
    if (!twins.has(bare)) twins.set(bare, entry);
  }

  const models: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const raw of asArray(docs.recommended?.clinePass)) {
    const id = asString(asRecord(raw)?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const bare = id.replace(/^cline-pass\//, "");
    const twin = twins.get(bare);
    const bundled = resolveModelMetadata(id);
    models.push({
      id,
      name: prettifyModelName(bare),
      family: twin?.family ?? familyFor(bare),
      contextWindow: twin?.contextWindow ?? bundled.contextWindow,
      maxOutputTokens: twin?.maxOutputTokens ?? bundled.maxOutputTokens,
      vision: twin?.vision ?? bundled.supportsVision,
      reasoning: twin?.reasoning ?? bundled.reasoning,
    });
  }
  return models;
}

// ── Public entry points ────────────────────────────────────────────────────

/**
 * Fetch and build the live catalog for one provider. Throws on network failure
 * so the caller can fall back — a throw must NOT be treated as "no models".
 */
export async function loadCatalog(
  kind: CatalogKind,
  settings: DynamicModelSettings,
  log: (message: string) => void,
): Promise<CatalogResult> {
  const docs = await loadRawDocs(settings.baseUrl);
  const models = kind === "pass" ? buildPassModels(docs) : buildPaygModels(docs);
  if (models.length === 0) throw new Error("live catalog contained no usable models");
  const label = kind === "pass" ? "ClinePass" : "pay-per-use";
  log(`[catalog] live ${label}: ${models.length} model(s) from ${settings.baseUrl}`);
  return { models, source: "live", detail: settings.baseUrl, fetchedAt: Date.now() };
}

/** Resolve the hardcoded fallback list through the bundled metadata tables. */
export function bundledCatalog(defs: readonly FallbackModelDef[]): CatalogModel[] {
  return defs.map((def) => {
    const metadata = resolveModelMetadata(def.id);
    return {
      id: def.id,
      name: def.name,
      family: def.family,
      contextWindow: metadata.contextWindow,
      maxOutputTokens: metadata.maxOutputTokens,
      vision: metadata.supportsVision,
      reasoning: metadata.reasoning,
    };
  });
}

// ── Snapshot persistence ───────────────────────────────────────────────────

const SNAPSHOT_PREFIX = "cline.catalog.v1.";

export interface CatalogSnapshot {
  fetchedAt: number;
  models: CatalogModel[];
}

/** globalState key holding the last good catalog for a vendor. */
export function snapshotKey(vendor: string): string {
  return `${SNAPSHOT_PREFIX}${vendor}`;
}

/**
 * A snapshot is only trusted when it is structurally sound. globalState survives
 * downgrades and bad writes, and a malformed list would break the picker far
 * worse than a slightly stale one.
 */
function isValidSnapshot(value: unknown): value is CatalogSnapshot {
  const record = asRecord(value);
  if (!record) return false;
  if (typeof record.fetchedAt !== "number" || !Number.isFinite(record.fetchedAt)) return false;
  const models = asArray(record.models);
  if (models.length === 0) return false;
  return models.every((item) => {
    const model = asRecord(item);
    return (
      !!asString(model?.id) &&
      !!asString(model?.name) &&
      typeof model?.contextWindow === "number" &&
      model.contextWindow > 0 &&
      typeof model?.maxOutputTokens === "number" &&
      model.maxOutputTokens > 0
    );
  });
}

export async function saveSnapshot(
  state: vscode.Memento,
  vendor: string,
  result: CatalogResult,
): Promise<void> {
  const snapshot: CatalogSnapshot = { fetchedAt: result.fetchedAt, models: result.models };
  try {
    await state.update(snapshotKey(vendor), snapshot);
  } catch {
    // Persisting is best-effort: a failed write must not break the refresh.
  }
}

export async function loadSnapshot(
  state: vscode.Memento,
  vendor: string,
): Promise<CatalogSnapshot | undefined> {
  const raw = state.get<unknown>(snapshotKey(vendor));
  return isValidSnapshot(raw) ? raw : undefined;
}

export async function clearSnapshot(state: vscode.Memento, vendor: string): Promise<void> {
  await state.update(snapshotKey(vendor), undefined);
}




