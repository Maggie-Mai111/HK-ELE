import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const package87 = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const contract = require(path.join(package87, "ai_filter_contract.js"));
const captured = JSON.parse(await readFile(path.join(here,"fixtures/a_app_contract.json"),"utf8"));

async function text(...parts) {
  return readFile(path.join(...parts), "utf8");
}

async function gzipJson(...parts) {
  return JSON.parse(gunzipSync(await readFile(path.join(...parts))).toString("utf8"));
}

async function context(scope = "broader", sort = "overall") {
  const manifest = await gzipJson(package87, "data", "releases", "2026-10-20-a-main-v1", "manifest.json.gz");
  const info = manifest.browse[scope][sort];
  const rows = [];
  for (let index = 0; index < info.chunk_count; index += 1) {
    const packed = await gzipJson(package87, "data", "releases", "2026-10-20-a-main-v1", "browse", scope, sort, `${String(index).padStart(4, "0")}.json.gz`);
    rows.push(...packed.map(row => Object.fromEntries(manifest.browse_fields.map((field, fieldIndex) => [field, row[fieldIndex] ?? null]))));
  }
  return {manifest, rows, index:await gzipJson(package87, "data", "releases", "2026-10-20-a-main-v1", "ai_filter_index.json.gz")};
}

test("principal populations and unchanged static baseline metadata", async () => {
  const {manifest} = await context();
  const metadata = manifest.metadata;
  assert.equal(Number(metadata.family_count), 163906);
  assert.equal(Number(metadata.ranked_family_count), 163371);
  assert.equal(Number(metadata.unranked_family_count), 535);
  assert.equal(manifest.browse.core.overall.available_items, 2871);
  assert.equal(manifest.browse.broader.overall.available_items, 2871);
  assert.equal(manifest.browse.broader.overall.available_items - manifest.browse.core.overall.available_items, 0);
  for (const name of ["tokenizer.js", "contractions.js", "xlsx_export.js"]) {
    assert.equal(createHash("sha256").update(await readFile(path.join(package87,name))).digest("hex"),captured.baselineHelperSha256[name], `${name} changed from the selected UI baseline`);
  }
});

test("Package87 allowlist remains aligned with Package85 schema", async () => {
  const schema = captured.appSchema;
  for (const key of contract.FILTER_KEYS) assert.match(schema, new RegExp(`[\"']${key}[\"']`), `Package85 schema missing ${key}`);
  assert.deepEqual(contract.GRADES, ["P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2", "S3"]);
  assert.deepEqual(contract.HK_BANDS, ["HK Top 1k", "HK Top 2k", "HK Top 3k", "HK Top 5k", "HK Top 10k"]);
});

test("shared fixtures validate and execute against the principal Browse projection", async () => {
  const fixtures = JSON.parse(await text(here, "fixtures", "package85_package87_ai_filter_cases.json"));
  const {rows, index} = await context();
  for (const item of fixtures.cases) {
    const response = contract.validateResult(item.response);
    if (!response.filters) {
      assert.equal(response.status, "unsupported");
      continue;
    }
    const result = contract.applyToRows(rows, response.filters, index);
    assert.equal(result.matchedBeforeLimit, item.expectedMatchCount, item.id);
    if (item.expectedKeys) assert.deepEqual(result.families.map(row => row.baseword_key), item.expectedKeys);
  }
});

test("verified Package85 examples and Package87 conditions stay consistent", async () => {
  const examples = captured.appExamples;
  const fixture = captured.appFixture;
  const usability = captured.appUsability;
  for (const expected of ["1118", "997", "root act", "registered root act"]) assert.ok(`${examples}\n${fixture}`.includes(expected));
  for (const field of ["prefix", "suffix", "awl", "msvl", "cpb100"]) assert.match(usability, new RegExp(`${field}`));
  assert.match(fixture, /scope:\s*["']inclusive_reference["'],\s*root:\s*["']act["'],\s*limit:\s*20,\s*sort:\s*["']overall["']/);
});

test("illegal and unknown Worker output fails closed", () => {
  assert.throws(() => contract.validateConditions({scope:"candidate", limit:20, sort:"overall", sql:"DROP TABLE"}), /unknown fields/);
  assert.throws(() => contract.validateConditions({scope:"candidate", overallRankMin:20, overallRankMax:10, limit:20, sort:"overall"}), /reversed/);
  assert.throws(() => contract.validateConditions({scope:"candidate", root:"act;{}", limit:20, sort:"overall"}), /forbidden/);
  assert.throws(() => contract.validateResult({status:"ready", summary:"unsafe", filters:null, clarifyingQuestion:null, warnings:[]}), /requires filters/);
});

test("UI is one thin adapter over the existing Browse table", async () => {
  const html = await text(package87, "index.html");
  const app = await text(package87, "app.js");
  const ai = await text(package87, "ai_filter.js");
  const config = await text(package87, "ai_public_config.js");
  const runtimeConfig = await text(package87, "ai_runtime_config.js");
  assert.equal((html.match(/id="family-table"/g) || []).length, 1);
  assert.match(app, /HKELE_BROWSE_ADAPTER/);
  assert.match(app, /ai_filters/);
  assert.doesNotMatch(ai, /api\.deepseek|deepseek\.com/i);
  assert.match(ai, /action:\s*"ai_filter"/);
  assert.match(config, /https:\/\/maggie-mai111\.github\.io/);
  assert.match(config, /\/api\/ai\/interpret-filter/);
  const runtimeWindow = {};
  const { runInNewContext } = await import("node:vm");
  runInNewContext(runtimeConfig, {window: runtimeWindow});
  assert.equal(runtimeWindow.__HKELE_AI_PUBLIC_CONFIG__.endpoint,
    "https://hkele-ai-filter.hkele-teacher-webapp.workers.dev/api/ai/interpret-filter");
  assert.equal(runtimeWindow.__HKELE_AI_PUBLIC_CONFIG__.turnstileSiteKey,
    "0x4AAAAAAFEeVTrwV_ny6k5q");
  assert.doesNotMatch(`${html}\n${app}\n${ai}\n${config}\n${runtimeConfig}`, /sk-[A-Za-z0-9_-]{12,}/);
});
