/* Shared education-reference semantics generated from educationFilters.ts. */
(function(root){const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.US_REFERENCE_LABELS = void 0;
exports.canonicalUsReference = canonicalUsReference;
exports.hasUsReferenceConditions = hasUsReferenceConditions;
exports.validateUsReferenceConditions = validateUsReferenceConditions;
exports.matchesUsReference = matchesUsReference;
exports.describeUsReference = describeUsReference;
exports.hkStageForSchoolYear = hkStageForSchoolYear;
/** The source's 25 categories. Keep source labels and HK/US evidence separate. */
exports.US_REFERENCE_LABELS = Object.freeze([
    "Kindergarten–Grade 1",
    "Grade 1",
    "Grades 1–2",
    "Grade 2",
    "Grades 2–3",
    "Grade 3",
    "Grades 3–4",
    "Grade 4",
    "Grades 4–5",
    "Grade 5",
    "Grades 5–6",
    "Grade 6",
    "Grades 6–7",
    "Grade 7",
    "Grades 7–8",
    "Grade 8",
    "Grades 8–9",
    "Grade 9",
    "Grades 9–10",
    "Grade 10",
    "Grades 10–11",
    "Grade 11",
    "Grades 11–12",
    "Grade 12",
    "Grade 12–College",
]);
const normalized = (value) => String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/\s+/g, " ");
function canonicalUsReference(value) {
    const text = normalized(value);
    const exact = exports.US_REFERENCE_LABELS.find((label) => normalized(label) === text);
    if (exact)
        return exact;
    if (/^(?:college|university|higher education|tertiary|大学|大學|大学阶段|大學階段)$/.test(text))
        return "Grade 12–College";
    if (/^(?:kindergarten|k|kg|幼稚园|幼稚園)$/.test(text))
        return "Kindergarten–Grade 1";
    const cleaned = text
        .replace(/^(?:us|u\.s\.|american)\s+/, "")
        .replace(/^grades?\s*/, "")
        .replace(/^g\s*(?=\d)/, "")
        .replace(/\s*(?:to|through)\s*/g, "-");
    const one = cleaned.match(/^(\d{1,2})$/);
    if (one && Number(one[1]) >= 1 && Number(one[1]) <= 12)
        return `Grade ${Number(one[1])}`;
    const range = cleaned.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (range)
        return (exports.US_REFERENCE_LABELS.find((label) => normalized(label) === `grades ${Number(range[1])}-${Number(range[2])}`) ?? null);
    if (/^12\s*-\s*(?:college|university)$/.test(cleaned))
        return "Grade 12–College";
    return null;
}
function hasUsReferenceConditions(filters) {
    return (filters.externalLevels !== undefined ||
        filters.usGradeFrom !== undefined ||
        filters.usGradeTo !== undefined ||
        filters.usCollege !== undefined);
}
function validateUsReferenceConditions(filters) {
    const numeric = filters.usGradeFrom !== undefined || filters.usGradeTo !== undefined;
    for (const value of [filters.usGradeFrom, filters.usGradeTo])
        if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 12))
            throw new Error("US grades must be Kindergarten (0) to Grade 12.");
    if (filters.usGradeFrom !== undefined &&
        filters.usGradeTo !== undefined &&
        filters.usGradeFrom > filters.usGradeTo)
        throw new Error("US grade range is reversed.");
    if (filters.usGradeMatch !== undefined && !["overlap", "within"].includes(filters.usGradeMatch))
        throw new Error("US grade match mode is invalid.");
    if (filters.usGradeMatch !== undefined && !numeric)
        throw new Error("US grade match needs a grade bound.");
    if (filters.usCollege !== undefined && typeof filters.usCollege !== "boolean")
        throw new Error("US college selector must be boolean.");
    if (filters.externalLevels && (numeric || filters.usCollege !== undefined))
        throw new Error("Choose US source categories or US grade bounds, not both.");
}
function referenceRanges(value) {
    return String(value ?? "")
        .split(/[|;,·/]+/)
        .map((part) => {
        const label = canonicalUsReference(part);
        if (!label)
            return null;
        if (label === "Grade 12–College")
            return { label, from: 12, to: Infinity, college: true };
        if (label === "Kindergarten–Grade 1")
            return { label, from: 0, to: 1, college: false };
        const numbers = label.match(/\d+/g).map(Number);
        return { label, from: numbers[0], to: numbers[numbers.length - 1], college: false };
    })
        .filter((item) => item !== null);
}
function matchesUsReference(value, filters) {
    if (!hasUsReferenceConditions(filters))
        return true;
    const ranges = referenceRanges(value);
    if (filters.externalLevels) {
        const wanted = filters.externalLevels.map(canonicalUsReference);
        return ranges.some((range) => wanted.includes(range.label));
    }
    const numeric = filters.usGradeFrom !== undefined || filters.usGradeTo !== undefined;
    return ranges.some((range) => {
        if (filters.usCollege === false && range.college)
            return false;
        const lower = filters.usGradeFrom ?? 0, upper = filters.usGradeTo ?? Infinity;
        const gradeMatch = numeric &&
            (filters.usGradeMatch === "within"
                ? range.from >= lower && range.to <= upper
                : range.to >= lower && range.from <= upper);
        return (gradeMatch ||
            (filters.usCollege === true && range.college) ||
            (!numeric && filters.usCollege === false && !range.college));
    });
}
function describeUsReference(filters) {
    if (!hasUsReferenceConditions(filters))
        return null;
    if (filters.externalLevels)
        return `US grade reference: ${filters.externalLevels.join(", ")}`;
    const from = filters.usGradeFrom, to = filters.usGradeTo;
    const name = (value) => (value === 0 ? "Kindergarten" : `Grade ${value}`);
    let text = "";
    if (from !== undefined || to !== undefined) {
        if (filters.usGradeMatch === "within")
            text =
                from !== undefined && to !== undefined
                    ? `recorded range within ${name(from)}–${name(to)}`
                    : from !== undefined
                        ? `${name(from)} or higher`
                        : `no higher than ${name(to)}`;
        else
            text =
                from !== undefined && to !== undefined
                    ? from === to
                        ? `includes ${name(from)}`
                        : `overlaps ${name(from)}–${name(to)}`
                    : from !== undefined
                        ? `overlaps ${name(from)} and higher`
                        : `overlaps Kindergarten–${name(to)}`;
    }
    if (filters.usCollege === true)
        text = text ? `${text} or Grade 12–College` : "Grade 12–College";
    if (filters.usCollege === false)
        text = text
            ? `${text}; excluding Grade 12–College`
            : "school grades; excluding Grade 12–College";
    return `US grade reference: ${text}`;
}
/** School-year correspondence is for understanding terms, not replacing evidence. */
function hkStageForSchoolYear(year) {
    return Number.isInteger(year) && year >= 1 && year <= 12
        ? year <= 6
            ? `P${year}`
            : `S${year - 6}`
        : null;
}

