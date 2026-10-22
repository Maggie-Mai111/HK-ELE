(() => {
  "use strict";

  let lessonStorage;
  try { lessonStorage = globalThis.localStorage; } catch { lessonStorage = null; }
  const lessonStore = globalThis.HKELE_LESSON_LIBRARY.create(lessonStorage);
  const initialLibrary = lessonStore.library;
  const initialLesson = initialLibrary.lessons.find(item => item.id === initialLibrary.activeId);
  const lesson = globalThis.HKELE_LESSON;
  const COLUMN_KEY = "hkele-phase1v-columns-v1";
  const columnDefs = [
    ["family", "Word family", true],
    ["status", "Word list", true], ["overall", "Overall frequency rank", true],
    ["hk", "HK frequency rank / band", true], ["first_seen", "First seen in HK textbooks", true],
    ["external", "US grade reference", true], ["academic", "Academic Word List (AWL)", true],
    ["subjects", "Middle School Vocabulary List (MSVL)", true],
    ["root", "Root", true], ["root_meaning", "Root meaning", true],
    ["prefix", "Prefix", true], ["suffix", "Suffix", true],
    ["view", "View", true], ["add", "Add", true],
  ];
  const compactColumnLabels = {
    overall: "Overall rank", hk: "HK rank / band",
  };
  const columnWeights = {family:7.5, status:6.5, overall:6, hk:7, first_seen:8, external:8,
    academic:7.5, subjects:9, root:6, root_meaning:12, prefix:6, suffix:6, view:5.5, add:5.5};
  const MSVL_LABELS = {
    english: "English Grammar and Writing", "english grammar and writing": "English Grammar and Writing", health: "Health", math: "Mathematics",
    mathematics: "Mathematics", science: "Science", social_and_history: "Social Studies and History",
    "soc/hist": "Social Studies and History", "social studies": "Social Studies and History",
    history: "Social Studies and History", "social studies and history": "Social Studies and History",
  };
  const MSVL_ORDER = ["English Grammar and Writing", "Health", "Mathematics", "Science", "Social Studies and History"];
  const state = {
    scope: "full", sort: "overall", page: 1, pageSize: 25, total: 0, rows: [],
    aiFilters: null, aiRestore: null, familySearch:null,
    library:initialLibrary, lessonEditVersion:0, selected:initialLesson.items, lessonTitle:initialLesson.title, lessonSelection:new Set(), lessonLimit:6, lessonOpen:new Set(), undoList:null, columns: loadColumns(), detail: null, selectedForm: "", formFilter: "",
    formFilters: {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()},
    textFilters: {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()},
    textFilterOptions: {hk:[], first:[], external:[], academic:[]},
    filterConfig: null, commonTokens: new Set(), textAudit: [], textItems: [],
    view:"home", scrollPositions:{}, wordReturn:null, checkedText:null, textRequest:0,
  };
  const familyResults = globalThis.HKELE_WORD_FAMILY_RESULTS;
  const familyFrequency = familyResults.createReader();
  const searchGate = familyResults.createRequestGate();
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const blank = value => value === null || value === undefined || String(value).trim() === "";
  const shown = value => blank(value) ? "—" : esc(value);
  const integer = value => blank(value) ? "—" : Number(value).toLocaleString();
  const decimal = value => blank(value) ? "—" : Number(value).toLocaleString(undefined, {maximumFractionDigits: 6});
  const overallRank = value => blank(value) ? "Unranked" : integer(value);
  const generalAvailability = family => family.general_evidence_status === "UNAVAILABLE_NOT_ZERO" || blank(family.bawf_family_zipf) ? "—" : "Available";
  const browseShown = value => blank(value) ? "—" : esc(value);
  const browseInteger = value => blank(value) ? "—" : Number(value).toLocaleString();
  const browseYes = value => value === true || value === 1 ? "Yes" : "—";
  const normalized = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  const yes = value => value === true || value === 1 ? "Yes" : "—";
  const statusLabel = value => value === "Candidate" || value === "Core list" ? "Core list" : "Full database";
  const statusClass = value => value === "Candidate" || value === "Core list" ? "core" : "other";

  function identityNote(result) {
    const kind = result.identity_exception?.current_classification;
    if (kind === "COUNTRY_ABBREVIATION_OR_OTHER_CONTEXT_REQUIRED") return "US can mean the United States. Check how it is used in your sentence.";
    if (kind === "CONTEXT_REQUIRED_DO_VERB_OR_DOE_PLURAL") return "Does can be a form of do or the plural of doe. Check the sentence.";
    if (kind === "REGISTERED_CONTRACTION_ROUTE") return "Try the full form of this contraction.";
    return result.identity_exception?.teacher_display || "";
  }

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
  function tokens(value, kind) { return globalThis.HKELE_EVIDENCE_TOKENS.chips(value, kind); }
  function subjectTokens(...values) { return tokens(msvlSubjects(...values), "subject"); }
  function hasAwl(form, family) {
    const value = form ? form.awl : family?.awl;
    return value === true || value === 1 || value === "1";
  }
  function wordFormEvidence(form) {
    const withheld = String(form?.phase1c_evidence_withheld_fields || "").toLowerCase();
    return {awl:hasAwl(form,null), msvl:form?.msvl ?? null,
      root:form?.root ?? null,
      meaning:form?.root_meaning_alignment_status === "MATCHED_UNIQUE_EXACT" ? form.root_meaning : null,
      prefix:withheld.includes("prefix") ? null : form?.prefix ?? null,
      suffix:withheld.includes("suffix") ? null : form?.suffix ?? null,
      subjects:form?.academic_subject_evidence ?? null};
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
      browse_external_level_reference: window.HKELE_STATIC_API.displayedWordEvidence(family, forms).browse_external_level_reference,
      browse_root: representative?.root || null,
      browse_root_meaning: representative?.root_meaning_alignment_status === "MATCHED_UNIQUE_EXACT" ? representative?.root_meaning || null : null,
      browse_prefix: representative && !withheld.includes("prefix") ? representative.prefix || null : null,
      browse_suffix: representative && !withheld.includes("suffix") ? representative.suffix || null : null,
    };
  }

  async function enrichBrowseRows(rows) {
    const details = await Promise.all(rows.map(row => json(`/families/${encodeURIComponent(row.baseword_key)}`)));
    return rows.map((row, index) => ({...row,
      ...(Object.hasOwn(row, "browse_root") ? {} : morphologyFromDetail(details[index])),
      browse_external_level_reference: window.HKELE_STATIC_API.displayedWordEvidence(row, details[index].forms).browse_external_level_reference,
    }));
  }

  function loadColumns() {
    const defaults = Object.fromEntries(columnDefs.map(([key, , initial]) => [key, initial]));
    try { return {...defaults, ...(JSON.parse(localStorage.getItem(COLUMN_KEY) || "null") || {})}; }
    catch { return defaults; }
  }
  function saveList() {
    const saved = libraryUi.persist();
    refreshLessonContext();
    return saved;
  }
  function refreshLessonContext() {
    updateListCount();
    textWorkspace.refreshSuggestions();
    if (!$("#lesson-picker").classList.contains("hidden")) workspace.renderPicker();
    $$('[data-add-family]').forEach(button => {
      const added = state.selected.some(item => item.baseword_key === button.dataset.addFamily);
      button.disabled = added; button.textContent = added ? "Added ✓" : "Add";
    });
    refreshSearchAddButtons();
  }
  function saveColumns() { localStorage.setItem(COLUMN_KEY, JSON.stringify(state.columns)); }
  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 1800); }
  async function json(path, options = {}) { return window.HKELE_STATIC_API.request(path, options); }

  function showView(name, restore = false) {
    if (name !== "browse") {
      searchGate.cancel();
      if (state.familySearch?.loading) clearFamilySearch(false);
    }
    if (state.view !== "word") state.scrollPositions[state.view] = window.scrollY;
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    state.view = name;
    $(".lesson-context-controls").hidden = name === "home";
    $(".lesson-context").classList.toggle("home-context", name === "home");
    $$(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.view === (name === "word" ? state.wordReturn?.view : name)));
    if (name !== "word") location.hash = name;
    if (name === "list") renderList();
    if (name === "check") textWorkspace.refreshSuggestions();
    const returnPoint = restore ? state.wordReturn : null;
    window.requestAnimationFrame(() => {
      if (state.view !== name) return;
      window.scrollTo({top: returnPoint?.y ?? (restore ? state.scrollPositions[name] || 0 : 0), behavior: "instant"});
      const target = returnPoint?.target?.isConnected ? returnPoint.target : (returnPoint?.selector ? $(returnPoint.selector) : null) || $(name === "word" ? "#back-to-browse" : `#view-${name} h1`);
      if (target) { if (!target.matches("button,input,a,[tabindex]")) target.tabIndex=-1; target.focus({preventScroll:true}); }
    });
  }

  function buildColumnMenu() {
    const fixed = new Set(["family", "view", "add"]);
    $("#column-choices").innerHTML = columnDefs.map(([key, label]) => `<label class="column-choice"><input type="checkbox" data-column="${key}" ${state.columns[key] ? "checked" : ""} ${fixed.has(key) ? "disabled" : ""}> ${esc(label)}</label>`).join("");
    $$('[data-column]').forEach(box => box.addEventListener("change", () => {
      state.columns[box.dataset.column] = box.checked; saveColumns(); renderBrowseTable();
    }));
  }

  function evidenceBadge(label, value, tone = "neutral") {
    if (blank(value)) return "";
    return `<span class="evidence-badge tone-${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></span>`;
  }
  function renderBrowseTable() {
    $("#browse-result-count").innerHTML = `<strong>${state.total.toLocaleString()}</strong> word families`;
    const visible = columnDefs.filter(([key]) => state.columns[key]);
    const totalWeight = visible.reduce((total, [key]) => total + columnWeights[key], 0);
    const columnWidths = $("#family-column-widths");
    if (columnWidths) columnWidths.innerHTML = visible.map(([key]) => `<col data-col="${key}" style="width:${(columnWeights[key] / totalWeight * 100).toFixed(4)}%">`).join("");
    const groups = [["Word family", ["family", "status"]], ["Frequency", ["overall", "hk"]], ["Textbook & list evidence", ["first_seen", "external", "academic", "subjects"]], ["Word parts", ["root", "root_meaning", "prefix", "suffix"]], ["Actions", ["view", "add"]]];
    $("#family-column-groups").innerHTML = groups.map(([label, keys]) => { const count = keys.filter(key => state.columns[key]).length; return count ? `<th colspan="${count}" scope="colgroup">${label}</th>` : ""; }).join("");
    $("#family-head").innerHTML = visible.map(([key, label]) => `<th scope="col" data-col="${key}" title="${esc(label)}" aria-label="${esc(label)}" ${key === "family" ? 'class="family-cell"' : ""}>${esc(compactColumnLabels[key] || label)}</th>`).join("");
    $("#family-body").innerHTML = state.rows.length ? state.rows.map(row => {
      const cells = {
        family: `<td class="family-cell"><button class="family-link" data-view-family="${esc(row.baseword_key)}">${esc(row.display_family)}</button></td>`,
        status: `<td class="status-cell"><span class="set-pill ${statusClass(row.set_membership)}">${statusLabel(row.set_membership)}</span></td>`,
        overall: `<td class="overall-cell">${browseInteger(row.overall_frequency_order)}</td>`,
        hk: `<td class="hk-cell"><strong>${browseInteger(row.current_hk_frequency_rank)}</strong><span class="hint">${browseShown(row.current_hk_frequency_band)}</span></td>`,
        first_seen: `<td class="evidence-cell first-seen-cell">${evidenceBadge("", row.textbook_first_seen_level, "textbook") || "—"}</td>`,
        external: `<td class="evidence-cell external-cell">${evidenceBadge("", row.browse_external_level_reference, "external") || "—"}</td>`,
        academic: `<td class="evidence-cell academic-cell">${row.awl ? evidenceBadge("", "AWL", "subject") : "—"}</td>`,
        subjects: `<td class="evidence-cell subjects-cell">${subjectTokens(row.msvl)}</td>`,
        root: `<td class="morph-cell root-cell">${tokens(row.browse_root,"root")}</td>`,
        root_meaning: `<td class="morph-cell root-meaning-cell">${tokens(row.browse_root_meaning,"meaning")}</td>`,
        prefix: `<td class="morph-cell affix-cell">${browseShown(row.browse_prefix)}</td>`,
        suffix: `<td class="morph-cell affix-cell">${browseShown(row.browse_suffix)}</td>`,
        view: `<td class="action-cell"><button data-view-family="${esc(row.baseword_key)}">View</button></td>`,
        add: `<td class="action-cell"><button class="primary" data-add-family="${esc(row.baseword_key)}" ${state.selected.some(item => item.baseword_key === row.baseword_key) ? "disabled" : ""}>${state.selected.some(item => item.baseword_key === row.baseword_key) ? "Added ✓" : "Add"}</button></td>`,
      };
      return `<tr>${visible.map(([key]) => cells[key]).join("")}</tr>`;
    }).join("") : `<tr><td class="browse-empty" colspan="${visible.length}">${esc(globalThis.HKELE_LESSON_LIBRARY.emptyMessage(Boolean(state.aiFilters), state.scope === "core"))}<button data-empty-reset type="button">${state.aiFilters ? "Clear filters" : state.scope === "core" ? "Search Full database" : "Reload words"}</button></td></tr>`;
    $('[data-empty-reset]')?.addEventListener("click", () => {
      clearAiForManualBrowseChange(); state.scope="full"; state.page=1; syncBrowseControls(); loadFamilies();
    });
    $$('[data-view-family]').forEach(button => button.addEventListener("click", () => openFamily(button.dataset.viewFamily)));
    $$('[data-add-family]').forEach(button => button.addEventListener("click", () => addFamilyByKey(button.dataset.addFamily)));
  }

  async function loadFamilies() {
    try {
      const params = new URLSearchParams({scope:state.scope, sort:state.sort, page:String(state.page), page_size:String(state.pageSize)});
      if (state.aiFilters) params.set("ai_filters", JSON.stringify(state.aiFilters));
      const data = await json(`/families?${params}`);
      state.rows = await enrichBrowseRows(data.families); state.total = data.available_items; renderBrowseTable();
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      $("#page-label").textContent = `Page ${state.page} of ${pages}`;
      $("#prev-page").disabled = state.page <= 1; $("#next-page").disabled = state.page >= pages;
      return data;
    } catch (error) { $("#family-body").innerHTML = `<tr><td>${esc("We couldn't load the words. Please check your connection and try again.")}</td></tr>`; return null; }
  }

  function syncBrowseControls() {
    $$(".scope").forEach(node => node.classList.toggle("active", node.dataset.scope === state.scope));
    const search = state.familySearch;
    $("#sort-select").innerHTML = search
      ? '<option value="frequency-desc">HK word frequency · high to low</option><option value="frequency-asc">HK word frequency · low to high</option><option value="az">A–Z</option><option value="za">Z–A</option>'
      : '<option value="overall">Overall frequency rank</option><option value="hk">HK frequency rank</option><option value="az">A–Z</option>';
    $("#sort-select").value = search ? search.sort : state.sort;
    $("#page-size").value = String(state.pageSize);
  }

  function clearAiForManualBrowseChange() {
    if (!state.aiFilters) return;
    state.aiFilters = null;
    state.aiRestore = null;
    window.dispatchEvent(new CustomEvent("hkele:manual-browse-change"));
  }

  function clearFamilySearch(clearInput = true) {
    searchGate.cancel(); detailRequest += 1;
    state.familySearch = null;
    if (clearInput) $("#browse-search").value = "";
    $("#search-feedback").classList.add("hidden");
    renderFamilySearch(); syncBrowseControls();
  }
  function refreshSearchAddButtons() {
    $$('[data-search-add]').forEach(button => {
      const group = state.familySearch?.groups[Number(button.dataset.group)];
      const item = state.selected.find(item => item.baseword_key === group?.family.baseword_key);
      const added = item?.selected_forms?.some(form => familyResults.normalize(form) === familyResults.normalize(button.dataset.form));
      button.disabled = Boolean(added); button.textContent = added ? "Added ✓" : "Add";
    });
  }
  function renderFamilySearch() {
    const search = state.familySearch, host = $("#family-search-results");
    const active = Boolean(search);
    $("#view-browse").classList.toggle("word-search-mode", active);
    ["#browse-table-shell", ".browse-results-bar", "#view-browse .table-scroll-hint", "#view-browse .pagination"].forEach(selector => $(selector).hidden = active);
    host.hidden = !active;
    if (!search) { host.innerHTML = ""; return; }
    const wordCount = search.groups.reduce((total, group) => total + group.forms.length, 0);
    host.innerHTML = `<div class="family-search-toolbar"><div><h2 tabindex="-1" id="family-search-title">Results for “${esc(search.query)}”</h2><p>${search.loading ? "Finding related words…" : search.groups.length ? `${wordCount.toLocaleString()} word forms · ${search.groups.length} word ${search.groups.length === 1 ? "family" : "families"}` : ""}</p></div><button type="button" id="clear-word-search">Back to all words</button></div>
      ${search.message ? `<p class="search-feedback">${esc(search.message)}${search.outsideCore ? ' <button type="button" id="search-full-database">View in Full database</button>' : ""}</p>` : ""}
      ${search.expression ? compoundUi.html(search.expression,"Find words") : ""}${search.expressionLayerStatus === "UNAVAILABLE" ? '<p class="hint">Connect or update the wordlist to check compound words.</p>' : ""}
      ${search.groups.length ? '<p class="family-search-note">Your search stays first. Choose a word to see its details or add it to your lesson.</p>' : ""}
      ${search.frequencyError ? '<p class="family-search-note" role="status">Word frequencies could not be loaded. You can still view and choose words.<button type="button" class="family-search-retry" id="retry-word-frequencies">Retry frequencies</button></p>' : ""}
      ${search.groups.map((group, groupIndex) => {
        const family = group.family;
        const forms = familyResults.sortedForms(group.forms, search.query, group.frequencies, search.sort);
        const rows = forms.map(({form, isSearch, frequency}) => {
          const withheld = String(form.phase1c_evidence_withheld_fields || "").toLowerCase();
          const rootMeaning = form.root_meaning_alignment_status === "MATCHED_UNIQUE_EXACT" ? form.root_meaning : null;
          return `<tr${isSearch ? ' class="search-hit"' : ""}><th scope="row"><button type="button" class="form-search-link" data-search-view data-group="${groupIndex}" data-form="${esc(form.form)}">${esc(form.form)}</button>${isSearch ? '<span class="your-search">Your search</span>' : ""}</th>
            <td>${integer(frequency)}</td><td>${evidenceBadge("", form.first_seen_hk_textbooks, "textbook") || "—"}</td><td>${evidenceBadge("", form.external_level_reference, "external") || "—"}</td>
            <td>${hasAwl(form, null) ? "AWL" : "—"}</td><td>${subjectTokens(form.msvl, form.academic_subject_evidence)}</td>
            <td>${tokens(form.root,"root")}</td><td>${tokens(rootMeaning,"meaning")}</td><td>${shown(withheld.includes("prefix") ? null : form.prefix)}</td><td>${shown(withheld.includes("suffix") ? null : form.suffix)}</td>
            <td><button type="button" data-search-view data-group="${groupIndex}" data-form="${esc(form.form)}">View</button></td><td><button type="button" class="primary" data-search-add data-group="${groupIndex}" data-form="${esc(form.form)}">Add</button></td></tr>`;
        }).join("");
        return `<section class="family-search-group" aria-label="${esc(family.display_family)} word family"><div class="family-search-heading"><h3>Word family: ${esc(family.display_family)}</h3><span class="set-pill ${statusClass(family.set_membership)}">${statusLabel(family.set_membership)}</span><p>${forms.length} word forms</p><div class="family-summary"><span>Overall rank: <strong>${integer(family.overall_frequency_order)}</strong></span><span>HK family rank / band: <strong>${rankBand(family.current_hk_frequency_rank, family.current_hk_frequency_band)}</strong></span></div></div>
          <div class="family-search-scroll" tabindex="0" role="region" aria-label="All word forms in the ${esc(family.display_family)} family"><table class="family-search-table"><colgroup>${[11,7,9,9,8,12,6,12,6,6,7,7].map(width => `<col style="width:${width}%">`).join("")}</colgroup><thead><tr><th scope="col">Word</th><th scope="col" title="Occurrences of this spelling in ICE-HK and GloWbE-HK">HK word frequency</th><th scope="col" title="Earliest recorded appearance of this word form in the sampled Hong Kong textbooks">First seen in HK textbooks</th><th scope="col" title="US grade reference for this word form; not a Hong Kong curriculum level">US grade reference</th><th scope="col">Academic Word List (AWL)</th><th scope="col">Middle School Vocabulary List (MSVL)</th><th scope="col">Root</th><th scope="col">Root meaning</th><th scope="col">Prefix</th><th scope="col">Suffix</th><th scope="col">View</th><th scope="col">Add</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
      }).join("")}
      ${search.groups.length ? '<p class="family-search-note">HK word frequency counts occurrences of each spelling in ICE-HK and GloWbE-HK.</p>' : ""}`;
    $("#clear-word-search").addEventListener("click", () => { clearFamilySearch(); $("#browse-search").focus(); });
    $("#search-full-database")?.addEventListener("click", () => { state.scope = "full"; syncBrowseControls(); loadFamilies(); searchWordFamily(); });
    $("#retry-word-frequencies")?.addEventListener("click", () => searchWordFamily(search.sort));
    host.querySelectorAll('[data-search-view]').forEach(button => button.addEventListener("click", () => openFamily(search.groups[Number(button.dataset.group)].family.baseword_key, button.dataset.form)));
    host.querySelectorAll('[data-search-add]').forEach(button => button.addEventListener("click", () => addToList(search.groups[Number(button.dataset.group)].family, button.dataset.form, "Find words")));
    compoundUi.bind(host);
    refreshSearchAddButtons();
  }
  async function searchWordFamily(sort = "frequency-desc") {
    const query = $("#browse-search").value.trim();
    if (!query) { clearFamilySearch(); return; }
    const ticket = searchGate.next(), scope = state.scope;
    detailRequest += 1;
    const current = () => searchGate.current(ticket) && state.view === "browse" && state.scope === scope && $("#browse-search").value.trim() === query;
    state.familySearch = {query, sort, loading:true, groups:[], message:"", frequencyError:false};
    renderFamilySearch(); syncBrowseControls();
    try {
      const result = await json(`/search?q=${encodeURIComponent(query)}`);
      if (!current()) return;
      Object.assign(state.familySearch,{expression:result.expression,expressionLayerStatus:result.expression_layer_status});
      const allOwners = [...new Map((result.owners || []).filter(owner => !owner.blocked).map(owner => [owner.baseword_key, owner])).values()];
      const owners = allOwners.filter(owner => scope !== "core" || owner.candidate_member === true || owner.candidate_member === 1);
      if (!owners.length) {
        const outsideCore = allOwners.length > 0 && scope === "core";
        Object.assign(state.familySearch, {loading:false, outsideCore, message:outsideCore ? "This word is in the Full database, outside the Core list." : result.expression ? "" : identityNote(result) || "No entry found. Check the spelling or try another word form."});
      } else {
        const groups = await Promise.all(owners.map(async owner => {
          const [detail, frequency] = await Promise.all([json(`/families/${encodeURIComponent(owner.baseword_key)}`), familyFrequency.load(owner.baseword_key).then(value => ({value}), () => ({error:true, value:{}}))]);
          return {...detail, frequencies:frequency.value, frequencyError:Boolean(frequency.error)};
        }));
        if (!current()) return;
        Object.assign(state.familySearch, {loading:false, groups, frequencyError:groups.some(group => group.frequencyError)});
      }
      renderFamilySearch();
      $("#family-search-title")?.focus({preventScroll:true});
    } catch {
      if (!current()) return;
      Object.assign(state.familySearch, {loading:false, message:"We couldn't load these words. Please try searching again."});
      renderFamilySearch();
    }
  }

  window.HKELE_BROWSE_ADAPTER = Object.freeze({
    async apply(proposedFilters) {
      clearFamilySearch();
      const filters = window.HKELE_AI_FILTER_CONTRACT.validateConditions(proposedFilters);
      const snapshot = {scope:state.scope, sort:state.sort, page:state.page, pageSize:state.pageSize, aiFilters:state.aiFilters, aiRestore:state.aiRestore};
      if (!state.aiFilters) state.aiRestore = {scope:state.scope, sort:state.sort, page:state.page, pageSize:state.pageSize};
      state.aiFilters = filters;
      state.scope = filters.scope === "full" ? "full" : "core";
      state.sort = filters.sort;
      state.page = 1;
      syncBrowseControls();
      const data = await loadFamilies();
      if (!data) {
        Object.assign(state, snapshot);
        syncBrowseControls();
        await loadFamilies();
        throw new Error("The controlled filter could not be applied.");
      }
      return {matchedBeforeLimit:data.matched_before_limit, availableItems:data.available_items};
    },
    async clear() {
      clearFamilySearch();
      if (!state.aiFilters) return;
      const restore = state.aiRestore || {scope:"full", sort:"overall", page:1, pageSize:25};
      state.aiFilters = null;
      state.aiRestore = null;
      Object.assign(state, restore);
      syncBrowseControls();
      await loadFamilies();
    },
  });

  function exactForm(detail) {
    const target = normalized(state.selectedForm);
    return detail?.forms.find(form => normalized(form.normalized_form) === target || normalized(form.form) === target) || null;
  }
  function connections(form, family) {
    return [hasAwl(form, family) ? "AWL" : "", msvlDisplay(form?.msvl, family?.msvl, form?.academic_subject_evidence)].filter(Boolean).join(" · ");
  }
  function evidenceItem(label, value) {
    const content = label === "Root" ? tokens(value,"root") : label === "Root meaning" ? tokens(value,"meaning")
      : label.startsWith("Middle School Vocabulary") ? subjectTokens(value) : shown(value);
    return `<div class="evidence-item"><span>${esc(label)}</span><strong>${content}</strong></div>`;
  }
  function resultEvidenceLabel(label, value) { return evidenceBadge(label, value, label.includes("textbook") ? "textbook" : label.includes("grade") ? "external" : label.includes("subject") ? "subject" : "neutral"); }
  function resultEvidence(owner, evidence, item) {
    const hk = blank(owner?.current_hk_frequency_rank) && blank(owner?.current_hk_frequency_band) ? "" : [blank(owner.current_hk_frequency_rank) ? "" : integer(owner.current_hk_frequency_rank), owner.current_hk_frequency_band || ""].filter(Boolean).join(" · ");
    const subject = item ? subjectText(item) : [hasAwl(evidence, owner) ? "AWL" : "", msvlDisplay(evidence?.msvl, owner?.msvl, evidence?.academic_subject_evidence)].filter(Boolean).join(" · ");
    return [`<span class="set-pill ${statusClass(owner.set_membership)}">${statusLabel(owner.set_membership)}</span>`, resultEvidenceLabel("Overall rank", blank(owner.overall_frequency_order) ? "" : integer(owner.overall_frequency_order)), resultEvidenceLabel("HK rank / band", hk), resultEvidenceLabel("First seen in HK textbooks", evidence?.first_seen_hk_textbooks), resultEvidenceLabel("US grade reference", evidence?.external_level_reference), resultEvidenceLabel("AWL / MSVL / subject", subject)].filter(Boolean).join("");
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

  let detailRequest = 0;
  async function openFamily(key, selected = "") {
    if (key.startsWith("expression:")) { compoundUi.open(state.selected.find(item => item.baseword_key === key)?.expression,"Teaching list"); return; }
    const request = ++detailRequest, origin = state.view, lessonId = state.library.activeId;
    const returnPoint = origin === "word" ? state.wordReturn : {view:origin, y:window.scrollY, target:document.activeElement};
    if (origin === "list" && document.activeElement?.dataset.openForm) {
      returnPoint.selector = `[data-list-key="${CSS.escape(key)}"] [data-open-form="${CSS.escape(document.activeElement.dataset.openForm)}"]`;
    }
    try {
      const detail = await json(`/families/${encodeURIComponent(key)}`);
      if (request !== detailRequest || state.view !== origin || state.library.activeId !== lessonId) return;
      state.detail = detail; state.wordReturn=returnPoint;
      $("#back-to-browse").textContent = origin === "check" ? "← Back to text" : origin === "list" ? "← Back to teaching list" : "← Back to results";
      state.selectedForm = selected || state.detail.family.display_family;
      state.formFilter = "";
      state.formFilters = {hk:new Set(), first:new Set(), external:new Set(), academic:new Set()};
      renderWord(); showView("word");
    } catch (error) { toast("We couldn't complete that action. Please try again."); }
  }

  function firstSeenMatches(actual, wanted) {
    if (wanted === "Primary") return /^P[1-6]$/i.test(actual || "");
    if (wanted === "Secondary") return /^S[1-6]$/i.test(actual || "");
    return normalized(actual) === normalized(wanted);
  }
  const FORM_TIER_DEFINITIONS = [
    {key:"hk", label:"HK textbook records", open:true},
    {key:"external", label:"Other level references", open:true},
    {key:"additional", label:"Other word forms", open:false},
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
      const evidence = wordFormEvidence(form);
      return `<tr class="${picked ? "selected-form" : ""}"><td class="sticky-word"><button class="family-link" data-select-form="${esc(form.form_key)}">${esc(form.form)}</button>${picked ? '<span class="selected-marker">Selected word</span>' : ""}</td><td>${shown(form.first_seen_hk_textbooks)}</td><td>${shown(form.external_level_reference)}</td><td>${evidence.awl ? "AWL" : "—"}</td><td>${subjectTokens(evidence.msvl,evidence.subjects)}</td><td>${tokens(evidence.root,"root")}</td><td>${tokens(evidence.meaning,"meaning")}</td><td>${shown(evidence.prefix)}</td><td>${shown(evidence.suffix)}</td><td><button class="primary" data-add-form="${esc(form.form_key)}">Add</button></td></tr>`;
    }).join("");
    return `<details class="form-tier form-tier-${definition.key}" ${open ? "open" : ""}><summary><span><strong>${esc(definition.label)}</strong></span><span class="tier-count">${visibleForms.length.toLocaleString()} shown of ${total.toLocaleString()}</span></summary><div class="form-table-shell" tabindex="0" aria-label="Complete word form information"><table class="form-detail-table"><colgroup>${[12,11,11,8,15,9,15,6,6,7].map(width=>`<col style="width:${width}%">`).join("")}</colgroup><thead><tr><th scope="col" class="sticky-word">Word</th><th scope="col">First seen in HK textbooks</th><th scope="col">US grade reference</th><th scope="col">Academic Word List (AWL)</th><th scope="col">Middle School Vocabulary List (MSVL)</th><th scope="col">Root</th><th scope="col">Root meaning</th><th scope="col">Prefix</th><th scope="col">Suffix</th><th scope="col">Add</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="tier-empty">No word forms match these filters.</td></tr>'}</tbody></table></div></details>`;
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
    const selectedEvidence = wordFormEvidence(selected);
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
        <header class="word-card-head">
          <div class="word-card-identity"><div class="word-title-line"><h1 id="word-view-title">${shown(selected?.form || state.selectedForm)}</h1><span class="set-pill ${statusClass(family.set_membership)}">${statusLabel(family.set_membership)}</span></div><p class="identity-line">Word family: <strong>${esc(family.display_family)}</strong></p></div>
          <div class="word-card-actions"><p class="hint" data-current-lesson>Adding to: ${esc(state.lessonTitle || "Your lesson")}</p><div class="word-action-buttons"><button class="primary selected-add" data-add-selected>+ Teaching list</button><div class="feedback-word-actions"><button type="button" data-feedback-kind="rating" data-feedback-word="true">Rate this word</button><button type="button" data-feedback-kind="report" data-feedback-word="true">Report a problem</button></div></div></div>
        </header>
        <div class="word-card-evidence">
          <section class="word-evidence-group" aria-labelledby="word-teaching-title"><h2 id="word-teaching-title">Teaching records</h2><div class="evidence-grid">
            ${evidenceItem("First seen in HK textbooks", selected?.first_seen_hk_textbooks)}
            ${evidenceItem("US grade reference", selected?.external_level_reference)}
            ${evidenceItem("Academic Word List (AWL)", selectedEvidence.awl ? "Yes" : null)}
            ${evidenceItem("Middle School Vocabulary List (MSVL)", msvlDisplay(selectedEvidence.msvl,selectedEvidence.subjects))}
          </div></section>
          <section class="word-evidence-group" aria-labelledby="word-parts-title"><h2 id="word-parts-title">Word parts</h2><div class="evidence-grid">
            ${evidenceItem("Root", selectedEvidence.root)}
            ${evidenceItem("Root meaning", selectedEvidence.meaning)}
            ${evidenceItem("Prefix", selectedEvidence.prefix)}
            ${evidenceItem("Suffix", selectedEvidence.suffix)}
          </div></section>
          <section class="word-evidence-group word-family-frequency" aria-labelledby="word-frequency-title"><h2 id="word-frequency-title">Family frequency</h2><div class="evidence-grid">
            ${evidenceItem("Overall frequency rank", overallRank(family.overall_frequency_order))}
            ${evidenceItem("HK frequency rank / band", rankBand(family.current_hk_frequency_rank, family.current_hk_frequency_band))}
          </div></section>
        </div>
      </article>
      <details class="family-summary workspace-disclosure"><summary>Family evidence <span>Frequency, textbook and source records</span></summary>
        <div class="family-summary-head"><div><p class="eyebrow">Family summary</p><h2>${esc(family.display_family)}</h2></div><span class="set-pill ${statusClass(family.set_membership)}">${statusLabel(family.set_membership)}</span></div>
        <div class="evidence-grid summary-grid">
          ${evidenceItem("Overall frequency rank", overallRank(family.overall_frequency_order))}
          ${evidenceItem("HK frequency rank / band", rankBand(family.current_hk_frequency_rank, family.current_hk_frequency_band))}
          ${evidenceItem("First seen in HK textbooks · this family", family.textbook_first_seen_level)}
          ${evidenceItem("Academic Word List (AWL)", family.awl ? "Yes" : null)}
          ${evidenceItem("Middle School Vocabulary List (MSVL)", msvlDisplay(family.msvl))}
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
            ${evidenceItem("Occurrences in NOW-HK news", integer(family.now_hk_tokens))}
          </div>
          <details><summary>Historical General frequency</summary>
            ${evidenceItem("Earlier General frequency (Zipf scale)", family.historical_general_zipf_provenance_only)}
          </details>
        </details>
      </details>
      <section class="family-forms">
        <div class="form-table-heading"><div><p class="eyebrow">Word family</p><h2>Explore word forms</h2><span class="shown-count">Showing ${forms.length.toLocaleString()} of ${detail.forms.length.toLocaleString()} forms</span></div>
        <div class="form-table-controls"><label>Filter forms<input id="form-filter" value="${esc(state.formFilter)}" placeholder="Type part of a word"></label><button id="clear-form-filter">Reset all</button></div></div>
        <details class="workspace-disclosure" ${Object.values(state.formFilters).some(values => values.size) ? "open" : ""}><summary>Filter word forms</summary><div class="form-evidence-filters" aria-label="Word-level evidence filters">
          <div id="form-filter-hk">${multiFilterMarkup("hk", "HK frequency band", formFilterOptions.hk, state.formFilters.hk)}</div>
          <div id="form-filter-first">${multiFilterMarkup("first", "Earliest observed in HK textbooks", formFilterOptions.first, state.formFilters.first)}</div>
          <div id="form-filter-external">${multiFilterMarkup("external", "US grade reference", formFilterOptions.external, state.formFilters.external)}</div>
          <div id="form-filter-academic">${multiFilterMarkup("academic", "AWL / MSVL / subject", formFilterOptions.academic, state.formFilters.academic)}</div>
        </div>
        </details><div class="form-tiers">${tierTables}</div>
        <details class="level-note"><summary>How to read this evidence</summary><p>Textbook levels show the earliest appearance of each form in the sampled Hong Kong textbooks. The family level is the earliest observation across its word forms. US grade references use the US school grading system. AWL and MSVL may link to the whole family. A dash means no recorded value.</p></details>
      </section>`;
    window.dispatchEvent(new CustomEvent("hkele-word-feedback-context", { detail: { word: selected?.form || state.selectedForm, family: family.display_family, familyKey: family.baseword_key } }));
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

  function createLessonItem(family, index) {
    return {data_version:family.data_version, baseword_key:family.baseword_key, display_family:family.display_family, set_membership:family.set_membership,
      overall_frequency_order:family.overall_frequency_order, overall_frequency_value:family.overall_frequency_value,
      general_evidence_status:family.general_evidence_status, general_zipf:family.bawf_family_zipf,
      educational_tokens:family.educational_tokens, ice_hk_tokens:family.ice_hk_tokens,
      glowbe_hk_tokens:family.glowbe_hk_tokens, now_hk_tokens:family.now_hk_tokens,
      hk_corpus_frequency_rank:family.current_hk_frequency_rank, hk_corpus_frequency_band:family.current_hk_frequency_band,
      selected_forms:[], order:index + 1, depth:"Notice", teaching_focus:"", notes:"", connections:""};
  }
  function addToList(family, word, sourceLabel = "Find words") {
    workspace.rememberUndo();
    const merged = lesson.mergeSelections(state.selected, [{family, selectedForms:[word || family.display_family], sourceLabel}], createLessonItem);
    state.selected = merged.items;
    const saved = saveList();
    toast(saved ? `${word || family.display_family} added to ${state.lessonTitle || "your lesson"}.` : `${word || family.display_family} added on this page. Save or export your changes.`);
  }
  async function addFamilyByKey(key) {
    const row = state.rows.find(item => item.baseword_key === key);
    if (row) addToList(row, row.display_family);
    else try { const lessonId = state.library.activeId; const detail = await json(`/families/${encodeURIComponent(key)}`); if (state.library.activeId === lessonId) addToList(detail.family, detail.family.display_family); } catch (error) { toast("We couldn't complete that action. Please try again."); }
  }
  function updateListCount() {
    const count=lesson.wordCount(state.selected);
    $("#list-count").textContent=count;
    $("#preteach-open-list").textContent=`View teaching list (${count})`;
  }

  async function refreshSelectedFromDatabase() {
    if (!state.selected.length) return;
    const lessonId = state.library.activeId, editVersion = state.lessonEditVersion;
    const refreshed = await Promise.all(state.selected.map(async item => {
      try {
        if(item.record_type === "compound") return globalThis.HKELE_COMPOUND_TEACHING.refresh(item,await window.HKELE_COMPOUNDS.lookup(item.expression.normalizedExpression,item.data_version));
        const detail = await json(`/families/${encodeURIComponent(item.baseword_key)}`);
        return globalThis.HKELE_LESSON_DATA_REFRESH.refresh(item, detail);
      } catch { return {...item, data_review_status:"Saved selection kept — reconnect to check its word details."}; }
    }));
    if (lessonId !== state.library.activeId || editVersion !== state.lessonEditVersion) return;
    state.selected = refreshed;
    saveList();
  }

  function renderTextFilterControls() {
    const definitions = [
      ["hk", "HK frequency band"], ["first", "Earliest observed in HK textbooks"],
      ["external", "US grade reference"], ["academic", "AWL / MSVL / subject"],
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
    if (item.status === "REGISTERED_EXPRESSION" && item.expression) return "compound";
    if (contractionDescription(item)) return "contractions";
    if (item.status === "UNMATCHED") return "unmatched";
    const owner = itemOwner(item);
    if (!owner || item.status !== "RESOLVED") return "review";
    if (state.commonTokens.has(item.normalized_token)) return "common";
    if (owner.candidate_member) return "core";
    return "other";
  }
  function summarizeTextItems(items) {
    const summary = Object.fromEntries(["core","other","compound","contractions","review","common","unmatched"].map(key => [key,{words:0,occurrences:0}]));
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
    if(item.status === "REGISTERED_EXPRESSION" && item.expression) return compoundUi.html(item.expression,"Check a text");
    const context = `<details class="level-note"><summary>Original wording${item.surface_forms?.length ? `: ${item.surface_forms.map(esc).join(" / ")}` : ""}</summary>${(item.context_examples || []).map(text => `<p>${esc(text)}</p>`).join("")}</details>`;
    const expression = contractionDescription(item);
    if (expression) return `<article class="text-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><span>Full form</span><p>${esc(expression)}</p>${expression.includes(" / ") ? '<p class="hint">The sentence tells you which meaning fits.</p>' : ''}</div><div></div></article>`;
    if (item.status === "AMBIGUOUS" && item.owners?.length) {
      const ownerCards = item.owners.filter(owner => !owner.blocked).map(owner => {
        const evidence = owner.matched_form_evidence;
        return `<div class="ambiguous-owner"><div class="result-family-line"><span>Possible word family</span><strong>${esc(owner.display_family)}</strong></div><div class="result-evidence">${resultEvidence(owner, evidence, null)}</div><div class="result-actions"><button data-result-view="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">View</button><button class="primary" data-result-add="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">Add</button></div></div>`;
      }).join("");
      return `<article class="text-result ambiguous-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><p class="review-note">This form has several matching word families. Select the one that fits your text.</p>${ownerCards}</div><div></div></article>`;
    }
    const owner = itemOwner(item), evidence = exactEvidence(item);
    if (!owner || item.status !== "RESOLVED") {
      const note = identityNote(item) || (item.status === "UNMATCHED" ? "" : "Check the reading in this sentence before choosing a family.");
      return `<article class="text-result"><div><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div class="review-note">${esc(note)}</div><div></div></article>`;
    }
    return `<article class="text-result"><div class="result-token"><span class="observed-word">${esc(item.display_word)}</span><span class="occurrence-count">${item.count} occurrence${item.count === 1 ? "" : "s"}</span>${context}</div><div><div class="result-family-line"><span>Word family</span><strong>${esc(owner.display_family)}</strong></div><div class="result-evidence">${resultEvidence(owner, evidence, item)}</div></div><div class="result-actions"><button data-result-view="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">View</button><button class="primary" data-result-add="${esc(owner.baseword_key)}" data-result-form="${esc(evidence?.form || item.display_word)}">Add</button></div></article>`;
  }
  function renderTextResults() {
    if (!state.textItems.length) return;
    const definitions = [
      ["core", "Core list words", true], ["other", "Other database words", true], ["compound", "Compound words", true],
      ["contractions", "Contractions and expressions", false], ["unmatched", "Words without a data match", false], ["review", "Words that need a context check", false], ["common", "Common words", $("#filter-common").checked],
    ];
    const activeFilters = Object.values(state.textFilters).reduce((count, values) => count + values.size, 0) + ($("#filter-word-set").value !== "all" ? 1 : 0) + ($("#filter-common").checked ? 1 : 0);
    $("#active-filter-count").textContent = activeFilters ? `${activeFilters} active` : "All words";
    const summary = summarizeTextItems(state.textItems);
    const languageNotes = {words:summary.contractions.words + summary.review.words, occurrences:summary.contractions.occurrences + summary.review.occurrences};
    $("#text-summary").classList.remove("hidden");
    $("#text-summary").innerHTML = `<div class="text-summary-heading"><div><h3>Vocabulary summary</h3></div><p>${summary.common.words.toLocaleString()} common word${summary.common.words === 1 ? " is" : "s are"} grouped separately below.</p></div><div class="text-summary-grid">${textSummaryCard("Core list", summary.core, "summary-candidate")}${textSummaryCard("Other database words", summary.other, "summary-other")}${summary.compound.words ? textSummaryCard("Compounds",summary.compound,"summary-other") : ""}${textSummaryCard("Language notes", languageNotes, "summary-notes")}</div>`;
    let shownUnique = 0;
    const html = definitions.map(([key, label, normallyOpen]) => {
      const all = state.textItems.filter(item => itemGroup(item) === key);
      const filtered = sortItems(all.filter(passesFilters)); shownUnique += filtered.length;
      if (!all.length) return "";
      const occurrences = all.reduce((sum, item) => sum + item.count, 0);
      const open = key === "common" ? $("#filter-common").checked : normallyOpen;
      return `<details class="result-group group-${key}" ${open ? "open" : ""}><summary>${label} <span>${filtered.length} of ${all.length} grouped words · ${occurrences} occurrences</span></summary><div class="result-group-content">${key === "unmatched" ? '<p class="hint">No entry found. Check spelling; some common words and compounds are not included.</p>' : ""}${filtered.length ? filtered.map(resultCard).join("") : '<p class="hint">No words in this group match the current filters.</p>'}</div></details>`;
    }).join("");
    $("#text-results").className = "result-groups"; $("#text-results").innerHTML = html;
    compoundUi.bind($("#text-results"));
    const totalOccurrences = state.textItems.reduce((sum, item) => sum + item.count, 0);
    $("#result-count").textContent = `${state.textItems.length} grouped words from ${totalOccurrences} occurrences · ${shownUnique} match the current filters`;
    $$('[data-result-view]').forEach(button => button.addEventListener("click", () => openFamily(button.dataset.resultView, button.dataset.resultForm)));
    $$('[data-result-add]').forEach(button => button.addEventListener("click", () => {
      for (const item of state.textItems) {
        const owner = item.owners?.find(value => value.baseword_key === button.dataset.resultAdd && !value.blocked);
        if (owner && normalized(owner.matched_form_evidence?.form || item.display_word) === normalized(button.dataset.resultForm)) { addToList(owner, button.dataset.resultForm, "Check a text"); break; }
      }
    }));
  }

  async function checkText() {
    const source = $("#text-input").value;
    const request = ++state.textRequest;
    $("#check-message").textContent="";
    $("#check-button").disabled=true; $("#check-button").textContent="Checking…";
    try {
      const occurrences = HKELE_TOKENIZER.tokenize(source, 500);
      if (!occurrences.length) throw new Error("EMPTY_TEXT");
      const data = await json("/occurrences/resolve", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({occurrences})});
      if (request !== state.textRequest || $("#text-input").value !== source) return;
      state.textAudit = data.occurrences;
      state.checkedText = source;
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
      state.textItems = [...grouped.values()]; state.lessonSelection.clear(); state.lessonLimit=6; state.lessonQuery="";
      workspace.renderPicker();
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
      textWorkspace.render({reset:true}); textWorkspace.reveal("#checked-reader");
    } catch (error) {
      if (request !== state.textRequest) return;
      textWorkspace.hideResults();
      $("#check-message").textContent = error.message === "EMPTY_TEXT" ? "Add some English text to check." : error.message?.startsWith("The technical limit is") ? "Check up to 500 words at a time. Split a longer passage into sections." : "We couldn't check this text. Check the text and your connection, then try again.";
    } finally {
      if (request === state.textRequest) {$("#check-button").disabled=false;$("#check-button").textContent="Check text";}
    }
  }

  function clearTextWorkspace() {
    state.textRequest += 1; state.checkedText=null; textWorkspace.hideResults();
    $("#check-message").textContent=""; $("#check-button").disabled=false; $("#check-button").textContent="Check text";
    $("#text-input").value = "";
    $("#text-count").textContent = "0 characters";
    state.textAudit = [];
    state.textItems = []; workspace.hidePicker();
    $("#text-summary").classList.add("hidden");
    $("#text-summary").innerHTML = "";
    $("#text-results").className = "empty-state";
    $("#text-results").textContent = "Your grouped results will appear here.";
    $("#result-count").textContent = "No text checked";
  }

  function resetFilters() {
    $("#filter-word-set").value = "all";
    Object.values(state.textFilters).forEach(values => values.clear());
    $("#filter-common").checked = false; $("#text-sort").value = "hk";
    renderTextFilterControls(); renderTextResults();
  }

  function renderList() { workspace.renderList(); }
  function exportItems() { return [...state.selected].sort((a,b) => a.order-b.order).map(item => ({teacher_order:item.order, record_type:item.record_type || "family", expression:item.expression, word_family:item.record_type === "compound" ? "" : item.display_family, selected_forms:[...item.selected_forms], status:item.record_type === "compound" ? "Compound" : statusLabel(item.set_membership), overall_frequency_rank:item.overall_frequency_order, overall_score:item.overall_frequency_value, general_availability:item.general_evidence_status === "UNAVAILABLE_NOT_ZERO" || blank(item.general_zipf) ? "" : "Available", general_zipf:item.general_zipf, educational_tokens:item.educational_tokens, ice_hk_tokens:item.ice_hk_tokens, glowbe_hk_tokens:item.glowbe_hk_tokens, now_hk_tokens:item.now_hk_tokens, hk_corpus_frequency_rank:item.hk_corpus_frequency_rank, hk_corpus_frequency_band:item.hk_corpus_frequency_band, teaching_depth:item.depth, teacher_notes:item.notes, semantic_notes:item.connections, lesson_title:state.lessonTitle, teaching_plan:lesson.focusLabel(item.teaching_focus), source_labels:(item.source_labels || []).join(" | "), data_version:item.data_version || "2026-09-14-package67-v1", saved_selection_status:item.data_review_status || ""})); }
  function download(name, type, content) { const blob = content instanceof Blob ? content : new Blob([content], {type}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
  const csvCell = value => `"${String(value ?? "").replaceAll('"','""')}"`;
  function lessonExportRows() {
    const headers=["Lesson","Order","Selected word","Teaching plan","Teaching notes","Related words or example","Word family","Added from","Word list","Overall rank","HK rank","HK band","Previous teaching depth","Family key","Overall score","General availability","General Zipf","Educational tokens","ICE-HK tokens","GloWbE-HK tokens","NOW-HK tokens","Data version","Saved selection status"];
    const items=[...state.selected].sort((a,b)=>a.order-b.order);
    const rows=exportItems().flatMap((item,index)=>item.selected_forms.map(form=>[item.lesson_title,index+1,form,item.teaching_plan,item.teacher_notes,item.semantic_notes,item.word_family,item.source_labels,item.status,item.overall_frequency_rank,item.hk_corpus_frequency_rank,item.hk_corpus_frequency_band,item.teaching_depth,items[index].record_type === "compound" ? "" : items[index].baseword_key,item.overall_score,item.general_availability,item.general_zipf,item.educational_tokens,item.ice_hk_tokens,item.glowbe_hk_tokens,item.now_hk_tokens,item.data_version,item.saved_selection_status]));
    if(items.some(item=>item.record_type === "compound")) {
      headers.push("Record type","Expression ID","Compound data version");
      const sources=items.flatMap(item=>item.selected_forms.map(()=>item));
      rows.forEach((row,index)=>row.push(sources[index].record_type === "compound" ? "Compound" : "Word family",sources[index].expression?.expressionId || "",sources[index].expression?.sourceVersion || ""));
    }
    return [headers,...rows];
  }
  function exportCsv() { download("HK-ELE_Teaching_List.csv","text/csv;charset=utf-8",lessonExportRows().map(row=>row.map(csvCell).join(",")).join("\r\n")); }
  function exportMarkdown() {
    const clean=value=>String(value || "").replace(/\r?\n/g," ");
    const rows=exportItems();
    const body=rows.map((item,index)=>`${index+1}. ${clean(item.selected_forms.join(", "))} — ${item.record_type === "compound" ? "Compound" : clean(item.word_family)}${item.expression ? `\n   - Expression ID: ${item.expression.expressionId}\n   - Compound data version: ${item.expression.sourceVersion}` : ""}\n   - Teaching plan: ${item.teaching_plan}\n   - Notes: ${clean(item.teacher_notes) || "—"}\n   - Related words or example: ${clean(item.semantic_notes) || "—"}\n   - Added from: ${clean(item.source_labels) || "—"}\n   - Previous teaching depth: ${clean(item.teaching_depth) || "—"}${item.saved_selection_status ? `\n   - ${clean(item.saved_selection_status)}` : ""}`).join("\n\n");
    download("HK-ELE_Teaching_List.md","text/markdown;charset=utf-8",`# Teaching List\n\nLesson: ${clean(state.lessonTitle)}\n\n${body}\n`);
  }
  async function exportExcel() {
    try {
      if (!window.HKELE_XLSX) throw new Error("Excel export is not available.");
      window.HKELE_XLSX.download(lessonExportRows(), "HK-ELE_Teaching_List.xlsx");
    } catch { toast("We couldn't export your list. Please try again."); }
  }

  function bind() {
    $$(".nav-button").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$(".scope").forEach(button => button.addEventListener("click", () => {
      clearAiForManualBrowseChange(); state.scope=button.dataset.scope; state.page=1; syncBrowseControls();
      loadFamilies();
      if (state.familySearch) searchWordFamily(state.familySearch.sort);
    }));
    $("#sort-select").addEventListener("change", event => {
      if (state.familySearch) { state.familySearch.sort=event.target.value; renderFamilySearch(); return; }
      clearAiForManualBrowseChange(); state.sort=event.target.value; state.page=1; loadFamilies();
    });
    $("#page-size").addEventListener("change", event => { state.pageSize=Number(event.target.value); state.page=1; loadFamilies(); });
    $("#prev-page").addEventListener("click", () => { if(state.page>1){state.page-=1;loadFamilies();} });
    $("#next-page").addEventListener("click", () => { state.page+=1;loadFamilies(); });
    $("#browse-search-form").addEventListener("submit", event => { event.preventDefault(); searchWordFamily(); });
    $("#browse-search").addEventListener("input", () => clearFamilySearch(false));
    $("#back-to-browse").addEventListener("click", () => showView(state.wordReturn?.view || "browse", true));
    $("#text-input").addEventListener("input", event => {
      $("#text-count").textContent=`${event.target.value.length.toLocaleString()} characters`;
      state.textRequest += 1;
      $("#check-button").disabled=false; $("#check-button").textContent="Check text";
      $("#check-message").textContent=""; textWorkspace.hideResults();
    });
    $("#check-button").addEventListener("click", checkText);
    $("#clear-text").addEventListener("click", clearTextWorkspace);
    ["#filter-word-set","#filter-common","#text-sort"].forEach(selector => $(selector).addEventListener("change", renderTextResults));
    $("#reset-filters").addEventListener("click", resetFilters);
    $("#clear-list").addEventListener("click", () => { if(state.selected.length && !confirm("Remove all words from this lesson?")) return; workspace.rememberUndo(); state.selected=[]; saveList(); renderList(); });
    $("#export-csv").addEventListener("click", exportCsv); $("#export-md").addEventListener("click", exportMarkdown); $("#export-xlsx").addEventListener("click", exportExcel);
    window.addEventListener("hashchange", () => { const view=location.hash.slice(1); if(view !== state.view && ["home","browse","check","list"].includes(view))showView(view); });
  }

  async function init() {
    buildColumnMenu(); bind(); workspace.bind(); textWorkspace.bind(); libraryUi.bind(); saveList(); updateListCount(); clearTextWorkspace();
    await Promise.all([loadFamilies(), loadFilterConfig(), refreshSelectedFromDatabase()]);
    const view=location.hash.slice(1); showView(["home","browse","check","list"].includes(view) ? view : "home");
  }
  const compoundUi = globalThis.HKELE_COMPOUND_UI.create({state,esc,openFamily,onChanged:()=>{saveList();updateListCount();refreshLessonContext();renderList();}});
  const workspace = globalThis.HKELE_LESSON_WORKSPACE.create({state, $, $$, esc, saveList, updateListCount, showView, openFamily, createLessonItem, contractionDescription, toast});
  const textWorkspace = globalThis.HKELE_TEXT_WORKSPACE.create({state, $, esc, openFamily, addToList, contractionDescription, showView, compoundUi});
  const libraryUi = globalThis.HKELE_LESSON_LIBRARY_UI.create({state, store:lessonStore, $, esc, saveList, renderList, exportCsv,
    refreshContext:() => { detailRequest += 1; textWorkspace.resetLessonContext(); refreshLessonContext(); workspace.renderPicker(); }
  });
  init().catch(error => toast("We couldn't complete that action. Please try again."));
})();
