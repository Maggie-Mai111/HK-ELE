(() => {
  "use strict";

  const TOKENIZER_ID = "P69-TEXT-CHECK-PAIRED-QUOTES-1.3.0";
  const REGISTERED_APOSTROPHES = Object.freeze({"\u2018": "U+2018_TO_U+0027", "\u2019": "U+2019_TO_U+0027"});
  const SAFE_SEPARATORS = Object.freeze({
    "\u201c": "U+201C_SAFE_SEPARATOR",
    "\u201d": "U+201D_SAFE_SEPARATOR",
    "\u2013": "U+2013_SAFE_SEPARATOR",
    "\u2014": "U+2014_SAFE_SEPARATOR",
    "\u2026": "U+2026_SAFE_SEPARATOR",
    "\u00a0": "U+00A0_SAFE_SEPARATOR",
  });
  const TOKEN_CANDIDATE_PATTERN = /[\p{L}\p{M}]+(?:['\u2018\u2019](?:[\p{L}\p{M}]+|(?=$|[^\p{L}\p{M}])))?/gu;
  const SUPPORTED_SURFACE_PATTERN = /^[A-Za-z]+(?:['\u2018\u2019](?:[A-Za-z]+)?)?$/;
  const ASCII_LETTER = /[A-Za-z]/;

  class TokenizerError extends Error {
    constructor(issues) {
      super("An unregistered character or word shape was found. Matching is paused until that item is removed or replaced.");
      this.name = "TokenizerError";
      this.code = "UNREGISTERED_CHARACTER_FAIL_CLOSED";
      this.issues = issues;
    }
  }

  function codePointLabel(char) {
    return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
  }

  // Mask only paired external quotation marks, preserving original UTF-16 offsets.
  // Word-internal and unpaired trailing apostrophes remain part of the surface.
  function externalQuoteOffsets(text) {
    const offsets = new Set();
    let opening = null;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i], before = text[i - 1] || "", after = text[i + 1] || "";
      if (char === "\n" || char === "\r") { opening = null; continue; }
      if (!"'\u2018\u2019".includes(char)) continue;
      if (/[\p{L}\p{M}]/u.test(before) && /[\p{L}\p{M}]/u.test(after)) continue;
      if (opening !== null && (char === "\u2019" || (char === "'" && text[opening] === "'")) && !/[\p{L}\p{M}]/u.test(after)) {
        // In a quoted phrase, retain a plural possessive before another word
        // when a later closing quote is available within this same quotation.
        const tail = text.slice(i + 1).split(/[\r\n]/, 1)[0];
        const laterClose = tail.indexOf(char);
        const nextOpen = tail.search(/(?:^|[^\p{L}\p{M}])['\u2018](?=[\p{L}\p{M}])/u);
        if (/[sS]/.test(before) && /^\s+[A-Za-z]/.test(tail) && laterClose >= 0 && (nextOpen < 0 || laterClose < nextOpen)) continue;
        offsets.add(opening); offsets.add(i); opening = null;
      } else if (opening === null && (char === "\u2018" || char === "'") && !/[\p{L}\p{M}\d]/u.test(before) && /[^\s]/.test(after)) {
        opening = i;
      }
    }
    return offsets;
  }

  function quotationMask(text) {
    const offsets = externalQuoteOffsets(text);
    return {offsets, masked: text.split("").map((char, index) => offsets.has(index) ? " " : char).join("")};
  }

  function inspectUnsupported(text) {
    text = quotationMask(text).masked;
    const issues = [];
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const code = char.charCodeAt(0);
      if (code <= 0x7f && (code >= 0x20 || char === "\t" || char === "\n" || char === "\r")) continue;
      if (Object.hasOwn(SAFE_SEPARATORS, char)) continue;
      if (REGISTERED_APOSTROPHES[char] && ASCII_LETTER.test(text[index - 1] || "")) continue;
      if (/^[\p{L}\p{M}]$/u.test(char)) continue;
      issues.push({offset: index, character: char, code_point: codePointLabel(char), reason: REGISTERED_APOSTROPHES[char] ? "REGISTERED_APOSTROPHE_OUTSIDE_ENGLISH_WORD" : "UNREGISTERED_CHARACTER"});
    }
    for (const match of text.matchAll(/[\p{L}\p{M}'\u2018\u2019]+/gu)) {
      const apostrophes = [...match[0]].filter(char => char === "'" || Object.hasOwn(REGISTERED_APOSTROPHES, char));
      if (apostrophes.length > 1) issues.push({offset: match.index, character: match[0], code_point: "WORD_SHAPE", reason: "UNSUPPORTED_MULTIPLE_APOSTROPHES"});
    }
    return issues;
  }

  function separatorAudit(text) {
    const events = [];
    const quotes = externalQuoteOffsets(text);
    for (let index = 0; index < text.length; index += 1) {
      const surface = text[index];
      const processingRuleId = quotes.has(index) ? "PAIRED_EXTERNAL_SINGLE_QUOTE" : SAFE_SEPARATORS[surface];
      if (!processingRuleId) continue;
      events.push({
        separator_id: `sep-${String(events.length + 1).padStart(4, "0")}`,
        surface,
        code_point: codePointLabel(surface),
        start_offset: index,
        end_offset: index + 1,
        processing_rule_id: processingRuleId,
      });
    }
    return events;
  }

  function normalizeSurface(surface) {
    const rules = ["ASCII_CASEFOLD_LOWER"];
    let normalized = "";
    for (const char of surface) {
      if (REGISTERED_APOSTROPHES[char]) {
        normalized += "'";
        if (!rules.includes(REGISTERED_APOSTROPHES[char])) rules.push(REGISTERED_APOSTROPHES[char]);
      } else {
        normalized += char.toLowerCase();
      }
    }
    if (surface.includes("'")) rules.push("U+0027_PRESERVED");
    return {normalized_token: normalized, normalization_rule_ids: rules};
  }

  function scan(text, maxOccurrences = 500) {
    const issues = inspectUnsupported(text);
    if (issues.length) throw new TokenizerError(issues);
    const occurrences = [];
    const scanText = quotationMask(text).masked;
    let match;
    TOKEN_CANDIDATE_PATTERN.lastIndex = 0;
    while ((match = TOKEN_CANDIDATE_PATTERN.exec(scanText)) !== null) {
      const surface = match[0];
      const supported = SUPPORTED_SURFACE_PATTERN.test(surface);
      const normalized = supported ? normalizeSurface(surface) : {normalized_token: null, normalization_rule_ids: ["UNSUPPORTED_NON_ASCII_TOKEN_PRESERVED"]};
      occurrences.push({
        occurrence_id: `occ-${String(occurrences.length + 1).padStart(4, "0")}`,
        token_status: supported ? "SUPPORTED_TOKEN" : "UNSUPPORTED_TOKEN",
        surface,
        normalized_token: normalized.normalized_token,
        normalization_rule_ids: normalized.normalization_rule_ids,
        start_offset: match.index,
        end_offset: match.index + surface.length,
        occurrence_order: occurrences.length + 1,
        failure_reason: supported ? null : "NON_ASCII_LETTER_TOKEN",
      });
      if (occurrences.length > maxOccurrences) throw new Error(`The technical limit is ${maxOccurrences} recognized occurrences. Shorten the text and try again.`);
    }
    return {occurrences, separator_events: separatorAudit(text)};
  }

  function tokenize(text, maxOccurrences = 500) {
    return scan(text, maxOccurrences).occurrences;
  }

  globalThis.HKELE_TOKENIZER = Object.freeze({TOKENIZER_ID, REGISTERED_APOSTROPHES, SAFE_SEPARATORS, TokenizerError, inspectUnsupported, separatorAudit, normalizeSurface, scan, tokenize});
})();