root.HKELE_EDUCATION_FILTERS=Object.freeze(exports);})(globalThis);
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HKELE_AI_FILTER_CONTRACT = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const education = globalThis.HKELE_EDUCATION_FILTERS;
  const GRADES = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2", "S3", "S4", "S5", "S6"]);
  const HK_BANDS = Object.freeze(["HK Top 1k", "HK Top 2k", "HK Top 3k", "HK Top 5k", "HK Top 10k"]);
  const MSVL_SUBJECTS = Object.freeze([
    "English Grammar and Writing", "Health", "Mathematics", "Science", "Social Studies and History",
  ]);
  const FILTER_KEYS = Object.freeze([
    "scope", "earliestObservedFrom", "earliestObservedTo", "overallRankMin", "overallRankMax",
    "hkRankMin", "hkRankMax", "hkBands", "prefix", "suffix", "root", "awl", "msvl",
    "msvlSubjects", "externalLevels", "usGradeFrom", "usGradeTo", "usGradeMatch", "usCollege", "cpb100", "limit", "sort",
  ]);
  const RESULT_KEYS = new Set(["status", "summary", "filters", "clarifyingQuestion", "warnings", "requestedScope"]);
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
      scope: enumValue(record.scope, ["full", "candidate", "inclusive_reference"], "scope"),
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
    assign("externalLevels", optionalStringArray(record, "externalLevels", education.US_REFERENCE_LABELS.length, 32));
    if (result.externalLevels) result.externalLevels = [...new Set(result.externalLevels.map(label => {
      const canonical = education.canonicalUsReference(label);
      if (!canonical) throw new ValidationError("US grade reference is not a source category.");
      return canonical;
    }))];
    assign("usGradeFrom", optionalInteger(record, "usGradeFrom", 0, 12));
    assign("usGradeTo", optionalInteger(record, "usGradeTo", 0, 12));
    assign("usGradeMatch", record.usGradeMatch === undefined ? undefined : enumValue(record.usGradeMatch, ["overlap", "within"], "usGradeMatch"));
    assign("usCollege", optionalBoolean(record, "usCollege"));
    try { education.validateUsReferenceConditions(result); }
    catch (error) { throw new ValidationError(error.message); }
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
    return {status, summary, filters, clarifyingQuestion, warnings, ...(record.requestedScope !== undefined ? {requestedScope: record.requestedScope === null ? null : enumValue(record.requestedScope,["full","core","core95"],"requestedScope")} : {})};
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
      if (filters.scope === "candidate" ? !hasFlag(family.candidate_member) : filters.scope === "inclusive_reference" && !hasFlag(family.reference_member)) return false;
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
      if (!education.matchesUsReference(external, filters)) return false;
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

  function describeConditions(filters, scope) {
    const items = [scope === "core95" ? "Scope: 95% list" : scope === "core" ? "Scope: 90% list" : filters.scope === "full" ? "Scope: Full database" : filters.scope === "candidate" ? "Scope: HK-ELE Word List" : "Scope: saved word data (partial)"];
    if (filters.earliestObservedFrom || filters.earliestObservedTo) items.push(filters.earliestObservedFrom && filters.earliestObservedTo ? `First seen in HK textbooks: ${filters.earliestObservedFrom}–${filters.earliestObservedTo}` : filters.earliestObservedFrom ? `First seen in HK textbooks: ${filters.earliestObservedFrom} or later` : `First seen in HK textbooks: ${filters.earliestObservedTo} or earlier`);
    const range = (label, minimum, maximum) => { if (minimum !== undefined || maximum !== undefined) items.push(minimum !== undefined && maximum !== undefined ? `${label}: ${minimum.toLocaleString("en")}–${maximum.toLocaleString("en")}` : minimum !== undefined ? `${label}: ${minimum.toLocaleString("en")} or lower priority` : `${label}: up to ${maximum.toLocaleString("en")}`); };
    range("Overall family rank", filters.overallRankMin, filters.overallRankMax);
    range("HK family rank", filters.hkRankMin, filters.hkRankMax);
    if (filters.hkBands) items.push(`HK band: ${filters.hkBands.join(", ")}`);
    for (const [label, key] of [["Prefix", "prefix"], ["Suffix", "suffix"], ["Root", "root"]]) if (filters[key]) items.push(`${label}: ${filters[key]}`);
    if (filters.awl !== undefined) items.push(`AWL: ${filters.awl ? "yes" : "no"}`);
    if (filters.msvl !== undefined) items.push(`MSVL: ${filters.msvl ? "yes" : "no"}`);
    if (filters.msvlSubjects) items.push(`MSVL subject: ${filters.msvlSubjects.join(", ")}`);
    if (filters.cpb100 !== undefined) items.push(`CPB 100: ${filters.cpb100 ? "yes" : "no"}`);
    const usDescription = education.describeUsReference(filters);
    if (usDescription) items.push(usDescription);
    items.push(`Sort: ${filters.sort}`, `Result limit: ${filters.limit}`);
    return items;
  }

  function teacherScope(query, selected = "full", intent) {
    if (intent?.requestedScope !== undefined) return intent.requestedScope ?? (selected === "core95" ? "core95" : selected === "core" ? "core" : "full");
    if (/95\s*%/.test(query)) return "core95";
    if (/90\s*%/.test(query)) return "core";
    if (/full database|entire database|whole database|完整(?:数据库|词库)|全部词库/i.test(query)) return "full";
    if (/hk[-–]?ele\s+word\s+list|core\s+list|核心词[表库]/i.test(query)) return "core";

    return selected === "core95" ? "core95" : selected === "core" ? "core" : "full";
  }
  function interpreterQuery(query) {
    return query.trim();
  }
  function teacherResult(raw, scope = "full") {
    const result = validateResult(raw);
    const teacherText = text => text.replace(/Candidate\s*(?:and|\+)\s*Reference/gi, "HK-ELE Word List").replace(/Reference[ -]only/gi, "other database").replace(/\bCandidate\b/g, "HK-ELE Word List");
    return {...result, teacherScope:scope, filters:result.filters ? {...result.filters, scope:scope === "core" ? "candidate" : "full"} : null, summary:result.filters ? `${scope === "core95" ? "95% list" : scope === "core" ? "HK-ELE Word List" : "Full database"} words matching these filters.` : teacherText(result.summary), clarifyingQuestion:result.clarifyingQuestion ? teacherText(result.clarifyingQuestion) : null, warnings:result.warnings.map(teacherText)};
  }
  return Object.freeze({GRADES, HK_BANDS, MSVL_SUBJECTS, FILTER_KEYS, ValidationError, validateConditions, validateResult, applyToRows, describeConditions, teacherScope, interpreterQuery, teacherResult});
});
