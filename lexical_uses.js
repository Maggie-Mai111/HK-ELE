(function(exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopeText = scopeText;
exports.recordedUseSummary = recordedUseSummary;
/** Format recorded lexical conditions without exposing their object field names. */
const engineering = /chief-reviewed|authorized_scope_id|source[_ -](?:record|row|token|identity|bearer)|canonical (?:endpoint|lexical|target|head|noun)|identity (?:merge|restored|retained|selected|selection)|(?:named|surname|organization|substance|noun|lexical) identity|complete.{0,80}identity|independent.{0,60}identity|frequency (?:transfer|allocation)|explicitly typed|independently reviewed|accepted source identity|inherited.{0,60}(?:restriction|condition)|prior constraints|compiled|postimage|preimage|quarantin|default (?:admission|channel)|ordinary modern admission|source qualifier|denotation boundary|source-only|exact independently|edition-specific literal|source[_ -]scope|supplemental identity|owner[_ -]key|semantic_identity|record_id|inflection relation establishes|relation decision|no automatic modern|family relationship|synonym mapping|provenance-conditioned|endpoint|[a-f0-9]{64}/i;
const semanticKeys = new Set(["glosses", "gloss", "definition", "meaning", "exact_meaning", "exact_old_meaning", "only_exact_source_denotation", "compatible_canonical_application", "exact_quoted_old_reading", "old_free_reading", "only_old_free_application_outside_current_construction", "excluding_current_construction", "exclude_current_construction", "only_outside_current_construction", "only_region", "outside_region"]);
const usageTag = /^(?:obsolete|archaic|historical|rare|nonstandard|informal|slang|dialectal|regional|abbreviation|proper-name|US|UK|British|American|Scottish|Scotland|Australia|Australian|New Zealand|Canadian)$/i;
function scopeText(value) {
    if (typeof value === "string") {
        const quoted = value.match(/^Only the lexically established \w+ independent reading of [^:]+: ([\s\S]*?)\.\s*Preserve quoted register;/);
        if (quoted)
            return scopeText(quoted[1]);
        const named = value.match(/^Whole exact ([\w -]+?) (surname|name) identity\b/);
        if (named)
            return (named[2] === "surname" ? "Surname: " : "Name: ") + named[1] + ".";
        const start = value.indexOf("Supported readings:");
        if (start >= 0) {
            const open = value.indexOf("[", start);
            for (let end = value.lastIndexOf("]"); open >= 0 && end > open; end = value.lastIndexOf("]", end - 1)) {
                try {
                    return scopeText(JSON.parse(value.slice(open, end + 1)));
                }
                catch { /* Try the preceding complete JSON array. */ }
            }
        }
        return engineering.test(value) || /[{}]|\\"(?:POS|source_word|alt_of)\\"/.test(value) ? "" : value;
    }
    if (Array.isArray(value))
        return value.map(scopeText).filter(Boolean).join(" ");
    if (!value || typeof value !== "object")
        return "";
    const labels = {
        excluding_current_construction: "Except: ", exclude_current_construction: "Except: ",
        only_outside_current_construction: "Outside this construction: ",
        only_region: "In: ", outside_region: "Outside: ",
    };
    const text = Object.entries(value).filter(([key]) => semanticKeys.has(key))
        .map(([key, item]) => { const text = scopeText(item); return text ? (labels[key] ?? "") + text : ""; })
        .filter(Boolean).join(" ");
    const tags = value.tags;
    const labelsForUse = Array.isArray(tags) ? tags.filter((tag) => typeof tag === "string" && usageTag.test(tag)) : [];
    return text ? (labelsForUse.length ? labelsForUse.join(", ") + " — " : "") + text : "";
}
function recordedUseSummary(condition, channel = "default") {
    const fallback = channel === "limited" ? "Special use — check the meaning in your text." : "";
    try {
        const data = JSON.parse(condition);
        return scopeText(data.exact_target_readings?.length ? data.exact_target_readings : data.defined_scope ?? data.inherited_exact_condition) || fallback;
    }
    catch {
        return scopeText(condition) || fallback;
    }
}

})(globalThis.HKELE_USE_PRESENTATION={});
/* Optional exact-spelling uses; raw branch identities and conditions remain in data. */
(function(root){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function summary(row){return root.HKELE_USE_PRESENTATION.recordedUseSummary(row.condition,row.channel);}
  async function mount(host,word,familyKey){
    if(!host||!word||!root.HKELE_LEXICAL_USE_DATA)return;
    const rows=await root.HKELE_LEXICAL_USE_DATA(word);
    if(!host.isConnected)return;
    const relevant=rows.filter(r=>(!familyKey||r.analysis_family===familyKey||r.analysis_family===null)&&(r.requires_context||r.channel==='limited')&&summary(r));
    const unique=[...new Map(relevant.map(r=>[r.channel+'\t'+summary(r),r])).values()];
    if(!unique.length){host.replaceChildren();return;}
    host.innerHTML='<details class="workspace-disclosure"><summary>Recorded uses</summary><div class="word-origins-body">'+unique.map(r=>'<div class="word-origin-item"><strong>'+(r.channel==='limited'?'Special use':'Meaning and use')+'</strong><p>'+esc(summary(r))+'</p></div>').join('')+'</div></details>';
  }
  root.HKELE_LEXICAL_USES={mount,summary};
})(globalThis);
