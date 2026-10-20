(function (root) {
  "use strict";
  function segments(text, occurrences) {
    const parts = []; let cursor = 0;
    for (const item of [...occurrences].sort((a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset)) {
      const start = item.start_offset, end = item.end_offset;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > text.length) continue;
      if (start > cursor) parts.push({text:text.slice(cursor, start)});
      const surface = text.slice(start, end);
      parts.push({text:surface, ...(surface === item.surface ? {item} : {})}); cursor = end;
    }
    if (cursor < text.length) parts.push({text:text.slice(cursor)});
    return parts;
  }
  const flag = value => value === true || value === 1;
  const levels = {P1:1,P2:2,P3:3,P4:4,P5:5,P6:6,S1:7,S2:8,S3:9};
  function suggestions(occurrences, common, classLevel = null) {
    const groups = new Map();
    for (const item of occurrences) {
      if (item.status !== "RESOLVED" || item.owners?.length !== 1 || common.has(item.normalized_token) || /^[A-Z]/.test(item.surface)) continue;
      const family = item.owners[0];
      if (family.blocked || flag(family.display_blocked)) continue;
      const group = groups.get(family.baseword_key) || {family, items:[]};
      group.items.push(item); groups.set(family.baseword_key, group);
    }
    const entries = [];
    for (const [key, {family, items}] of groups) {
      const reasons = [], rank = family.current_hk_frequency_rank;
      if (rank != null && rank > 2000) reasons.push("Beyond HK Top 2k");
      else if (rank != null && rank > 1000) reasons.push("Beyond HK Top 1k");
      if (flag(family.awl)) reasons.push("Academic vocabulary (AWL)");
      if (family.msvl != null && family.msvl !== "" && family.msvl !== 0) reasons.push("Subject vocabulary");
      if (items.length >= 2) reasons.push(`Family appears ${items.length} times`);
      const evidence = items.map(item => item.owners[0].matched_form_evidence).find(Boolean);
      if (evidence && (evidence.root || evidence.prefix || evidence.suffix)) reasons.push("Word parts available");
      const firstForm = items[0].owners[0].matched_form_evidence;
      const first = firstForm ? firstForm.first_seen_hk_textbooks : family.textbook_first_seen_level;
      const level = String(first || "").toUpperCase().match(/\b([PS][1-6])\b/)?.[1];
      if (classLevel && level && levels[level] > levels[classLevel]) reasons.unshift(`${firstForm ? "Textbooks" : "Family first seen"}: ${first}`);
      if (!flag(family.candidate_member)) reasons.push("Outside Core list");
      if (reasons.length) entries.push({key, family, form:items[0].surface, count:items.length, reasons});
    }
    return entries.sort((a,b) => b.reasons.length-a.reasons.length || b.count-a.count ||
      (b.family.current_hk_frequency_rank ?? 0)-(a.family.current_hk_frequency_rank ?? 0) || a.family.display_family.localeCompare(b.family.display_family)).slice(0,8);
  }

  function create({state, $, esc, openFamily, addToList, contractionDescription, showView}) {
    let classLevel = null, limit = 4, commonOn = false, hkOn = false;
    const dialog = document.createElement("dialog");
    dialog.className = "text-word-dialog"; dialog.setAttribute("aria-labelledby", "text-word-title");
    document.body.appendChild(dialog);
    function reveal(id) {
      const node = $(id), headerHeight = $(".site-header")?.getBoundingClientRect().height || 0;
      window.scrollTo({top:Math.max(0,window.scrollY+node.getBoundingClientRect().top-headerHeight-16),behavior:"smooth"});
      node.focus({preventScroll:true});
    }
    function openOccurrence(item) {
      const owners = (item.owners || []).filter(owner => !owner.blocked && !owner.display_blocked);
      const expansion = contractionDescription(item);
      if (!expansion && item.status === "RESOLVED" && item.owners.length === 1 && owners.length === 1) {
        void openFamily(owners[0].baseword_key, owners[0].matched_form_evidence?.form || item.surface); return;
      }
      dialog.innerHTML = `<h2 id="text-word-title">${esc(item.surface)}</h2>${expansion
        ? `<p>Full form: ${esc(expansion)}</p>`
        : item.status === "AMBIGUOUS" && owners.length
          ? `<p>Choose the family that fits this sentence.</p>${owners.map((owner,index)=>`<button data-reader-owner="${index}">${esc(owner.display_family)}</button>`).join("")}`
          : `<p>${item.status === "UNSUPPORTED" ? "Try the English spelling of this word." : item.status === "BLOCKED" ? "Check the spelling or use in this sentence." : "No entry found in the wordlist."}</p>`}<button data-reader-close>Close</button>`;
      dialog.querySelectorAll("[data-reader-owner]").forEach(button => button.addEventListener("click", () => {
        const owner = owners[Number(button.dataset.readerOwner)]; dialog.close();
        void openFamily(owner.baseword_key, owner.matched_form_evidence?.form || item.surface);
      }));
      dialog.querySelector("[data-reader-close]").addEventListener("click", () => dialog.close()); dialog.showModal();
    }
    function renderReader() {
      $("#passage-words").innerHTML = segments(state.checkedText || "", state.textAudit).map(part => {
        if (!part.item) return esc(part.text);
        const item = part.item, owner = item.status === "RESOLVED" && item.owners.length === 1 && !item.owners[0].blocked && !item.owners[0].display_blocked ? item.owners[0] : null;
        const rank = owner?.current_hk_frequency_rank;
        const band = !hkOn || rank == null ? "" : rank <= 1000 ? "hk-top" : rank <= 2000 ? "hk-next" : "hk-later";
        const common = commonOn && state.commonTokens.has(item.normalized_token);
        return `<button type="button" class="passage-word ${band}${common ? " is-common" : ""}" data-reader-word="${esc(item.occurrence_id)}" aria-label="${esc(item.surface)}">${esc(part.text)}</button>`;
      }).join("");
      $("#passage-words").querySelectorAll("[data-reader-word]").forEach(button => button.addEventListener("click", () => {
        const item = state.textAudit.find(row => row.occurrence_id === button.dataset.readerWord); if (item) openOccurrence(item);
      }));
      $("#reader-legend").innerHTML = `${commonOn ? '<span class="is-common">Common words</span>' : ""}${hkOn ? '<span class="hk-top">HK Top 1k</span><span class="hk-next">HK Next 1k</span><span class="hk-later">HK rank 2,001+</span>' : ""}`;
    }
    function refreshSuggestions() {
      if (state.checkedText === null) return;
      const entries = suggestions(state.textAudit.filter(item => !contractionDescription(item)), state.commonTokens, classLevel);
      $("#preteach-lesson").textContent = `Adding to: ${state.lessonTitle || "Your lesson"}`;
      $("#preteach-items").innerHTML = entries.slice(0,limit).map((entry,index) => {
        const added = state.selected.some(item => item.baseword_key === entry.key && item.selected_forms.some(form=>form.toLocaleLowerCase()===entry.form.toLocaleLowerCase()));
        return `<article class="preteach-word"><div><button class="family-link" data-preteach-view="${index}">${esc(entry.form)}</button>${entry.form.toLocaleLowerCase() !== entry.family.display_family.toLocaleLowerCase() ? `<small>Family: ${esc(entry.family.display_family)}</small>` : ""}<div class="preteach-reasons">${entry.reasons.slice(0,2).map(reason=>`<span>${esc(reason)}</span>`).join("")}</div></div><button data-preteach-add="${index}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button></article>`;
      }).join("") || '<p class="hint">No suggestions for this class level. You can choose words directly from the text.</p>';
      $("#preteach-items").querySelectorAll("[data-preteach-view]").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries[Number(button.dataset.preteachView)]; void openFamily(entry.key,entry.form);
      }));
      $("#preteach-items").querySelectorAll("[data-preteach-add]").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries[Number(button.dataset.preteachAdd)]; addToList(entry.family,entry.form,"Pre-teaching review");
        $("#preteach-items").querySelector(`[data-preteach-view="${button.dataset.preteachAdd}"]`)?.focus({preventScroll:true});
      }));
      $("#preteach-more").hidden = entries.length <= limit;
      $("#preteach-more").textContent = `Show ${Math.max(0,entries.length-limit)} more suggestions`;
    }
    function hideResults() {
      $("#checked-workspace").hidden = true; $("#check-compose").hidden = false;
      $("#return-checked").hidden = state.checkedText === null;
      if (dialog.open) dialog.close();
    }
    function render({reset = false} = {}) {
      if (reset) { limit=4; $("#lesson-picker-disclosure").open=false; $("#all-text-details").open=false; }
      $("#check-compose").hidden=true; $("#checked-workspace").hidden=false;
      $("#check-message").textContent="";
      $("#reader-word-count").textContent = `${state.textAudit.length} words · ${new Set(state.textAudit.filter(item=>item.status==="RESOLVED" && item.owners?.length===1).map(item=>item.owners[0].baseword_key)).size} families`;
      $("#reader-to-suggestions").hidden = state.textAudit.length <= 80;
      $("#suggestions-to-reader").hidden = state.textAudit.length <= 80;
      renderReader(); refreshSuggestions();
    }
    function bind() {
      $("#edit-checked-text").addEventListener("click",()=>{hideResults(); $("#text-input").focus();});
      $("#return-checked").addEventListener("click",()=>{
        if (state.checkedText === null) return;
        state.textRequest += 1; $("#check-button").disabled=false; $("#check-button").textContent="Check text";
        $("#text-input").value=state.checkedText; $("#text-count").textContent=`${state.checkedText.length} characters`; render(); reveal("#checked-reader");
      });
      $("#reader-to-suggestions").addEventListener("click",()=>reveal("#preteach-panel"));
      $("#suggestions-to-reader").addEventListener("click",()=>reveal("#checked-reader"));
      $("#reader-common").addEventListener("change",event=>{commonOn=event.target.checked;renderReader();});
      $("#reader-hk").addEventListener("change",event=>{hkOn=event.target.checked;renderReader();});
      $("#preteach-level").addEventListener("change",event=>{classLevel=event.target.value || null;limit=4;refreshSuggestions();});
      $("#preteach-more").addEventListener("click",()=>{limit=8;refreshSuggestions();});
      $("#preteach-open-list").addEventListener("click",()=>showView("list"));
    }
    function resetLessonContext() {
      classLevel = null; limit = 4; $("#preteach-level").value = "";
      $("#lesson-picker-disclosure").open = false;
      refreshSuggestions();
    }
    return {bind, render, hideResults, refreshSuggestions, reveal, resetLessonContext};
  }
  root.HKELE_TEXT_WORKSPACE = Object.freeze({segments, suggestions, create});
})(globalThis);
