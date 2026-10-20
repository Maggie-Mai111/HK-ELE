(function(root) {
  "use strict";
  function refresh(item, detail) {
    const family = detail.family;
    const normalize = word => String(word).normalize("NFKC").trim().toLocaleLowerCase();
    const accepted = new Set(detail.forms.map(form => normalize(form.normalized_form)));
    const pronoun = family.baseword_key === "trial:pronoun:i" || family.baseword_key === "trial:pronoun:us";
    if (!item.selected_forms.every(form => accepted.has(normalize(form)) || (pronoun && normalize(form) === normalize(family.display_family))))
      return {...item, data_review_status:"Saved selection kept — please check the word and family."};
    return {...item, previous_evidence:item.previous_evidence || {...item}, data_review_status:null,
      data_version:family.data_version, display_family:family.display_family, set_membership:family.set_membership,
      overall_frequency_order:family.overall_frequency_order, overall_frequency_value:family.overall_frequency_value,
      general_evidence_status:family.general_evidence_status, general_zipf:family.bawf_family_zipf,
      educational_tokens:family.educational_tokens, ice_hk_tokens:family.ice_hk_tokens,
      glowbe_hk_tokens:family.glowbe_hk_tokens, now_hk_tokens:family.now_hk_tokens,
      hk_corpus_frequency_rank:family.current_hk_frequency_rank, hk_corpus_frequency_band:family.current_hk_frequency_band};
  }
  root.HKELE_LESSON_DATA_REFRESH = {refresh};
})(globalThis);
