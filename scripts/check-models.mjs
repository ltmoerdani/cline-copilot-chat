#!/usr/bin/env node
/**
 * Cline Copilot Chat — fallback list drift check.
 *
 * Since 0.2.0 the picker is driven by Cline's live catalog (src/catalog.ts), so
 * this script no longer guards the *advertised* list — it guards the offline
 * fallback in src/extension.ts and reports how far it has drifted.
 *
 * It hits the same two endpoints the extension uses:
 *   GET /api/v1/ai/cline/models              → full catalog (ids + specs)
 *   GET /api/v1/ai/cline/recommended-models  → recommended / free / clinePass
 *
 * Exit code 1 only when a FALLBACK pay-per-use id no longer exists upstream
 * (that would make an offline first run advertise a dead model). ClinePass drift
 * is informational: the fallback is allowed to lag the live `clinePass` list.
 *
 * Usage: npm run check-models
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.CLINE_CATALOG_BASE_URL || "https://api.cline.bot";
const MODELS_URL = `${BASE_URL}/api/v1/ai/cline/models`;
const RECOMMENDED_URL = `${BASE_URL}/api/v1/ai/cline/recommended-models`;

function readFallbackDefs() {
  const src = readFileSync(join(ROOT, "src", "extension.ts"), "utf8");
  const block = (name) => {
    const start = src.indexOf(`const ${name}: ModelDef[] = [`);
    if (start === -1) throw new Error(`${name} not found in src/extension.ts`);
    const end = src.indexOf("];", start);
    return src.slice(start, end);
  };
  const ids = (text) => [...text.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
  return {
    passthrough: ids(block("FALLBACK_CLINEPASS_MODEL_DEFS")),
    payg: ids(block("FALLBACK_CLINE_MODEL_DEFS")),
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return res.json();
}

const { passthrough, payg } = readFallbackDefs();
console.log(`Bundled fallback — ClinePass: ${passthrough.length} | pay-per-use: ${payg.length}`);

const modelsDoc = await fetchJson(MODELS_URL);
const catalog = new Map((modelsDoc.data ?? []).map((m) => [m.id, m]));

const recommendedDoc = await fetchJson(RECOMMENDED_URL);
const livePass = (recommendedDoc.clinePass ?? []).map((m) => m.id);
const liveFree = (recommendedDoc.free ?? []).map((m) => m.id);
const liveRecommended = (recommendedDoc.recommended ?? []).map((m) => m.id);

console.log(`Live catalog — tools-capable candidates: ${catalog.size} models`);
console.log(
  `Live curated lists — recommended: ${liveRecommended.length} | free: ${liveFree.length} | clinePass: ${livePass.length}`,
);

let failed = false;

// 1. Fallback pay-per-use ids must still exist upstream.
const missingPayg = payg.filter((id) => !catalog.has(id));
if (missingPayg.length > 0) {
  failed = true;
  console.log(`\n❌ ${missingPayg.length} fallback pay-per-use id(s) no longer exist upstream:`);
  for (const id of missingPayg) console.log(`   - ${id}`);
} else {
  console.log("\n✅ Every fallback pay-per-use id still exists upstream.");
}

// 2. Fallback ClinePass ids vs the live subscription list (informational).
const livePassSet = new Set(livePass);
const retiredFallback = passthrough.filter((id) => !livePassSet.has(id));
const notInFallback = livePass.filter((id) => !passthrough.includes(id));
if (retiredFallback.length > 0) {
  console.log(`\nℹ️  ${retiredFallback.length} fallback ClinePass id(s) are no longer in Cline's live list:`);
  for (const id of retiredFallback) console.log(`   - ${id}`);
}
if (notInFallback.length > 0) {
  console.log(`\nℹ️  ${notInFallback.length} live ClinePass model(s) are absent from the fallback:`);
  for (const id of notInFallback) console.log(`   - ${id}`);
}
if (retiredFallback.length === 0 && notInFallback.length === 0) {
  console.log("\n✅ Fallback ClinePass list matches Cline's live list exactly.");
}

// 3. Spot-check that specs are actually published for the curated models.
const noSpecs = liveRecommended
  .concat(liveFree)
  .filter((id) => {
    const entry = catalog.get(id);
    return !entry || !entry.top_provider?.max_completion_tokens;
  });
if (noSpecs.length > 0) {
  console.log(`\nℹ️  ${noSpecs.length} curated model(s) ship no catalog specs (extension falls back to defaults):`);
  for (const id of noSpecs) console.log(`   - ${id}`);
}

process.exit(failed ? 1 : 0);
