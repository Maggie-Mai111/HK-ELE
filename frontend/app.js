(() => {
  "use strict";

  const API = "/api/v1";
  const LIST_KEY = "hkele-phase1v-teaching-list-v1";
  const COLUMN_KEY = "hkele-phase1v-columns-v1";
  const columnDefs = [
    ["family", "Word family", true],
    ["status", "Candidate/reference status", true], ["overall", "Overall frequency rank", true],
    ["hk", "HK frequency rank / band", true], ["first_seen", "Earliest observed in HK textbooks", true],
    ["external", "External level reference", true], ["academic", "Academic Word List (AWL)", true],
    ["subjects", "Middle School Vocabulary Lists (MSVL)", true], ["earlier", "Earlier HK list", true],
    ["root", "Root", true], ["root_meaning", "Root meaning", true],
    ["prefix", "Prefix", true], ["suffix", "Suffix", true],
    ["view", "View", true], ["add", "Add", true],
  ];
  const MSVL_LABELS = {
    english: "English Grammar and Writing", health: "Health", math: "Mathematics",
    mathematics: "Mathematics", science: "Science", social_and_history: "Social Studies and History",
    "soc/hist": "Social Studies and History", "social studies": "Social Studies and History",
    history: "Social Studies and History",
  };
  const MSVL_ORDER = ["English Grammar and Writing", "Health", "Mathematics", "Science", "Social Studies and History"];
  const state = {
    scope: "core", sort: "overall", page: 1, pageSize: 25, total: 0, rows: [],
    selected: loadList(), columns: loadColumns(), detail: null, selectedForm: "", formFilter: "",
    formFilters: {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()},
    textFilters: {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()},
    textFilterOptions: {hk:[], first:[], external:[], academic:[]},
    filterConfig: null, commonTokens: new Set(), textAudit: [], textItems: [],
  };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const blank = value => value === null || value === undefined || String(value).trim() === "";
  const shown = value => blank(value) ? "—" : esc(value);
  const integer = value => blank(value) ? "—" : Number(value).toLocaleString();
  const decimal = value => blank(value) ? "—" : Number(value).toLocaleString(undefined, {maximumFractionDigits: 6});
  const overallRank = value => blank(value) ? "Unranked" : integer(value);
  const generalAvailability = family => family.general_evidence_status === "UNAVAILABLE_NOT_ZERO" ? "Unavailable — not zero" : blank(family.bawf_family_zipf) ? "Unavailable" : "Available";
  const browseShown = value => blank(value) ? "—" : esc(value);
  const browseInteger = value => blank(value) ? "—" : Number(value).toLocaleString();
  const browseYes = value => value === true || value === 1 ? "Yes" : "—";
  const normalized = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  const yes = value => value === true || value === 1 ? "Yes" : "—";
  const statusLabel = value => value === "Candidate" ? "Candidate" : value === "Reference only" ? "Reference only" : "Full database";
  const statusClass = value => value === "Candidate" ? "core" : value === "Reference only" ? "reference" : "other";

  function msvlSubjects(...values) {
    const found = new Set();
    values.filter(value => !blank(value)).forEach(value => {
      const text = String(value).replace(/^.*?MSVL:\s*/i, "").trim();
      if (/^all$/i.test(text)) { MSVL_ORDER.forEach(label => found.add(label)); return; }
      text.split(/[;,|]/).map(token => normalized(token)).filter(Boolean).forEach(token => {
        const label = MSVL_LABELS[token];
        if (label) found.add(label);
      });
    });
    return MSVL_ORDER.filter(label => found.has(label));
  }
  function msvlDisplay(...values) {
    const subjects = msvlSubjects(...values);
    return subjects.length ? `MSVL: ${subjects.join("; ")}` : "";
  }
  function hasAwl(form, family) {
    return Boolean(form?.awl || family?.awl || /\bAWL\b/i.test(String(form?.academic_subject_evidence || "")));
  }
  function rankBand(rank, band) {
    const parts = [blank(rank) ? "" : integer(rank), blank(band) ? "" : esc(band)].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }

  function morphologyFromDetail(detail) {
    const family = detail.family, forms = detail.forms || [], displayKey = normalized(family.display_family);
    const representative = forms.find(form => form.normalized_form === displayKey) || forms.find(form => form.normalized_form === family.baseword_key) || forms[0] || null;
    const withheld = String(representative?.phase1c_evidence_withheld_fields || "").toLocaleLowerCase();
    return {
      browse_external_level_reference: family.external_level_reference_display || null,
      browse_root: representative?.root || null,
      browse_root_meaning: representative?.root_meaning_alignment_status === "MATCHED_UNIQUE_EXACT" ? representative?.root_meaning || null : null,
      browse_prefix: representative && !withheld.includes("prefix") ? representative.prefix || null : null,
      browse_suffix: representative && !withheld.includes("suffix") ? representative.suffix || null : null,
    };
  }

  async function enrichBrowseRows(rows) {
    if (rows.every(row => Object.hasOwn(row, "browse_root") && Object.hasOwn(row, "browse_external_level_reference"))) return rows;
    const details = await Promise.all(rows.map(row => json(`/families/${encodeURIComponent(row.baseword_key)}`)));
    return rows.map((row, index) => ({...row, ...morphologyFromDetail(details[index])}));
  }

  function loadList() {
    try { const value = JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function loadColumns() {
    const defaults = Object.fromEntries(columnDefs.map(([key, , initial]) => [key, initial]));
    try { return {...defaults, ...(JSON.parse(localStorage.getItem(COLUMN_KEY) || "null") || {})}; }
    catch { return defaults; }
  }
  function saveList() { localStorage.setItem(LIST_KEY, JSON.stringify(state.selected)); updateListCount(); }
  function saveColumns() { localStorage.setItem(COLUMN_KEY, JSON.stringify(state.columns)); }
  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 1800); }
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, options);
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Request failed (${response.status})`);
    return response;
  }
  async function json(path, options = {}) { return (await api(path, options)).json(); }

  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    if (name !== "word") location.hash = name;
    if (name === "list") renderList();
    window.scrollTo({top: 0, behavior: "instant"});
  }

  function buildColumnMenu() {
    const fixed = new Set(["family", "view", "add"]);
    $("#column-choices").innerHTML = columnDefs.map(([key, label]) => `<label class="column-choice"><input type="checkbox" data-column="${key}" ${state.columns[key] ? "checked" : ""} ${fixed.has(key) ? "disabled" : ""}> ${esc(label)}</label>`).join("");
    $$('[data-column]').forEach(box => box.addEventListener("change", () => {
      state.columns[box.dataset.column] = box.checked; saveColumns(); renderBrowseTable();
    }));
  }

  function renderBrowseTable() {
    const visible = columnDefs.filter(([key]) => state.columns[key]);
    $("#family-head").innerHTML = visible.map(([key, label]) => `<th data-col="${key}" ${key === "family" ? 'class="family-cell"' : ""}>${esc(label)}</th>`).join("");
    $("#family-body").innerHTML = state.rows.map(row => {
      const cells = {
        family: `<td class="family-cell"><button class="family-link" data-view-family="${esc(row.baseword_key)}">${esc(row.display_family)}</button></td>`,
        status: `<td class="status-cell"><span class="set-pill ${statusClass(row.set_membership)}">${statusLabel(row.set_membership)}</span></td>`,
        overall: `<td class="overall-cell">${browseInteger(row.overall_frequency_order)}</td>`,
        hk: `<td class="hk-cell"><strong>${browseInteger(row.current_hk_frequency_rank)}</strong><span class="hint">${browseShown(row.current_hk_frequency_band)}</span></td>`,
        first_seen: `<td class="evidence-cell first-seen-cell">${browseShown(row.textbook_first_seen_level)}</td>`,
        external: `<td class="evidence-cell external-cell">${browseShown(row.browse_external_level_reference)}</td>`,
        academic: `<td class="evidence-cell academic-cell">${browseYes(row.awl)}</td>`,
        subjects: `<td class="evidence-cell subjects-cell">${browseShown(msvlDisplay(row.msvl))}</td>`,
        earlier: `<td class="earlier-cell">${browseYes(row.earlier_hk)}</td>`,
        root: `<td class="morph-cell root-cell">${browseShown(row.browse_root)}</td>`,
        root_meaning: `<td class="morph-cell root-meaning-cell">${browseShown(row.browse_root_meaning)}</td>`,
        prefix: `<td class="morph-cell affix-cell">${browseShown(row.browse_prefix)}</td>`,
        suffix: `<td class="morph-cell affix-cell">${browseShown(row.browse_suffix)}</td>`,
        view: `<td class="action-cell"><button data-view-family="${esc(row.baseword_key)}">View</button></td>`,
        add: `<td class="action-cell"><button class="primary" data-add-family="${esc(row.baseword_key)}">Add</button></td>`,
      };
      return `<tr>${visible.map(([key]) => cells[key]).join("")}</tr>`;
    }).join("");
    $$('[data-view-family]').forEach(button => button.addEventListener("click", () => openFamily(button.dataset.viewFamily)));
    $$('[data-add-family]').forEach(button => button.addEventListener("click", () => addFamilyByKey(button.dataset.addFamily)));
  }

  async function loadFamilies() {
    try {
      const data = await json(`/families?scope=${state.scope}&sort=${state.sort}&page=${state.page}&page_size=${state.pageSize}`);
      state.rows = await enrichBrowseRows(data.families); state.total = data.available_items; renderBrowseTable();
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      $("#page-label").textContent = `Page ${state.page} of ${pages}`;
      $("#prev-page").disabled = state.page <= 1; $("#next-page").disabled = state.page >= pages;
    } catch (error) { $("#family-body").innerHTML = `<tr><td>${esc(error.message)}</td></tr>`; }
  }

  function exactForm(detail) {
    const target = normalized(state.selectedForm);
    return detail?.forms.find(form => form.normalized_form === target) || detail?.forms[0] || null;
  }
  function connections(form, family) {
    return [hasAwl(form, family) ? "AWL" : "", msvlDisplay(form?.msvl, family?.msvl, form?.academic_subject_evidence)].filter(Boolean).join(" · ");
  }
  function evidenceItem(label, value) { return `<div class="evidence-item"><span>${esc(label)}</span><strong>${shown(value)}</strong></div>`; }
  function resultEvidenceLabel(label, value) { return blank(value) ? "" : `<span class="result-evidence-label">${esc(label)}: ${esc(value)}</span>`; }
  function resultEvidence(owner, evidence, item) {
    const hk = blank(owner?.current_hk_frequency_rank) && blank(owner?.current_hk_frequency_band) ? "" : [blank(owner.current_hk_frequency_rank) ? "" : integer(owner.current_hk_frequency_rank), owner.current_hk_frequency_band || ""].filter(Boolean).join(" · ");
    const subject = item ? subjectText(item) : [hasAwl(evidence, owner) ? "AWL" : "", msvlDisplay(evidence?.msvl, owner?.msvl, evidence?.academic_subject_evidence)].filter(Boolean).join(" · ");
    return [`<span class="set-pill ${statusClass(owner.set_membership)}">${statusLabel(owner.set_membership)}</span>`, resultEvidenceLabel("Overall rank", blank(owner.overall_frequency_order) ? "" : integer(owner.overall_frequency_order)), resultEvidenceLabel("HK rank / band", hk), resultEvidenceLabel("Earliest HK textbook observation", evidence?.first_seen_hk_textbooks), resultEvidenceLabel("External level", evidence?.external_level_reference), resultEvidenceLabel("AWL / MSVL / subject", subject)].filter(Boolean).join("");
  }

  function distinct(values) {
    return [...new Set(values.filter(value => !blank(value)).map(value => String(value)))].sort((a, b) => a.localeCompare(b, undefined, {numeric:true}));
  }
  function filterSummary(selected) {
    if (!selected.size) return "All";
    if (selected.size === 1) return [...selected][0];
    return `${selected.size} selected`;
  }
  function multiFilterMarkup(id, label, options, selected) {
    const choices = distinct(options);
    return `<details class="multi-filter" data-filter-details="${esc(id)}"><summary><span>${esc(label)}</span><strong>${esc(filterSummary(selected))}</strong></summary><div class="multi-filter-menu">${choices.map(value => `<label><input type="checkbox" value="${esc(value)}" ${selected.has(value) ? "checked" : ""}> <span>${esc(value)}</span></label>`).join("")}</div></details>`;
  }
  function bindMultiFilter(host, selected, onChange) {
    host.querySelectorAll('input[type="checkbox"]').forEach(box => box.addEventListener("change", () => {
      if (box.checked) selected.add(box.value); else selected.delete(box.value);
      const summary = host.querySelector("summary strong"); if (summary) summary.textContent = filterSummary(selected);
      onChange();
    }));
  }
  function academicTags(form, family) {
    const tags = new Set(msvlSubjects(form?.msvl, family?.msvl, form?.academic_subject_evidence));
    if (hasAwl(form, family)) tags.add("AWL");
    if (tags.size && [...tags].some(value => MSVL_ORDER.includes(value))) tags.add("MSVL");
    return tags;
  }
  function selectedMatches(value, selected, matcher = (actual, wanted) => normalized(actual) === normalized(wanted)) {
    if (!selected.size) return true;
    return [...selected].some(wanted => wanted === "No record" ? blank(value) : matcher(value, wanted));
  }
  function selectedAcademicMatches(form, family, selected) {
    if (!selected.size) return true;
    const tags = academicTags(form, family);
    return [...selected].some(value => value === "No record" ? tags.size === 0 : tags.has(value));
  }

  async function openFamily(key, selected = "") {
    try {
      state.detail = await json(`/families/${encodeURIComponent(key)}`);
      state.selectedForm = selected || state.detail.family.display_family;
      if (!state.detail.forms.some(form => form.normalized_form === normalized(state.selectedForm))) state.selectedForm = state.detail.forms[0]?.form || "";
      state.formFilter = "";
      state.formFilters = {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()};
      renderWord(); showView("word");
    } catch (error) { toast(error.message); }
  }

  function firstSeenMatches(actual, wanted) {
    if (wanted === "Primary") return /^P[1-6]$/i.test(actual || "");
    if (wanted === "Secondary") return /^S[1-6]$/i.test(actual || "");
    return normalized(actual) === normalized(wanted);
  }
  const FORM_TIER_DEFINITIONS = [
    {key:"hk", label:"Observed in sampled HK textbooks", description:"Forms with a recorded earliest observation in the sampled Hong Kong textbooks.", open:true},
    {key:"external", label:"Supported by external level references", description:"Forms linked to an external level reference and not recorded in the sampled Hong Kong textbooks.", open:true},
    {key:"additional", label:"Additional registered family members", description:"The remaining registered forms in this word family.", open:false},
  ];
  function formTier(form) {
    if (!blank(form?.first_seen_hk_textbooks)) return "hk";
    if (!blank(form?.external_level_reference)) return "external";
    return "additional";
  }
  function formTierTable(definition, visibleForms, total, selected, family) {
    const selectedInTier = visibleForms.some(form => form.form_key === selected?.form_key);
    const open = definition.open || selectedInTier;
    const rows = visibleForms.map(form => {
      const picked = form.form_key === selected?.form_key;
      return `<tr class="${picked ? "selected-form" : ""}"><td class="sticky-word"><button class="family-link" data-select-form="${esc(form.form_key)}">${esc(form.form)}</button>${picked ? '<span class="selected-marker">Selected word</span>' : ""}</td><td>${shown(form.first_seen_hk_textbooks)}</td><td>${shown(form.external_level_reference)}</td><td>${shown(connections(form, family))}</td><td>${shown(form.root)}</td><td>${shown(form.root_meaning)}</td><td>${shown(form.prefix)}</td><td>${shown(form.suffix)}</td><td><button class="primary" data-add-form="${esc(form.form_key)}">Add</button></td></tr>`;
    }).join("");
    return `<details class="form-tier form-tier-${definition.key}" ${open ? "open" : ""}><summary><span><strong>${esc(definition.label)}</strong><small>${esc(definition.description)}</small></span><span class="tier-count">${visibleForms.length.toLocaleString()} shown of ${total.toLocaleString()}</span></summary><div class="form-table-shell" tabindex="0"><table class="form-detail-table"><thead><tr><th class="sticky-word">Word</th><th>Earliest observed in HK textbooks</th><th>External level reference</th><th>AWL / MSVL</th><th>Root</th><th>Root meaning</th><th>Prefix</th><th>Suffix</th><th>Add</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="tier-empty">No forms in this layer match the current filters.</td></tr>'}</tbody></table></div></details>`;
  }
  function formPassesFilters(form, family) {
    if (!selectedMatches(family.current_hk_frequency_band, state.formFilters.hk)) return false;
    if (!selectedMatches(form.first_seen_hk_textbooks, state.formFilters.first, firstSeenMatches)) return false;
    if (!selectedMatches(form.external_level_reference, state.formFilters.external)) return false;
    return selectedAcademicMatches(form, family, state.formFilters.academic);
  }

  function renderWord(openFilter = "") {
    const detail = state.detail; if (!detail) return;
    const family = detail.family, selected = exactForm(detail), filter = normalized(state.formFilter);
    const forms = detail.forms.filter(form => (!filter || normalized(form.form).includes(filter)) && formPassesFilters(form, family));
    const tierTotals = Object.fromEntries(FORM_TIER_DEFINITIONS.map(definition => [definition.key, detail.forms.filter(form => formTier(form) === definition.key).length]));
    const tierTables = FORM_TIER_DEFINITIONS.map(definition => formTierTable(definition, forms.filter(form => formTier(form) === definition.key), tierTotals[definition.key], selected, family)).join("");
    const formFilterOptions = {
      hk: [family.current_hk_frequency_band || "No record"],
      first: [...distinct(detail.forms.map(form => form.first_seen_hk_textbooks)), ...(detail.forms.some(form => blank(form.first_seen_hk_textbooks)) ? ["No record"] : [])],
      external: [...distinct(detail.forms.map(form => form.external_level_reference)), ...(detail.forms.some(form => blank(form.external_level_reference)) ? ["No record"] : [])],
      academic: ["AWL", "MSVL", ...MSVL_ORDER, "No record"],
    };
    $("#word-workspace").innerHTML = `
      <article class="selected-word-card">
        <p class="eyebrow">Selected word</p><h1 id="word-view-title">${shown(selected?.form || state.selectedForm)}</h1>
        <p class="identity-line">Word family: <strong>${esc(family.display_family)}</strong></p>
        <div class="evidence-grid">
          ${evidenceItem("Candidate / reference status", statusLabel(family.set_membership))}
          ${evidenceItem("Overall frequency rank", overallRank(family.overall_frequency_order))}
          ${evidenceItem("HK frequency rank / band", rankBand(family.current_hk_frequency_rank, family.current_hk_frequency_band))}
          ${evidenceItem("This word: earliest observed in HK textbooks", selected?.first_seen_hk_textbooks)}
          ${evidenceItem("External level reference", selected?.external_level_reference)}
          ${evidenceItem("Academic Word List (AWL)", hasAwl(selected, family) ? "Yes" : null)}
          ${evidenceItem("Middle School Vocabulary Lists (MSVL)", msvlDisplay(selected?.msvl, family.msvl, selected?.academic_subject_evidence))}
          ${evidenceItem("Root", selected?.root)}
          ${evidenceItem("Root meaning", selected?.root_meaning)}
          ${evidenceItem("Prefix", selected?.prefix)}
          ${evidenceItem("Suffix", selected?.suffix)}
        </div>
        <button class="primary selected-add" data-add-selected>Add selected word</button>
      </article>
      <section class="family-summary">
        <div class="family-summary-head"><div><p class="eyebrow">Family summary</p><h2>${esc(family.display_family)}</h2></div><span class="set-pill ${statusClass(family.set_membership)}">${statusLabel(family.set_membership)}</span></div>
        <div class="evidence-grid summary-grid">
          ${evidenceItem("Overall frequency rank", overallRank(family.overall_frequency_order))}
          ${evidenceItem("HK frequency rank / band", rankBand(family.current_hk_frequency_rank, family.current_hk_frequency_band))}
          ${evidenceItem("This family: earliest observed in HK textbooks", family.textbook_first_seen_level)}
          ${evidenceItem("Academic Word List (AWL)", family.awl ? "Yes" : null)}
          ${evidenceItem("Middle School Vocabulary Lists (MSVL)", msvlDisplay(family.msvl))}
          ${evidenceItem("Earlier HK list", family.earlier_hk ? "Yes" : null)}
        </div>
        <details class="level-note"><summary>Frequency and sources</summary>
          <p>Counts show how often this word family occurs in each source. The combined frequency score determines the overall rank. The General frequency value uses the Zipf scale, where higher values mean more frequent use.</p>
          <div class="evidence-grid summary-grid">
            ${evidenceItem("Combined frequency score", blank(family.overall_frequency_value) ? null : Number(family.overall_frequency_value).toFixed(3))}
            ${evidenceItem("General frequency data", generalAvailability(family))}
            ${evidenceItem("General frequency (Zipf scale)", family.bawf_family_zipf)}
            ${evidenceItem("Occurrences in educational materials", integer(family.educational_tokens))}
            ${evidenceItem("Occurrences in ICE-HK", integer(family.ice_hk_tokens))}
            ${evidenceItem("Occurrences in GloWbE-HK", integer(family.glowbe_hk_tokens))}
            ${evidenceItem("Occurrences in NOW-HK news (evaluation)", integer(family.now_hk_tokens))}
          </div>
          <details><summary>Earlier source value</summary><p>This value is retained for comparison. The General frequency shown above is the value used by the current ranking.</p>
            ${evidenceItem("Earlier General frequency (Zipf scale)", family.historical_general_zipf_provenance_only)}
          </details>
        </details>
      </section>
      <section class="family-forms">
        <div class="form-table-heading"><div><p class="eyebrow">Complete registered family</p><h2>Word-level evidence by layer</h2><span class="shown-count">Showing ${forms.length.toLocaleString()} of ${detail.forms.length.toLocaleString()} forms</span></div>
        <div class="form-table-controls"><label>Filter forms<input id="form-filter" value="${esc(state.formFilter)}" placeholder="Type part of a word"></label><button id="clear-form-filter">Reset all</button></div></div>
        <div class="form-evidence-filters" aria-label="Word-level evidence filters">
          <div id="form-filter-hk">${multiFilterMarkup("hk", "HK frequency band", formFilterOptions.hk, state.formFilters.hk)}</div>
          <div id="form-filter-first">${multiFilterMarkup("first", "Earliest observed in HK textbooks", formFilterOptions.first, state.formFilters.first)}</div>
          <div id="form-filter-external">${multiFilterMarkup("external", "External level reference", formFilterOptions.external, state.formFilters.external)}</div>
          <div id="form-filter-academic">${multiFilterMarkup("academic", "AWL / MSVL / subject", formFilterOptions.academic, state.formFilters.academic)}</div>
        </div>
        <div class="form-tiers">${tierTables}</div>
        <p class="level-note">Textbook levels show where each form first appears in the sampled Hong Kong materials and provide a local progression reference for planning. The family level is the earliest observation among its registered members. External references retain their source level systems. AWL and MSVL connections include available family-level links. A dash indicates no recorded value for the displayed field.</p>
      </section>`;
    $("[data-add-selected]").addEventListener("click", () => addToList(family, selected?.form || state.selectedForm));
    $$('[data-select-form]').forEach(button => button.addEventListener("click", () => { state.selectedForm = detail.forms.find(form => form.form_key === button.dataset.selectForm)?.form || state.selectedForm; renderWord(); }));
    $$('[data-add-form]').forEach(button => button.addEventListener("click", () => addToList(family, detail.forms.find(form => form.form_key === button.dataset.addForm)?.form || family.display_family)));
    [["hk", "#form-filter-hk"], ["first", "#form-filter-first"], ["external", "#form-filter-external"], ["academic", "#form-filter-academic"]].forEach(([key, selector]) => {
      bindMultiFilter($(selector), state.formFilters[key], () => renderWord(key));
    });
    if (openFilter) $(`[data-filter-details="${openFilter}"]`)?.setAttribute("open", "");
    $("#form-filter").addEventListener("input", event => { state.formFilter = event.target.value; renderWord(); $("#form-filter")?.focus(); });
    $("#clear-form-filter").addEventListener("click", () => {
      state.formFilter = ""; Object.values(state.formFilters).forEach(values => values.clear()); renderWord();
    });
  }

  function addToList(family, word) {
    const key = family.baseword_key, chosen = word || family.display_family;
    let item = state.selected.find(row => row.baseword_key === key);
    if (!item) {
      item = {baseword_key:key, display_family:family.display_family, set_membership:family.set_membership,
        overall_frequency_order:family.overall_frequency_order, overall_frequency_value:family.overall_frequency_value,
        general_evidence_status:family.general_evidence_status, general_zipf:family.bawf_family_zipf,
        educational_tokens:family.educational_tokens, ice_hk_tokens:family.ice_hk_tokens,
        glowbe_hk_tokens:family.glowbe_hk_tokens, now_hk_tokens:family.now_hk_tokens,
        hk_corpus_frequency_rank:family.current_hk_frequency_rank,
        hk_corpus_frequency_band:family.current_hk_frequency_band, selected_forms:[], order:state.selected.length + 1,
        depth:"Notice", notes:"", connections:""};
      state.selected.push(item);
    }
    if (!item.selected_forms.includes(chosen)) item.selected_forms.push(chosen);
    saveList(); toast(`${chosen} added`);
  }
  async function addFamilyByKey(key) {
    const row = state.rows.find(item => item.baseword_key === key);
    if (row) addToList(row, row.display_family);
    else try { const detail = await json(`/families/${encodeURIComponent(key)}`); addToList(detail.family, detail.family.display_family); } catch (error) { toast(error.message); }
  }
  function updateListCount() { $("#list-count").textContent = state.selected.length; }

  async function refreshSelectedFromDatabase() {
    if (!state.selected.length) return;
    const refreshed = await Promise.all(state.selected.map(async item => {
      try {
        const detail = await json(`/families/${encodeURIComponent(item.baseword_key)}`);
        const family = detail.family;
        return {...item, display_family:family.display_family, set_membership:family.set_membership,
          overall_frequency_order:family.overall_frequency_order, overall_frequency_value:family.overall_frequency_value,
          general_evidence_status:family.general_evidence_status, general_zipf:family.bawf_family_zipf,
          educational_tokens:family.educational_tokens, ice_hk_tokens:family.ice_hk_tokens,
          glowbe_hk_tokens:family.glowbe_hk_tokens, now_hk_tokens:family.now_hk_tokens,
          hk_corpus_frequency_rank:family.current_hk_frequency_rank,
          hk_corpus_frequency_band:family.current_hk_frequency_band};
      } catch { return item; }
    }));
    state.selected = refreshed;
    saveList();
  }

  function renderTextFilterControls() {
    const definitions = [
      ["hk", "HK frequency band"], ["first", "Earliest observed in HK textbooks"],
      ["external", "External level reference"], ["academic", "AWL / MSVL / subject"],
    ];
    definitions.forEach(([key, label]) => {
      const host = $(`#filter-${key}`);
      host.innerHTML = multiFilterMarkup(`text-${key}`, label, state.textFilterOptions[key], state.textFilters[key]);
      bindMultiFilter(host, state.textFilters[key], renderTextResults);
    });
  }
  async function loadFilterConfig() {
    state.filterConfig = await json("/filters");
    state.commonTokens = new Set(state.filterConfig.common_word_register.tokens);
    state.textFilterOptions.first = state.filterConfig.first_seen_options;
    state.textFilterOptions.external = state.filterConfig.external_level_options;
    state.textFilterOptions.academic = state.filterConfig.academic_subject_options;
    renderTextFilterControls();
  }

  function itemOwner(item) { return item.owners?.find(owner => !owner.blocked) || item.owners?.[0] || null; }
  function exactEvidence(item) { return itemOwner(item)?.matched_form_evidence || null; }
  // Display expansions only. These never assign a family or change coverage.
  const contractionDescriptions = globalThis.HKELE_CONTRACTION_DESCRIPTIONS;
  function contractionDescription(item) {
    const key = String(item.display_word || item.surface || "").replace(/[\u2018\u2019]/g, "'").toLowerCase();
    return Object.hasOwn(contractionDescriptions, key) ? contractionDescriptions[key] : null;
  }
  function itemGroup(item) {
    if (contractionDescription(item)) return "contractions";
    const owner = itemOwner(item);
    if (!owner || item.status !== "RESOLVED") return "review";
    if (state.commonTokens.has(item.normalized_token)) return "common";
    if (owner.candidate_member) return "core";
    if (owner.reference_member) return "broader";
    return "other";
  }
  function summarizeTextItems(items) {
    const summary = Object.fromEntries(["core","broader","other","contractions","review","common"].map(key => [key,{words:0,occurrences:0}]));
    items.forEach(item => {
      const key = itemGroup(item);
      summary[key].words += 1;
      summary[key].occurrences += item.count;
    });
    return summary;
  }
  function textSummaryCard(label, values, tone = "") {
    return `<div class="text-summary-card ${tone}"><span>${esc(label)}</span><strong>${values.words.toLocaleString()}</strong><small>grouped word${values.words === 1 ? "" : "s"} · ${values.occurrences.toLocaleString()} occurrence${values.occurrences === 1 ? "" : "s"}</small></div>`;
  }
  function firstSeen(item) { return exactEvidence(item)?.first_seen_hk_textbooks || ""; }
  function subjectText(item) {
    const owner = itemOwner(item), form = exactEvidence(item);
    return [hasAwl(form, owner) ? "AWL" : "", msvlDisplay(form?.msvl, owner?.msvl, form?.academic_subject_evidence)].filter(Boolean).join(" · ");
  }
  function passesFilters(item) {
    // A full-form explanation does not inherit a misleading single-family filter.
    if (contractionDescription(item)) return true;
    const owner = itemOwner(item), evidence = exactEvidence(item);
    if (!owner || item.status !== "RESOLVED") return true;
    const wordSet = $("#filter-word-set").value;
    if (wordSet === "core" && !owner.candidate_member) return false;
    if (wordSet === "broader" && !owner.reference_member) return false;
    if (!selectedMatches(owner.current_hk_frequency_band, state.textFilters.hk)) return false;
    if (!selectedMatches(firstSeen(item), state.textFilters.first, firstSeenMatches)) return false;
    if (!selectedMatches(evidence?.external_level_reference, state.textFilters.external)) return false;
    if (!selectedAcademicMatches(evidence, owner, state.textFilters.academic)) return false;
    return true;
  }
  function firstSeenOrder(value) {
    const match = String(value || "").match(/^([PS])(\d)$/i);
    return match ? (match[1].toUpperCase() === "P" ? 0 : 6) + Number(match[2]) : 99;
  }
  function sortItems(items) {
    const mode = $("#text-sort").value;
    return [...items].sort((a, b) => {
      const ao = itemOwner(a), bo = itemOwner(b);
      if (mode === "overall") return (ao?.overall_frequency_order ?? 1e9) - (bo?.overall_frequency_order ?? 1e9) || a.first_order - b.first_order;
      if (mode === "hk") return (ao?.current_hk_frequency_rank ?? 1e9) - (bo?.current_hk_frequency_rank ?? 1e9) || a.first_order - b.first_order;
      if (mode === "first_seen") return firstSeenOrder(firstSeen(a)) - firstSeenOrder(firstSeen(b)) || a.first_order - b.first_order;
      if (mode === "az") return a.normalized_token.localeCompare(b.normalized_token);
      return a.first_order - b.first_order;
    });
  }
  function resultCard(item) {
    const context = `<details class="level-note"><summary>Original wording${item.surface_forms?.length ? `: ${item.surface_forms.map(esc).join(" / ")}` : ""}</summary>${(item.context_examples || []).map(text => `<p>${esc(text)}</p>`).join("")}</details>`;
    const expression = contractionDescription(item);
    if (expression) return `<article class="text-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><span>Full form</span><p>${esc(expression)}</p>${expression.includes(" / ") ? '<p class="hint">The sentence tells you which meaning fits.</p>' : ''}</div><div></div></article>`;
    if (item.status === "AMBIGUOUS" && item.owners?.length) {
      const ownerCards = item.owners.filter(owner => !owner.blocked).map(owner => {
        const evidence = owner.matched_form_evidence;
        return `<div class="ambiguous-owner"><div class="result-family-line"><span>Equal-best current owner</span><strong>${esc(owner.display_family)}</strong></div><div class="result-evidence">${resultEvidence(owner, evidence, null)}</div><div class="result-actions"><button data-result-view="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">View</button><button class="primary" data-result-add="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">Add</button></div></div>`;
      }).join("");
      return `<article class="text-result ambiguous-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><p class="review-note">This form has several matching word families. Select the one that fits your text.</p>${ownerCards}</div><div></div></article>`;
    }
    const owner = itemOwner(item), evidence = exactEvidence(item);
    if (!owner || item.status !== "RESOLVED") {
      const note = item.identity_exception?.teacher_display || item.failure_reason || "No current family record";
      return `<article class="text-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div class="review-note">${esc(note)}</div><div></div></article>`;
    }
    return `<article class="text-result"><div class="result-token"><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><div class="result-family-line"><span>Word family</span><strong>${esc(owner.display_family)}</strong></div><div class="result-evidence">${resultEvidence(owner, evidence, item)}</div></div><div class="result-actions"><button data-result-view="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">View</button><button class="primary" data-result-add="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">Add</button></div></article>`;
  }
  function renderTextResults() {
    if (!state.textItems.length) return;
    const definitions = [
      ["core", "Candidate words", true], ["broader", "Reference-only words", true], ["other", "Other database words", false],
      ["contractions", "Contractions and expressions", true], ["review", "Context review", false], ["common", "Common words", $("#filter-common").checked],
    ];
    const summary = summarizeTextItems(state.textItems);
    const languageNotes = {words:summary.contractions.words + summary.review.words, occurrences:summary.contractions.occurrences + summary.review.occurrences};
    $("#text-summary").classList.remove("hidden");
    $("#text-summary").innerHTML = `<div class="text-summary-heading"><div><p class="eyebrow">Text overview</p><h3>Vocabulary profile</h3></div><p>${summary.common.words.toLocaleString()} common word${summary.common.words === 1 ? " is" : "s are"} grouped separately below.</p></div><div class="text-summary-grid">${textSummaryCard("Candidate", summary.core, "summary-candidate")}${textSummaryCard("Reference only", summary.broader, "summary-reference")}${textSummaryCard("Other database words", summary.other, "summary-other")}${textSummaryCard("Language notes", languageNotes, "summary-notes")}</div>`;
    let shownUnique = 0;
    const html = definitions.map(([key, label, normallyOpen]) => {
      const all = state.textItems.filter(item => itemGroup(item) === key);
      const filtered = sortItems(all.filter(passesFilters)); shownUnique += filtered.length;
      const occurrences = all.reduce((sum, item) => sum + item.count, 0);
      const open = key === "common" ? $("#filter-common").checked : normallyOpen;
      return `<details class="result-group group-${key}" ${open ? "open" : ""}><summary>${label} <span>${filtered.length} of ${all.length} grouped words · ${occurrences} occurrences</span></summary><div class="result-group-content">${filtered.length ? filtered.map(resultCard).join("") : '<p class="hint">No words in this group match the current filters.</p>'}</div></details>`;
    }).join("");
    $("#text-results").className = "result-groups"; $("#text-results").innerHTML = html;
    const totalOccurrences = state.textItems.reduce((sum, item) => sum + item.count, 0);
    $("#result-count").textContent = `${state.textItems.length} grouped words from ${totalOccurrences} occurrences · ${shownUnique} match the current filters`;
    $$('[data-result-view]').forEach(button => button.addEventListener("click", () => openFamily(button.dataset.resultView, button.dataset.resultForm)));
    $$('[data-result-add]').forEach(button => button.addEventListener("click", () => {
      for (const item of state.textItems) {
        const owner = item.owners?.find(value => value.baseword_key === button.dataset.resultAdd && !value.blocked);
        if (owner && normalized(owner.matched_form_evidence?.form || item.display_word) === normalized(button.dataset.resultForm)) { addToList(owner, button.dataset.resultForm); break; }
      }
    }));
  }

  async function checkText() {
    const source = $("#text-input").value;
    try {
      const occurrences = HKELE_TOKENIZER.tokenize(source, 500);
      const data = await json("/occurrences/resolve", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({occurrences})});
      state.textAudit = data.occurrences;
      const grouped = new Map();
      data.occurrences.forEach(item => {
        const ownerSignature = (item.owners || []).map(owner => owner.baseword_key).sort().join("|");
        const exceptionSignature = item.identity_exception?.current_classification || item.failure_reason || "";
        const key = item.normalized_token
          ? `${item.normalized_token}::${item.status}::${ownerSignature}::${exceptionSignature}`
          : `unsupported:${item.surface}`;
        if (!grouped.has(key)) grouped.set(key, {...item, display_word:item.surface, count:0, first_order:item.occurrence_order, occurrence_ids:[], surface_forms:[], context_examples:[]});
        const group = grouped.get(key); group.count += 1; group.occurrence_ids.push(item.occurrence_id);
        if (!group.surface_forms.includes(item.surface)) group.surface_forms.push(item.surface);
        const occurrence = occurrences.find(value => value.occurrence_id === item.occurrence_id);
        if (occurrence && group.context_examples.length < 3) {
          const start = Math.max(0, occurrence.start_offset - 45), end = Math.min(source.length, occurrence.end_offset + 45);
          const excerpt = `${start ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
          if (!group.context_examples.includes(excerpt)) group.context_examples.push(excerpt);
        }
      });
      state.textItems = [...grouped.values()];
      const currentOwners = state.textItems.flatMap(item => (item.owners || []).filter(owner => !owner.blocked));
      const currentEvidence = currentOwners.map(owner => owner.matched_form_evidence).filter(Boolean);
      const bands = distinct(currentOwners.map(owner => owner.current_hk_frequency_band));
      state.textFilterOptions.hk = [...bands, ...(currentOwners.some(owner => blank(owner.current_hk_frequency_band)) ? ["No record"] : [])];
      state.textFilterOptions.first = [...distinct(currentEvidence.map(form => form.first_seen_hk_textbooks)), ...(currentEvidence.some(form => blank(form.first_seen_hk_textbooks)) ? ["No record"] : [])];
      state.textFilterOptions.external = [...distinct(currentEvidence.map(form => form.external_level_reference)), ...(currentEvidence.some(form => blank(form.external_level_reference)) ? ["No record"] : [])];
      const currentAcademic = new Set(); currentOwners.forEach(owner => academicTags(owner.matched_form_evidence, owner).forEach(tag => currentAcademic.add(tag)));
      state.textFilterOptions.academic = [...MSVL_ORDER.filter(value => currentAcademic.has(value)), ...["AWL", "MSVL"].filter(value => currentAcademic.has(value)), ...(currentOwners.some(owner => academicTags(owner.matched_form_evidence, owner).size === 0) ? ["No record"] : [])];
      renderTextFilterControls();
      renderTextResults();
    } catch (error) { $("#text-summary").classList.add("hidden"); $("#text-results").className = "search-feedback"; $("#text-results").textContent = error.message; $("#result-count").textContent = "Text not checked"; }
  }

  function clearTextWorkspace() {
    $("#text-input").value = "";
    $("#text-count").textContent = "0 characters";
    state.textAudit = [];
    state.textItems = [];
    $("#text-summary").classList.add("hidden");
    $("#text-summary").innerHTML = "";
    $("#text-results").className = "empty-state";
    $("#text-results").textContent = "Your grouped results will appear here.";
    $("#result-count").textContent = "No text checked";
  }

  function resetFilters() {
    $("#filter-word-set").value = "broader";
    Object.values(state.textFilters).forEach(values => values.clear());
    $("#filter-common").checked = false; $("#text-sort").value = "hk";
    renderTextFilterControls(); renderTextResults();
  }

  function renderList() {
    updateListCount(); const empty = state.selected.length === 0;
    $("#list-empty").classList.toggle("hidden", !empty); $("#list-workspace").classList.toggle("hidden", empty);
    if (empty) return;
    $("#list-body").innerHTML = [...state.selected].sort((a,b) => a.order - b.order).map(item => `<tr data-list-key="${esc(item.baseword_key)}"><td><input class="list-order" type="number" min="1" value="${item.order}"></td><td><div class="selected-forms-list">${item.selected_forms.map(form => `<span class="selected-form-chip">${esc(form)} <button data-remove-form="${esc(form)}" aria-label="Remove ${esc(form)}">×</button></span>`).join("")}</div></td><td>${esc(item.display_family)}</td><td><span class="set-pill ${statusClass(item.set_membership)}">${statusLabel(item.set_membership)}</span></td><td class="list-rank">${integer(item.overall_frequency_order)}</td><td class="list-hk">${rankBand(item.hk_corpus_frequency_rank, item.hk_corpus_frequency_band)}</td><td><select class="list-depth"><option ${item.depth === "Notice" ? "selected" : ""}>Notice</option><option ${item.depth === "Practise" ? "selected" : ""}>Practise</option><option ${item.depth === "Master" ? "selected" : ""}>Master</option></select></td><td><input class="notes" value="${esc(item.notes)}" placeholder="Lesson notes"></td><td><input class="connections" value="${esc(item.connections)}" placeholder="Connections"></td><td><button data-remove-family>Remove</button></td></tr>`).join("");
    $$('#list-body tr').forEach(row => {
      const item = state.selected.find(value => value.baseword_key === row.dataset.listKey);
      row.querySelector(".list-order").addEventListener("change", event => { item.order = Math.max(1, Number(event.target.value) || 1); saveList(); renderList(); });
      row.querySelector(".list-depth").addEventListener("change", event => { item.depth = event.target.value; saveList(); });
      row.querySelector(".notes").addEventListener("input", event => { item.notes = event.target.value; saveList(); });
      row.querySelector(".connections").addEventListener("input", event => { item.connections = event.target.value; saveList(); });
      row.querySelector("[data-remove-family]").addEventListener("click", () => { state.selected = state.selected.filter(value => value !== item); saveList(); renderList(); });
      row.querySelectorAll("[data-remove-form]").forEach(button => button.addEventListener("click", () => {
        item.selected_forms = item.selected_forms.filter(form => form !== button.dataset.removeForm);
        if (!item.selected_forms.length) state.selected = state.selected.filter(value => value !== item);
        saveList(); renderList();
      }));
    });
  }
  function exportItems() { return [...state.selected].sort((a,b) => a.order-b.order).map(item => ({teacher_order:item.order, word_family:item.display_family, selected_forms:[...item.selected_forms], status:statusLabel(item.set_membership), overall_frequency_rank:item.overall_frequency_order, overall_score:item.overall_frequency_value, general_availability:item.general_evidence_status === "UNAVAILABLE_NOT_ZERO" ? "Unavailable — not zero" : blank(item.general_zipf) ? "Unavailable" : "Available", general_zipf:item.general_zipf, educational_tokens:item.educational_tokens, ice_hk_tokens:item.ice_hk_tokens, glowbe_hk_tokens:item.glowbe_hk_tokens, now_hk_tokens:item.now_hk_tokens, hk_corpus_frequency_rank:item.hk_corpus_frequency_rank, hk_corpus_frequency_band:item.hk_corpus_frequency_band, teaching_depth:item.depth, teacher_notes:item.notes, semantic_notes:item.connections})); }
  function download(name, type, content) { const blob = content instanceof Blob ? content : new Blob([content], {type}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
  const csvCell = value => `"${String(value ?? "").replaceAll('"','""')}"`;
  function exportCsv() { const headers=["Teacher order","Selected word","Word family","Candidate/reference status","Overall rank","Overall score","General availability","General Zipf","Educational tokens","ICE-HK tokens","GloWbE-HK tokens","NOW-HK tokens (evaluation only)","HK rank","HK band","Depth","Teacher notes","Connections"]; const rows=exportItems().flatMap(item => item.selected_forms.map(form => [item.teacher_order,form,item.word_family,item.status,item.overall_frequency_rank,item.overall_score,item.general_availability,item.general_zipf,item.educational_tokens,item.ice_hk_tokens,item.glowbe_hk_tokens,item.now_hk_tokens,item.hk_corpus_frequency_rank,item.hk_corpus_frequency_band,item.teaching_depth,item.teacher_notes,item.semantic_notes])); download("HK-ELE_Teaching_List.csv","text/csv;charset=utf-8",[headers,...rows].map(row => row.map(csvCell).join(",")).join("\r\n")); }
  function exportMarkdown() { const rows=exportItems(); download("HK-ELE_Teaching_List.md","text/markdown;charset=utf-8",`# Teaching List\n\n${rows.length ? rows.map(item => `${item.teacher_order}. ${item.selected_forms.join(", ")} — ${item.word_family}\n   - Status: ${item.status}\n   - Overall rank: ${item.overall_frequency_rank ?? "Unranked"}\n   - General: ${item.general_availability}${item.general_zipf == null ? "" : ` · Zipf ${item.general_zipf}`}\n   - HK rank / band: ${item.hk_corpus_frequency_rank ?? "—"} · ${item.hk_corpus_frequency_band || "—"}\n   - Depth: ${item.teaching_depth}\n   - Notes: ${item.teacher_notes || "—"}\n   - Connections: ${item.semantic_notes || "—"}`).join("\n") : "No words selected."}\n`); }
  async function exportExcel() { try { const response=await api("/teacher-list.xlsx",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:"",items:exportItems()})}); download("HK-ELE_Teaching_List.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",await response.blob()); } catch(error) { toast(error.message); } }

  function bind() {
    $$(".nav-button").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$(".scope").forEach(button => button.addEventListener("click", () => { $$(".scope").forEach(node => node.classList.remove("active")); button.classList.add("active"); state.scope=button.dataset.scope; state.page=1; loadFamilies(); }));
    $("#sort-select").addEventListener("change", event => { state.sort=event.target.value; state.page=1; loadFamilies(); });
    $("#page-size").addEventListener("change", event => { state.pageSize=Number(event.target.value); state.page=1; loadFamilies(); });
    $("#prev-page").addEventListener("click", () => { if(state.page>1){state.page-=1;loadFamilies();} });
    $("#next-page").addEventListener("click", () => { state.page+=1;loadFamilies(); });
    $("#browse-search-form").addEventListener("submit", async event => { event.preventDefault(); const query=$("#browse-search").value.trim(); if(!query)return; try{const result=await json(`/search?q=${encodeURIComponent(query)}`); const node=$("#search-feedback"); if(result.status==="RESOLVED"){const owner=result.owners.find(item=>!item.blocked); await openFamily(owner.baseword_key, owner.matched_form_evidence?.form || query); node.classList.add("hidden");}else if(result.status==="AMBIGUOUS"){const owners=result.owners.filter(item=>!item.blocked); node.classList.remove("hidden"); node.innerHTML=`<strong>${owners.length} equal-best current owners retained.</strong> Choose one explicitly: ${owners.map(owner=>`<button data-search-owner="${esc(owner.baseword_key)}" data-search-form="${esc(owner.matched_form_evidence?.form || query)}">${esc(owner.display_family)}</button>`).join(" ")}`; node.querySelectorAll("[data-search-owner]").forEach(button=>button.addEventListener("click",()=>openFamily(button.dataset.searchOwner,button.dataset.searchForm)));}else{node.classList.remove("hidden"); node.textContent=result.identity_exception?.teacher_display || "No current family record.";}}catch(error){toast(error.message);} });
    $("#back-to-browse").addEventListener("click", () => showView("browse"));
    $("#text-input").addEventListener("input", event => $("#text-count").textContent=`${event.target.value.length.toLocaleString()} characters`);
    $("#check-button").addEventListener("click", checkText);
    $("#clear-text").addEventListener("click", clearTextWorkspace);
    ["#filter-word-set","#filter-common","#text-sort"].forEach(selector => $(selector).addEventListener("change", renderTextResults));
    $("#reset-filters").addEventListener("click", resetFilters);
    $("#clear-list").addEventListener("click", () => { if(state.selected.length && !confirm("Clear the whole Teaching List?")) return; state.selected=[]; saveList(); renderList(); });
    $("#export-csv").addEventListener("click", exportCsv); $("#export-md").addEventListener("click", exportMarkdown); $("#export-xlsx").addEventListener("click", exportExcel);
    window.addEventListener("hashchange", () => { const view=location.hash.slice(1); if(["browse","check","list"].includes(view))showView(view); });
  }

  async function init() {
    buildColumnMenu(); bind(); updateListCount(); clearTextWorkspace();
    await Promise.all([loadFamilies(), loadFilterConfig(), refreshSelectedFromDatabase()]);
    const view=location.hash.slice(1); if(["browse","check","list"].includes(view))showView(view);
  }
  init().catch(error => toast(error.message));
})();
