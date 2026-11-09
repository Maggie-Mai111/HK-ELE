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
  const wordKey = value => String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[’‘]/g, "'");
  function wordOccurrences(occurrences, surface) {
    const key = wordKey(surface);
    return occurrences.filter(item => wordKey(item.surface) === key);
  }
  function occurrenceExcerpt(text, item) {
    const start = item.start_offset, end = item.end_offset;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length || text.slice(start, end) !== item.surface)
      return {before:"", word:item.surface, after:""};
    const left = Math.max(0, start - 70), right = Math.min(text.length, end + 70);
    return {before:(left ? "…" : "") + text.slice(left, start), word:text.slice(start,end), after:text.slice(end,right) + (right < text.length ? "…" : "")};
  }
  const flag = value => value === true || value === 1;
  const levels = {P1:1,P2:2,P3:3,P4:4,P5:5,P6:6,S1:7,S2:8,S3:9};
  function suggestions(occurrences, _common, classLevel = null, options = {}) {
    const filter=options.filter || "marked", judgements=options.judgements || {}, groups=new Map();
    for (const item of occurrences) {
      if(item.status!=="RESOLVED" || item.owners?.length!==1)continue;
      const family=item.owners[0];if(family.blocked || flag(family.display_blocked))continue;
      const key=family.baseword_key+"\u0000"+wordKey(item.surface);
      const group=groups.get(key)||{family,items:[]};group.items.push(item);groups.set(key,group);
    }
    const entries=[];
    for(const [selectionKey,{family,items}] of groups){
      const marked=items.filter(item=>judgements[item.occurrence_id]===false), first=marked[0]||items[0];
      const evidence=first.owners[0].matched_form_evidence,rank=family.current_hk_frequency_rank;
      const level=String(evidence?.first_seen_hk_textbooks||"").toUpperCase().match(/\b([PS][1-6])\b/)?.[1];
      const laterThanClass=!!classLevel && !!level && levels[level]>levels[classLevel];
      const subject=evidence?.msvl!=null && evidence.msvl!=="" && evidence.msvl!==0;
      if(filter==="marked" && !marked.length)continue;
      if(filter==="academic" && !flag(evidence?.awl) && !subject)continue;
      if(filter==="later" && !laterThanClass)continue;
      if(filter==="repeated" && items.length<2)continue;
      const reasons=[];
      if(marked.length)reasons.push("You marked this use May need explaining");
      if(evidence?.first_seen_hk_textbooks)reasons.push(`Textbooks: ${evidence.first_seen_hk_textbooks}${laterThanClass ? ` · after ${classLevel}` : ""}`);
      if(flag(evidence?.awl))reasons.push("Listed in AWL");
      if(subject)reasons.push(`MSVL: ${evidence.msvl}`);
      if(rank!=null)reasons.push(`HK family rank: ${rank.toLocaleString("en")}`);
      if(evidence && (evidence.root||evidence.prefix||evidence.suffix))reasons.push("Word parts available");
      entries.push({key:family.baseword_key,selectionKey,family,form:first.surface,count:items.length,reasons,laterThanClass,firstOrder:first.occurrence_order,marked:marked.length>0,markedCount:marked.length,occurrence:first});
    }
    return entries.sort((a,b)=>filter==="marked" ? a.firstOrder-b.firstOrder : b.count-a.count||a.firstOrder-b.firstOrder);
  }
  function markedOtherOccurrences(occurrences, judgements) {
    return occurrences.filter(item=>judgements[item.occurrence_id]===false && /[A-Za-z]/.test(item.surface)
      && !(item.status==="RESOLVED" && item.owners?.length===1 && !item.owners[0].blocked && !flag(item.owners[0].display_blocked)));
  }
  // Group the existing ordered suggestions for display only; no eligibility or rank changes.
  function groupSuggestions(entries) {
    const groups = new Map();
    entries.forEach((entry, index) => {
      const group = groups.get(entry.key) || {key:entry.key, family:entry.family.display_family, forms:[]};
      group.forms.push({entry,index}); groups.set(entry.key,group);
    });
    return [...groups.values()];
  }
  function suggestionEvidence(entry) {
    const reasons=entry.reasons;
    const primary=reasons.find(reason=>reason==="You marked this use May need explaining");
    const label=reason=>reason==="Listed in AWL" ? "Listed in the Academic Word List"
      : reason.startsWith("MSVL:") ? reason.replace("MSVL:","Subject list:") : reason;
    return {primary:primary ? label(primary) : null,
      extra:reasons.filter(reason=>reason!==primary && !reason.startsWith("Appears ")).map(label)};
  }

  function create({state, $, esc, openFamily, addToList, contractionDescription, showView, compoundUi}) {
    let classLevel = null, limit = 4, commonOn = false, hkOn = false, reviewFilter = "marked";
    let judgements = {};
    const dialog = document.createElement("dialog");
    dialog.className = "text-word-dialog"; dialog.setAttribute("aria-labelledby", "text-word-title");
    document.body.appendChild(dialog);
    function reveal(id) {
      const node = $(id), headerHeight = $(".site-header")?.getBoundingClientRect().height || 0;
      window.scrollTo({top:Math.max(0,window.scrollY+node.getBoundingClientRect().top-headerHeight-16),behavior:"smooth"});
      node.focus({preventScroll:true});
    }
    function openOccurrence(item) {
      if(item.status === "REGISTERED_EXPRESSION" && item.expression && compoundUi) {const host=compoundUi.open(item.expression,"Check a text");if(host)mountReviewTools(host.querySelector("[data-compound-close]"),item.surface,item,true);return;}
      const owners = (item.owners || []).filter(owner => !owner.blocked && !owner.display_blocked);
      const expansion = contractionDescription(item);
      if (!expansion && item.status === "RESOLVED" && item.owners.length === 1 && owners.length === 1) {
        void openFamily(owners[0].baseword_key, owners[0].matched_form_evidence?.form || item.surface, item); return;
      }
      dialog.innerHTML = `<h2 id="text-word-title">${esc(item.surface)}</h2>${expansion
        ? `<p>Full form: ${esc(expansion)}</p>`
        : item.status === "AMBIGUOUS" && owners.length
          ? `<p>Choose the family that fits this sentence.</p>${owners.map((owner,index)=>`<button data-reader-owner="${index}">${esc(owner.display_family)}</button>`).join("")}`
        : `<p>${item.status === "UNSUPPORTED" ? "No word entry for this part. You can still explore the other words in your text." : item.status === "BLOCKED" ? "Check the spelling or use in this sentence." : "No automatic match in this text."}</p>`}<button data-reader-close>Close</button>`;
      dialog.querySelectorAll("[data-reader-owner]").forEach(button => button.addEventListener("click", () => {
        const owner = owners[Number(button.dataset.readerOwner)]; dialog.close();
        void openFamily(owner.baseword_key, owner.matched_form_evidence?.form || item.surface, item);
      }));
      if (/[A-Za-z]/.test(item.surface)) mountReviewTools(dialog.querySelector("[data-reader-close]"), item.surface, item, true);
      dialog.querySelector("[data-reader-close]").addEventListener("click", () => dialog.close()); dialog.showModal();
    }
    function mountReviewTools(host, surface, selectedItem = state.reviewOccurrence, before = false) {
      if(!host || !selectedItem || wordKey(selectedItem.surface)!==wordKey(surface))return;
      if(!state.textAudit.some(item=>item.occurrence_id===selectedItem.occurrence_id))return;
      const box=document.createElement("section");box.className="panel";
      const excerpt=occurrenceExcerpt(state.checkedText||"",selectedItem);
      const render=()=>{
        const answer=judgements[selectedItem.occurrence_id];
        box.innerHTML=`<h3>Do students know this use?</h3><p>${esc(excerpt.before)}<mark>${esc(excerpt.word)}</mark>${esc(excerpt.after)}</p><div class="row"><button type="button" data-judge="known" aria-pressed="${answer===true}">Known</button><button type="button" data-judge="explain" aria-pressed="${answer===false}">May need explaining</button>${answer!==undefined?'<button type="button" data-judge="clear">Clear mark</button>':""}</div><p class="hint" role="status">${answer===true?"Marked Known in this sentence.":answer===false?"Kept in Words to explain.":"This mark applies only here. Check other uses separately."}</p>`;
        box.querySelectorAll("[data-judge]").forEach(button=>button.addEventListener("click",()=>{
          const action=button.dataset.judge;
          if(action==="clear")delete judgements[selectedItem.occurrence_id];else judgements[selectedItem.occurrence_id]=action==="known";
          render();refreshSuggestions();box.querySelector(`[data-judge="${action=== "clear" ? "known" : action}"]`)?.focus({preventScroll:true});
        }));
      };render();host.insertAdjacentElement(before?"beforebegin":"afterend",box);
    }
    function openResult(key, form) {
      const item=state.textAudit.find(row=>wordKey(row.surface)===wordKey(form) && row.owners?.some(owner=>owner.baseword_key===key));
      if(item)openOccurrence(item);else void openFamily(key,form);
    }
    function openOccurrences(surface) {
      const occurrences = wordOccurrences(state.textAudit, surface);
      dialog.innerHTML = `<header class="occurrences-heading"><h2 id="text-word-title">“${esc(surface)}” in your text</h2><button data-reader-close>Close occurrences</button></header><p>${occurrences.length} ${occurrences.length === 1 ? "occurrence" : "occurrences"}</p><div class="occurrences-list">${occurrences.map((item,index) => {const excerpt=occurrenceExcerpt(state.checkedText || "",item);return `<article><p class="hint">Occurrence ${index + 1}</p><p>${esc(excerpt.before)}<mark>${esc(excerpt.word)}</mark>${esc(excerpt.after)}</p><button data-occurrence-open="${index}">View ${esc(item.surface)}</button></article>`;}).join("")}</div>`;
      dialog.querySelector("[data-reader-close]").addEventListener("click", () => dialog.close());
      dialog.querySelectorAll("[data-occurrence-open]").forEach(button => button.addEventListener("click", () => {
        const item = occurrences[Number(button.dataset.occurrenceOpen)]; dialog.close(); openOccurrence(item);
      }));
      if (!dialog.open) dialog.showModal();
    }
    function renderReader() {
      $("#passage-words").innerHTML = segments(state.checkedText || "", state.textAudit).map(part => {
        if (!part.item) return esc(part.text);
        const item = part.item, owner = item.status === "RESOLVED" && item.owners.length === 1 && !item.owners[0].blocked && !item.owners[0].display_blocked ? item.owners[0] : null;
        const rank = owner?.current_hk_frequency_rank;
        const band = !hkOn || rank == null ? "" : rank <= 1000 ? "hk-top" : rank <= 2000 ? "hk-next" : "hk-later";
        const common = commonOn && state.cpbTokens.has(item.normalized_token);
        return `<button type="button" class="passage-word ${band}${common ? " is-common" : ""}" data-reader-word="${esc(item.occurrence_id)}" aria-label="${esc(item.surface)}">${esc(part.text)}</button>`;
      }).join("");
      $("#passage-words").querySelectorAll("[data-reader-word]").forEach(button => button.addEventListener("click", () => {
        const item = state.textAudit.find(row => row.occurrence_id === button.dataset.readerWord); if (item) openOccurrence(item);
      }));
      $("#reader-legend").innerHTML = `${commonOn ? '<span class="is-common">CPB100 sight words · underline</span>' : ""}${hkOn ? '<span class="hk-top">HK family ranks 1–1,000</span><span class="hk-next">HK family ranks 1,001–2,000</span><span class="hk-later">HK family ranks 2,001+</span>' : ""}`;
    }
    function contextMarkup(item) {
      const excerpt=occurrenceExcerpt(state.checkedText||"",item);
      return `${esc(excerpt.before)}<mark>${esc(excerpt.word)}</mark>${esc(excerpt.after)}`;
    }
    function refreshSuggestions() {
      if (state.checkedText === null) return;
      root.HKELE_SELECTED_WORDS?.mount($("#preteach-copy-actions"),()=>state.selected);
      const entries = suggestions(state.textAudit, state.cpbTokens, classLevel, {judgements,filter:reviewFilter});
      const otherMarked=reviewFilter==="marked" ? markedOtherOccurrences(state.textAudit,judgements) : [];
      $("#preteach-level-control").hidden=reviewFilter!=="later";
      const families = groupSuggestions(entries);
      const cards=[...families.map(group=>({...group,other:null})),...otherMarked.map(item=>({key:item.occurrence_id,forms:[],other:item}))];
      if(reviewFilter==="marked")cards.sort((a,b)=>(a.other?.occurrence_order ?? a.forms[0].entry.firstOrder)-(b.other?.occurrence_order ?? b.forms[0].entry.firstOrder));
      $("#preteach-summary").textContent = reviewFilter==="marked" ? `${entries.length+otherMarked.length} ${entries.length+otherMarked.length===1 ? "word" : "words"} marked for explanation` : reviewFilter==="later" && !classLevel ? "Choose a class level to compare first recorded textbook stages." : `${entries.length} word ${entries.length===1 ? "form" : "forms"} · records from this text, most repeated first`;
      $("#preteach-items").innerHTML = cards.slice(0,limit).map(group => {
        if(group.other)return `<article class="preteach-word"><button class="family-link" data-review-other="${otherMarked.indexOf(group.other)}">${esc(group.other.surface)}</button><p>${contextMarkup(group.other)}</p><p class="hint">You marked this use May need explaining</p><button data-review-other="${otherMarked.indexOf(group.other)}">View</button></article>`;
        const rows=group.forms.map(({entry,index}) => {
          const added=state.selected.some(item=>item.baseword_key===entry.key && item.selected_forms.some(form=>form.toLocaleLowerCase()===entry.form.toLocaleLowerCase()));
          const evidence=suggestionEvidence(entry);
          return `<div class="preteach-form"><div><button class="family-link" data-preteach-view="${index}">${esc(entry.form)}</button>${group.forms.length===1 && entry.form.toLocaleLowerCase()!==entry.family.display_family.toLocaleLowerCase() ? `<small>Family: ${esc(entry.family.display_family)}</small>` : ""}<p class="hint">${contextMarkup(entry.occurrence)}</p>${evidence.primary ? `<div class="preteach-reasons"><span>${esc(evidence.primary)}</span></div>` : ""}<small>In this text: ${entry.count} ${entry.count===1 ? "time" : "times"}</small>${evidence.extra.length ? `<details><summary>Word records</summary><p class="hint">${evidence.extra.map(esc).join(" · ")}</p></details>` : ""}</div><button data-preteach-add="${index}" ${added ? "disabled" : ""}>${added ? "Added" : "Add"}</button></div>`;
        }).join("");
        return `<article class="preteach-word">${group.forms.length>1 ? `<p class="preteach-family">Family: ${esc(group.family)} · ${group.forms.length} forms in your text</p>` : ""}${rows}</article>`;
      }).join("") || `<p class="hint">${reviewFilter==="marked" ? "No words marked yet. You can start by tapping a word in the text." : "No words match this filter. You can still choose words from the text."}</p>`;
      $("#preteach-items").querySelectorAll("[data-review-other]").forEach(button=>button.addEventListener("click",()=>openOccurrence(otherMarked[Number(button.dataset.reviewOther)])));
      $("#preteach-items").querySelectorAll("[data-preteach-view]").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries[Number(button.dataset.preteachView)]; openOccurrence(entry.occurrence);
      }));
      $("#preteach-items").querySelectorAll("[data-preteach-add]").forEach(button=>button.addEventListener("click",()=>{
        const entry=entries[Number(button.dataset.preteachAdd)]; addToList(entry.family,entry.form,"Chosen from text");
        $("#preteach-items").querySelector(`[data-preteach-view="${button.dataset.preteachAdd}"]`)?.focus({preventScroll:true});
      }));
      $("#preteach-more").hidden = cards.length <= limit;
      $("#preteach-more").textContent = "Show more words";
    }
    function hideResults() {
      $("#checked-workspace").hidden = true; $("#check-compose").hidden = false;
      $("#return-checked").hidden = state.checkedText === null;
      if (dialog.open) dialog.close();
    }
    function render({reset = false} = {}) {
      if (reset) { judgements={};state.reviewOccurrence=null;reviewFilter="marked";classLevel=null;$("#preteach-filter").value="marked";$("#preteach-level").value="";limit=4; $("#text-tools").open=false; $("#all-text-details").open=false; }
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
      $("#preteach-filter").addEventListener("change",event=>{reviewFilter=event.target.value;limit=4;refreshSuggestions();});
      $("#preteach-level").addEventListener("change",event=>{classLevel=event.target.value || null;limit=4;refreshSuggestions();});
      $("#preteach-more").addEventListener("click",()=>{limit+=20;refreshSuggestions();});
      $("#preteach-open-list").addEventListener("click",()=>showView("list"));
    }
    function resetLessonContext() {
      judgements={};state.reviewOccurrence=null;reviewFilter="marked";$("#preteach-filter").value="marked";classLevel = null; limit = 4; $("#preteach-level").value = "";
      $("#text-tools").open = false;
      refreshSuggestions();
    }
    return {bind, render, hideResults, refreshSuggestions, reveal, resetLessonContext, openOccurrences, mountReviewTools, openResult};
  }
  root.HKELE_TEXT_WORKSPACE = Object.freeze({segments, wordOccurrences, occurrenceExcerpt, suggestions, markedOtherOccurrences, groupSuggestions, suggestionEvidence, create});
})(globalThis);
