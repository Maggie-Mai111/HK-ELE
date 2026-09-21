(() => {
  "use strict";

  const cache = new Map();
  let manifestPromise = null;

  const norm = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  const apostropheNorm = value => norm(value).replace(/[’‘ʼ＇]/g, "'");
  const inflate = (fields, row) => Object.fromEntries(fields.map((field, index) => [field, row?.[index] ?? null]));

  async function loadGzipJson(path) {
    if (cache.has(path)) return cache.get(path);
    const promise = (async () => {
      const response = await fetch(path, {cache: "force-cache"});
      if (!response.ok) throw new Error(`Data file unavailable (${response.status}): ${path}`);
      const bytes = await response.arrayBuffer();
      if (typeof DecompressionStream !== "function") throw new Error("This browser cannot open the compressed database. Please use a current version of Chrome, Edge, Firefox, or Safari.");
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    })();
    cache.set(path, promise);
    return promise;
  }

  async function manifest() {
    if (!manifestPromise) manifestPromise = loadGzipJson("data/manifest.json.gz");
    return manifestPromise;
  }

  function fnvBucket(value, count) {
    let hash = 2166136261;
    for (const byte of new TextEncoder().encode(value)) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash % count;
  }

  function searchBucket(value) {
    const first = value.slice(0, 1);
    return /^[a-z0-9]$/.test(first) ? first : "_other";
  }

  async function browse(params) {
    const config = await manifest();
    const scope = params.get("scope") || "core";
    const sort = params.get("sort") || "overall";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = [10, 25, 50, 100].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 25;
    const info = config.browse?.[scope]?.[sort];
    if (!info) throw new Error("Unsupported Browse selection");
    const start = (page - 1) * pageSize;
    const stop = Math.min(start + pageSize, info.available_items);
    const rows = [];
    if (start < stop) {
      const firstChunk = Math.floor(start / config.chunk_size);
      const lastChunk = Math.floor((stop - 1) / config.chunk_size);
      for (let index = firstChunk; index <= lastChunk; index += 1) {
        const values = await loadGzipJson(`data/browse/${scope}/${sort}/${String(index).padStart(4, "0")}.json.gz`);
        const from = index === firstChunk ? start % config.chunk_size : 0;
        const to = index === lastChunk ? ((stop - 1) % config.chunk_size) + 1 : values.length;
        rows.push(...values.slice(from, to).map(row => inflate(config.browse_fields, row)));
      }
    }
    return {
      api_version: config.api_version, scope, sort, page, page_size: pageSize,
      total_items: info.total_items, available_items: info.available_items,
      populations: info.populations, families: rows,
    };
  }

  async function detail(key) {
    const config = await manifest();
    const normalized = norm(key);
    const bucket = String(fnvBucket(normalized, config.detail_buckets)).padStart(3, "0");
    const values = await loadGzipJson(`data/detail/${bucket}.json.gz`);
    const record = values[normalized];
    if (!record) throw new Error("No current family record");
    return {
      api_version: config.api_version,
      family: inflate(config.family_fields, record[0]),
      forms: record[1].map(row => inflate(config.form_fields, row)),
    };
  }

  function identityResponse(submitted, normalized, teacherDisplay, classification) {
    return {
      status: "BLOCKED", submitted_query: submitted, normalized_query: normalized,
      best_priority: null, best_owner_count: 0, owners: [], alternatives: [],
      identity_exception: {teacher_display: teacherDisplay, current_classification: classification},
    };
  }

  function expandOwners(config, rows) {
    return (rows || []).map(row => {
      const family = inflate(config.family_fields, row[0]);
      return {
        ...family,
        blocked: Boolean(family.display_blocked),
        match_classes: row[1] || [], matched_forms: row[2] || [],
        matched_form_evidence: row[3] ? inflate(config.form_fields, row[3]) : null,
      };
    });
  }

  async function search(submitted) {
    const config = await manifest();
    const normalized = norm(submitted);
    const empty = {submitted_query: submitted, normalized_query: normalized, best_priority: null, best_owner_count: 0, owners: [], alternatives: []};
    if (!normalized) return {status: "UNMATCHED", ...empty, api_version: config.api_version};
    if (submitted === "US") return {...identityResponse(submitted, normalized, "US requires contextual classification and is not counted as the pronoun us.", "COUNTRY_ABBREVIATION_OR_OTHER_CONTEXT_REQUIRED"), api_version: config.api_version};
    if (["i'll", "won't", "hadn't"].includes(apostropheNorm(submitted))) return {...identityResponse(submitted, normalized, "This contraction is retained for review and is not assigned to the similarly spelled family.", "REGISTERED_CONTRACTION_ROUTE"), api_version: config.api_version};
    if (normalized === "does") return {...identityResponse(submitted, normalized, "does requires contextual classification and is retained for review here.", "CONTEXT_REQUIRED_DO_VERB_OR_DOE_PLURAL"), api_version: config.api_version};
    if (config.special_surfaces[normalized]) {
      const owner = inflate(config.family_fields, config.special_surfaces[normalized]);
      owner.blocked = false;
      owner.match_classes = ["FINAL_CANDIDATE_SURFACE_ONLY"];
      owner.matched_forms = [submitted];
      owner.matched_form_evidence = null;
      return {status: "RESOLVED", ...empty, best_priority: 0, best_owner_count: 1, owners: [owner], identity_exception: null, api_version: config.api_version};
    }
    const bucket = await loadGzipJson(`data/search/${searchBucket(normalized)}.json.gz`);
    const record = bucket[normalized];
    if (!record) {
      return {status: "UNMATCHED", ...empty, identity_exception: config.identity_exceptions[normalized] || null, api_version: config.api_version};
    }
    const owners = expandOwners(config, record[1]);
    const alternatives = expandOwners(config, record[2]);
    const allowed = owners.filter(owner => !owner.blocked);
    return {
      status: allowed.length === 0 ? "BLOCKED" : allowed.length > 1 ? "AMBIGUOUS" : "RESOLVED",
      submitted_query: submitted, normalized_query: normalized, best_priority: record[0],
      best_owner_count: allowed.length, owners, alternatives, identity_exception: null,
      api_version: config.api_version,
    };
  }

  async function resolveOccurrences(payload) {
    const config = await manifest();
    const occurrences = payload?.occurrences;
    if (!Array.isArray(occurrences) || occurrences.length > 500) throw new Error("occurrences must be a list with at most 500 records");
    const unique = new Map();
    for (const item of occurrences) {
      if (item?.token_status !== "UNSUPPORTED_TOKEN" && item?.normalized_token) {
        const key = String(item.surface || item.normalized_token);
        if (!unique.has(key)) unique.set(key, search(key));
      }
    }
    await Promise.all(unique.values());
    const output = [];
    for (const item of occurrences) {
      const base = Object.fromEntries(["occurrence_id", "surface", "normalized_token", "start_offset", "end_offset", "occurrence_order", "token_status", "failure_reason"].map(key => [key, item?.[key] ?? null]));
      if (item?.token_status === "UNSUPPORTED_TOKEN" || !item?.normalized_token) {
        output.push({...base, status: "UNSUPPORTED", best_owner_count: 0, owners: [], alternatives: [], identity_exception: null});
      } else {
        const result = await unique.get(String(item.surface || item.normalized_token));
        output.push({...base, ...Object.fromEntries(["status", "best_priority", "best_owner_count", "owners", "alternatives", "identity_exception"].map(key => [key, result[key]]))});
      }
    }
    return {api_version: config.api_version, occurrences: output, occurrence_count: output.length};
  }

  async function request(path, options = {}) {
    const config = await manifest();
    const url = new URL(path, location.href);
    if (url.pathname.endsWith("/filters")) return config.filters;
    if (url.pathname.endsWith("/meta")) return {api_version: config.api_version, database_mode: "static read-only", metadata: config.metadata};
    if (url.pathname.endsWith("/sources")) return {api_version: config.api_version, sources: config.sources, fields: config.fields};
    if (url.pathname.endsWith("/families")) return browse(url.searchParams);
    if (url.pathname.includes("/families/")) return detail(decodeURIComponent(url.pathname.split("/families/")[1]));
    if (url.pathname.endsWith("/search")) return search(url.searchParams.get("q") || "");
    if (url.pathname.endsWith("/occurrences/resolve") || url.pathname.endsWith("/resolve-text")) return resolveOccurrences(JSON.parse(options.body || "{}"));
    throw new Error(`Unsupported static request: ${path}`);
  }

  window.HKELE_STATIC_API = {request, manifest};
})();
