(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HKELE_AI_FILTER_CONTRACT = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const GRADES = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2", "S3"]);
  const HK_BANDS = Object.freeze(["HK Top 1k", "HK Top 2k", "HK Top 3k", "HK Top 5k", "HK Top 10k"]);
  const MSVL_SUBJECTS = Object.freeze([
    "English Grammar and Writing", "Health", "Mathematics", "Science", "Social Studies and History",
  ]);
  const FILTER_KEYS = Object.freeze([
    "scope", "earliestObservedFrom", "earliestObservedTo", "overallRankMin", "overallRankMax",
    "hkRankMin", "hkRankMax", "hkBands", "prefix", "suffix", "root", "awl", "msvl",
    "msvlSubjects", "externalLevels", "cpb100", "limit", "sort",
  ]);
  const RESULT_KEYS = new Set(["status", "summary", "filters", "clarifyingQuestion", "warnings"]);
  const FILTER_KEY_SET = new Set(FILTER_KEYS);

  class ValidationError extends Error {
    constructor(message) { super(message); this.name = "AiFilterValidationError"; }
  }

  const objectValue = (value, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${label} must be an object.`);
    return value;
  };
  const rejectUnknown = (record, allowed, label) => {
    if (Object.keys(record).some(key => !allowed.has(key))) throw new ValidationError(`${label} contains unknown fields.`);
  };
  const boundedString = (value, label, maximum, allowEmpty = false) => {
    if (typeof value !== "string") throw new ValidationError(`${label} must be text.`);
    const result = value.trim();
    if ((!allowEmpty && !result) || result.length > maximum) throw new ValidationError(`${label} is outside its allowed length.`);
    return result;
  };
  const enumValue = (value, allowed, label) => {
    if (typeof value !== "string" || !allowed.includes(value)) throw new ValidationError(`${label} is not allowlisted.`);
    return value;
  };
  const integer = (value, label, minimum, maximum) => {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new ValidationError(`${label} is outside its allowed range.`);
    return value;
  };
  const optionalInteger = (record, key, minimum, maximum) => record[key] === undefined ? undefined : integer(record[key], key, minimum, maximum);
  const optionalBoolean = (record, key) => {
    if (record[key] === undefined) return undefined;
    if (typeof record[key] !== "boolean") throw new ValidationError(`${key} must be boolean.`);
    return record[key];
  };
  const optionalControlledText = (record, key) => {
    if (record[key] === undefined) return undefined;
    const text = boundedString(record[key], key, 32);
    if (/\r|\n|[{};]/.test(text)) throw new ValidationError(`${key} contains forbidden syntax.`);
    return text.replace(/^[-–—]+|[-–—]+$/g, "").trim();
  };
  const optionalEnumArray = (record, key, allowed, maximum) => {
    const value = record[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length === 0 || value.length > maximum) throw new ValidationError(`${key} must be a non-empty bounded array.`);
    const result = value.map(item => enumValue(item, allowed, key));
    if (new Set(result).size !== result.length) throw new ValidationError(`${key} has duplicates.`);
    return result;
  };
  const optionalStringArray = (record, key, maximumItems, maximumLength, allowEmpty = false) => {
    const value = record[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maximumItems) throw new ValidationError(`${key} must be a non-empty bounded array.`);
    const result = value.map(item => boundedString(item, key, maximumLength));
    if (new Set(result.map(item => item.toLocaleLowerCase())).size !== result.length) throw new ValidationError(`${key} has duplicates.`);
    return result;
  };

  function validateConditions(value) {
    const record = objectValue(value, "filters");
    rejectUnknown(record, FILTER_KEY_SET, "filters");
    const result = {
      scope: enumValue(record.scope, ["candidate", "inclusive_reference"], "scope"),
      limit: integer(record.limit, "limit", 1, 100),
      sort: enumValue(record.sort, ["overall", "hk", "az"], "sort"),
    };
    const assign = (key, item) => { if (item !== undefined) result[key] = item; };
    assign("earliestObservedFrom", record.earliestObservedFrom === undefined ? undefined : enumValue(record.earliestObservedFrom, GRADES, "earliestObservedFrom"));
    assign("earliestObservedTo", record.earliestObservedTo === undefined ? undefined : enumValue(record.earliestObservedTo, GRADES, "earliestObservedTo"));
    assign("overallRankMin", optionalInteger(record, "overallRankMin", 1, 163570));
    assign("overallRankMax", optionalInteger(record, "overallRankMax", 1, 163570));
    assign("hkRankMin", optionalInteger(record, "hkRankMin", 1, 163570));
    assign("hkRankMax", optionalInteger(record, "hkRankMax", 1, 163570));
    assign("hkBands", optionalEnumArray(record, "hkBands", HK_BANDS, 5));
    for (const key of ["prefix", "suffix", "root"]) assign(key, optionalControlledText(record, key));
    assign("awl", optionalBoolean(record, "awl"));
    assign("msvl", optionalBoolean(record, "msvl"));
    assign("msvlSubjects", optionalEnumArray(record, "msvlSubjects", MSVL_SUBJECTS, 5));
    assign("externalLevels", optionalStringArray(record, "externalLevels", 3, 32));
    assign("cpb100", optionalBoolean(record, "cpb100"));
    if (result.overallRankMin && result.overallRankMax && result.overallRankMin > result.overallRankMax) throw new ValidationError("overall rank range is reversed.");
    if (result.hkRankMin && result.hkRankMax && result.hkRankMin > result.hkRankMax) throw new ValidationError("HK rank range is reversed.");
    const from = result.earliestObservedFrom ? GRADES.indexOf(result.earliestObservedFrom) : -1;
    const to = result.earliestObservedTo ? GRADES.indexOf(result.earliestObservedTo) : -1;
    if (from >= 0 && to >= 0 && from > to) throw new ValidationError("grade range is reversed.");
    return result;
  }

  function validateResult(value) {
    const record = objectValue(value, "result");
    rejectUnknown(record, RESULT_KEYS, "result");
    const status = enumValue(record.status, ["ready", "needs_clarification", "unsupported"], "status");
    const summary = boundedString(record.summary, "summary", 100);
    const warnings = optionalStringArray(record, "warnings", 2, 60, true) || [];
    const filters = record.filters === null ? null : validateConditions(record.filters);
    const clarifyingQuestion = record.clarifyingQuestion === null ? null : boundedString(record.clarifyingQuestion, "clarifyingQuestion", 120);
    if (status === "ready" && filters === null) throw new ValidationError("ready requires filters.");
    if (status !== "ready" && filters !== null) throw new ValidationError("non-ready results may not apply filters.");
    if (status === "needs_clarification" && clarifyingQuestion === null) throw new ValidationError("needs_clarification requires a question.");
    return {status, summary, filters, clarifyingQuestion, warnings};
  }

  const normalize = value => String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  const tokens = value => normalize(value).split(/[|;,·/]+/).map(item => item.trim().replace(/^[-–—]+|[-–—]+$/g, "")).filter(Boolean);
  const hasFlag = value => value === true || value === 1;
  const hasRegisteredValue = value => value !== null && value !== undefined && value !== "" && value !== 0 && value !== false;
  const inRange = (value, minimum, maximum) => minimum === undefined && maximum === undefined ? true : value !== null && Number.isFinite(value) && (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum);
  const includesValue = (value, requested) => tokens(value).includes(normalize(requested).replace(/^[-–—]+|[-–—]+$/g, ""));

  function applyToRows(rows, proposedFilters, index = {}) {
    const filters = validateConditions(proposedFilters);
    const cpbKeys = new Set(index.cpb100_family_keys || []);
    const morphology = index.morphology_by_family || {};
    const from = filters.earliestObservedFrom ? GRADES.indexOf(filters.earliestObservedFrom) : -1;
    const to = filters.earliestObservedTo ? GRADES.indexOf(filters.earliestObservedTo) : -1;
    const matches = rows.filter(family => {
      if (hasFlag(family.display_blocked)) return false;
      if (filters.scope === "candidate" ? !hasFlag(family.candidate_member) : !hasFlag(family.reference_member)) return false;
      const grade = GRADES.indexOf(family.textbook_first_seen_level);
      if ((from >= 0 || to >= 0) && grade < 0) return false;
      if (from >= 0 && grade < from) return false;
      if (to >= 0 && grade > to) return false;
      if (!inRange(family.overall_frequency_order, filters.overallRankMin, filters.overallRankMax)) return false;
      if (!inRange(family.current_hk_frequency_rank, filters.hkRankMin, filters.hkRankMax)) return false;
      if (filters.hkBands && !filters.hkBands.includes(family.current_hk_frequency_band)) return false;
      const enriched = morphology[family.baseword_key] || {};
      if (filters.prefix && !((enriched.prefix || tokens(family.browse_prefix)).includes(normalize(filters.prefix)))) return false;
      if (filters.suffix && !((enriched.suffix || tokens(family.browse_suffix)).includes(normalize(filters.suffix)))) return false;
      if (filters.root && !((enriched.root || tokens(family.browse_root)).includes(normalize(filters.root)))) return false;
      if (filters.awl !== undefined && hasFlag(family.awl) !== filters.awl) return false;
      if (filters.msvl !== undefined && hasRegisteredValue(family.msvl) !== filters.msvl) return false;
      if (filters.msvlSubjects && !filters.msvlSubjects.some(subject => includesValue(family.msvl, subject))) return false;
      const external = family.browse_external_level_reference ?? family.external_level_reference_display;
      if (filters.externalLevels && !filters.externalLevels.some(level => includesValue(external, level))) return false;
      if (filters.cpb100 !== undefined && cpbKeys.has(family.baseword_key) !== filters.cpb100) return false;
      return true;
    });
    matches.sort((left, right) => {
      if (filters.sort === "az") return left.display_family.localeCompare(right.display_family) || left.baseword_key.localeCompare(right.baseword_key);
      const field = filters.sort === "hk" ? "current_hk_frequency_rank" : "overall_frequency_order";
      return ((left[field] ?? Number.MAX_SAFE_INTEGER) - (right[field] ?? Number.MAX_SAFE_INTEGER)) || left.baseword_key.localeCompare(right.baseword_key);
    });
    const families = matches.slice(0, filters.limit).map(family => {
      const enriched = morphology[family.baseword_key];
      return !enriched ? family : {
        ...family,
        browse_prefix: enriched.prefix?.join(" | ") || family.browse_prefix,
        browse_suffix: enriched.suffix?.join(" | ") || family.browse_suffix,
        browse_root: enriched.root?.join(" | ") || family.browse_root,
      };
    });
    return {filters, matchedBeforeLimit: matches.length, families};
  }

  function describeConditions(filters) {
    const items = [filters.scope === "candidate" ? "Scope: Candidate" : "Scope: Candidate + Reference"];
    if (filters.earliestObservedFrom || filters.earliestObservedTo) items.push(filters.earliestObservedFrom && filters.earliestObservedTo ? `Grade: ${filters.earliestObservedFrom}–${filters.earliestObservedTo}` : filters.earliestObservedFrom ? `Grade: ${filters.earliestObservedFrom} or later` : `Grade: ${filters.earliestObservedTo} or earlier`);
    const range = (label, minimum, maximum) => { if (minimum !== undefined || maximum !== undefined) items.push(minimum !== undefined && maximum !== undefined ? `${label}: ${minimum.toLocaleString("en")}–${maximum.toLocaleString("en")}` : minimum !== undefined ? `${label}: ${minimum.toLocaleString("en")} or lower priority` : `${label}: up to ${maximum.toLocaleString("en")}`); };
    range("Overall rank", filters.overallRankMin, filters.overallRankMax);
    range("HK rank", filters.hkRankMin, filters.hkRankMax);
    if (filters.hkBands) items.push(`HK band: ${filters.hkBands.join(", ")}`);
    for (const [label, key] of [["Prefix", "prefix"], ["Suffix", "suffix"], ["Root", "root"]]) if (filters[key]) items.push(`${label}: ${filters[key]}`);
    if (filters.awl !== undefined) items.push(`AWL: ${filters.awl ? "yes" : "no"}`);
    if (filters.msvl !== undefined) items.push(`MSVL: ${filters.msvl ? "yes" : "no"}`);
    if (filters.msvlSubjects) items.push(`MSVL subject: ${filters.msvlSubjects.join(", ")}`);
    if (filters.cpb100 !== undefined) items.push(`CPB 100: ${filters.cpb100 ? "yes" : "no"}`);
    if (filters.externalLevels) items.push(`External level: ${filters.externalLevels.join(", ")}`);
    items.push(`Sort: ${filters.sort}`, `Result limit: ${filters.limit}`);
    return items;
  }

  return Object.freeze({GRADES, HK_BANDS, MSVL_SUBJECTS, FILTER_KEYS, ValidationError, validateConditions, validateResult, applyToRows, describeConditions});
});
