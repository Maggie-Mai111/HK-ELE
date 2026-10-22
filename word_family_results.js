(function (root) {
  "use strict";
  const DATA_VERSION = "2026-10-20-a-main-v1";
  const VERSION = "a-main-word-frequency-20261022-v1";
  const DATA_ROOT = `data/word-forms/${VERSION}/`;
  const MANIFEST_HASH = "4e9d41cb8ca5a602247017e2bb8b241fa70c88136c9e09415a5436c9e37dee64";
  const normalize = value => String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[’‘ʼ＇]/g, "'");
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  function frequency(record) {
    const parts = [count(record?.[0]), count(record?.[1])].filter(value => value !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  }
  function sortedForms(forms, query, records = {}, sort = "frequency-desc") {
    const target = normalize(query);
    return forms.map(form => ({form, isSearch: normalize(form.form) === target || normalize(form.normalized_form) === target,
      frequency: frequency(records[form.normalized_form])})).sort((a, b) => {
      if (a.isSearch !== b.isSearch) return a.isSearch ? -1 : 1;
      if (sort === "az" || sort === "za") return (sort === "za" ? -1 : 1) * normalize(a.form.form).localeCompare(normalize(b.form.form), "en");
      if (a.frequency === null || b.frequency === null) {
        if (a.frequency !== b.frequency) return a.frequency === null ? 1 : -1;
      } else if (a.frequency !== b.frequency) return (sort === "frequency-asc" ? 1 : -1) * (a.frequency - b.frequency);
      return normalize(a.form.form).localeCompare(normalize(b.form.form), "en");
    });
  }
  function bucket(key) {
    let h = 2166136261;
    for (const byte of new TextEncoder().encode(key)) h = Math.imul(h ^ byte, 16777619) >>> 0;
    return h % 128;
  }
  function createReader(fetcher = (...args) => root.fetch(...args)) {
    let manifestPromise;
    const cache = new Map();
    const hash = async bytes => Array.from(new Uint8Array(await root.crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
    async function getBytes(name) {
      const response = await fetcher(DATA_ROOT + name, {cache:"force-cache"});
      if (!response.ok) throw new Error("Word frequencies could not be loaded.");
      return response.arrayBuffer();
    }
    async function manifest() {
      manifestPromise ??= (async () => {
        const text = new TextDecoder("utf-8", {fatal:true}).decode(await getBytes("manifest.json"));
        if (await hash(new TextEncoder().encode(text.replace(/\r\n/g, "\n"))) !== MANIFEST_HASH) throw new Error("Please reload the word frequencies.");
        const value = JSON.parse(text);
        if (value.dataVersion !== DATA_VERSION || value.version !== VERSION || value.buckets !== 128) throw new Error("Please reload the word frequencies.");
        return value;
      })().catch(error => {manifestPromise = null; throw error;});
      return manifestPromise;
    }
    async function load(key) {
      const name = `${String(bucket(key)).padStart(3, "0")}.json.gz`;
      if (!cache.has(name)) cache.set(name, (async () => {
        const meta = await manifest(), bytes = await getBytes(name);
        if (await hash(bytes) !== meta.files[name]) throw new Error("Please reload the word frequencies.");
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        const data = JSON.parse(await new Response(stream).text());
        if (data.dataVersion !== DATA_VERSION || data.version !== VERSION) throw new Error("Please reload the word frequencies.");
        return data.families;
      })().catch(error => {cache.delete(name); throw error;}));
      return (await cache.get(name))[key] || {};
    }
    return Object.freeze({load, manifest});
  }
  // An old request must not replace a newer query, scope, or page navigation.
  function createRequestGate() {
    let ticket = 0;
    return {next:() => ++ticket, cancel:() => ++ticket, current:value => value === ticket};
  }
  root.HKELE_WORD_FAMILY_RESULTS = Object.freeze({normalize, frequency, sortedForms, bucket, createReader, createRequestGate});
})(globalThis);
