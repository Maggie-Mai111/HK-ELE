(function (root) {
  "use strict";
  function create({state, $, $$, esc, saveList, updateListCount, showView, openFamily, createLessonItem, contractionDescription, titleKey, toast}) {
    const lesson = root.HKELE_LESSON;
    function rememberUndo() {
      state.undoList = JSON.parse(JSON.stringify(state.selected));
      $("#lesson-undo").classList.remove("hidden");
    }
    function forgetUndo() {state.undoList=null;$("#lesson-undo").classList.add("hidden");}
    function hidePicker() { state.lessonSelection.clear(); state.lessonLimit=6; state.lessonQuery=""; $("#lesson-picker").classList.add("hidden"); }
    function renderPicker(message = "") {
      const host = $("#lesson-picker");
      const choices = lesson.choicesFromResults(state.textItems.filter(item => !contractionDescription(item)));
      host.classList.toggle("hidden", !choices.length);
      if (!choices.length) { host.innerHTML = ""; return; }
      const matches = choices.filter(choice => `${choice.selectedForms.join(" ")} ${choice.family.display_family}`.toLocaleLowerCase().includes((state.lessonQuery||"").trim().toLocaleLowerCase()));
      const selected = choices.filter(choice => state.lessonSelection.has(choice.family.baseword_key));
      host.innerHTML = `<h3>Choose words for this lesson</h3><p class="hint">Tick the words your class needs. Nothing is selected automatically.</p><input class="lesson-search" aria-label="Find a word in this text" placeholder="Find a word in this text" value="${esc(state.lessonQuery || "")}"><div class="lesson-choices">${matches.slice(0,state.lessonLimit).map(choice => {
        const key = choice.family.baseword_key, existing = state.selected.find(item => item.baseword_key === key);
        const complete = choice.selectedForms.every(form => existing?.selected_forms.includes(form));
        return `<label class="lesson-choice"><input type="checkbox" data-lesson-pick="${esc(key)}" ${state.lessonSelection.has(key) ? "checked" : ""}><span><strong>${choice.selectedForms.map(esc).join(", ")}</strong><small>Family: ${esc(choice.family.display_family)}${complete ? " · In your list" : ""}</small></span></label>`;
      }).join("")}</div>${matches.length ? "" : '<p class="hint">No matched words found. Try another word from your passage.</p>'}<div class="lesson-actions">${state.lessonLimit < matches.length ? `<button data-lesson-more>Show more words (${matches.length-state.lessonLimit} remaining)</button>` : ""}<button class="primary" data-lesson-add ${selected.length ? "" : "disabled"}>Add selected words (${selected.reduce((sum,choice) => sum+choice.selectedForms.length,0)})</button>${selected.length ? '<button data-lesson-clear>Clear selection</button>' : ""}<button data-lesson-open>View teaching list (${state.selected.length})</button></div><p class="lesson-success" role="status">${esc(message)}</p>`;
      host.querySelector(".lesson-search").addEventListener("input",event=>{const position=event.target.selectionStart;state.lessonQuery=event.target.value;state.lessonLimit=6;renderPicker();const input=host.querySelector(".lesson-search");input.focus();input.setSelectionRange(position,position);});
      host.querySelectorAll("[data-lesson-pick]").forEach(input => input.addEventListener("change", () => {
        if(input.checked) state.lessonSelection.add(input.dataset.lessonPick); else state.lessonSelection.delete(input.dataset.lessonPick);
        renderPicker(); host.querySelector(`[data-lesson-pick="${CSS.escape(input.dataset.lessonPick)}"]`)?.focus();
      }));
      host.querySelector("[data-lesson-more]")?.addEventListener("click", () => { state.lessonLimit += 6; renderPicker(); });
      host.querySelector("[data-lesson-clear]")?.addEventListener("click", () => {state.lessonSelection.clear(); renderPicker();});
      host.querySelector("[data-lesson-open]").addEventListener("click", () => showView("list"));
      host.querySelector("[data-lesson-add]").addEventListener("click", () => {
        rememberUndo();
        const merged = lesson.mergeSelections(state.selected, selected, createLessonItem);
        state.selected = merged.items; state.lessonSelection.clear(); saveList();
        renderPicker(merged.formsAdded ? `${merged.formsAdded} words added to your lesson.` : "These words are already in your lesson.");
      });
    }
    function updateCounts() {
      const focus = state.selected.filter(item => item.teaching_focus === "focus").length;
      const mention = state.selected.filter(item => item.teaching_focus === "mention").length;
      $("#lesson-word-count").textContent = `${state.selected.reduce((sum,item)=>sum+item.selected_forms.length,0)} selected words · ${state.selected.length} families`;
      $("#lesson-plan-count").textContent = `${focus} teach in depth · ${mention} briefly introduce · ${state.selected.length-focus-mention} not decided`;
    }
    function renderList() {
      updateListCount(); const empty = state.selected.length === 0;
      $("#list-empty").classList.toggle("hidden", !empty); $("#list-workspace").classList.toggle("hidden", empty);
      if(document.activeElement !== $("#lesson-name")) $("#lesson-name").value = state.lessonTitle;
      $("#lesson-undo").classList.toggle("hidden", !state.undoList);
      updateCounts();
      if (empty) { $("#list-body").innerHTML=""; return; }
      const ordered = [...state.selected].sort((a,b)=>a.order-b.order);
      $("#list-body").innerHTML = ordered.map((item,index) => `<article class="lesson-card" data-list-key="${esc(item.baseword_key)}">
        <details ${state.lessonOpen.has(item.baseword_key) ? "open" : ""}><summary><span class="lesson-card-heading"><span class="lesson-order">${index+1}</span><strong>${item.selected_forms.map(esc).join(", ") || esc(item.display_family)}</strong></span><span class="lesson-edit-label">${state.lessonOpen.has(item.baseword_key) ? "Done" : "Edit"}</span></summary>
        <div class="lesson-card-editor"><label>Your teaching plan<select class="list-focus">${lesson.focusOptions.map(([value,label])=>`<option value="${value}" ${value===(item.teaching_focus||"") ? "selected" : ""}>${label}</option>`).join("")}</select></label><p class="hint">An intention for this lesson, not a test of student knowledge.</p>
        <label>Teaching note (optional)<textarea class="notes" rows="2" placeholder="For example: compare reusable with disposable">${esc(item.notes)}</textarea></label>
        <details class="lesson-related" ${item.connections ? "open" : ""}><summary>Related words or example (optional)</summary><textarea class="connections" rows="2" aria-label="Related words or example for ${esc(item.display_family)}">${esc(item.connections)}</textarea></details>
        <div class="selected-forms-list">${item.selected_forms.map(form=>`<span class="selected-form-chip">${esc(form)} <button data-remove-form="${esc(form)}" aria-label="Remove selected form ${esc(form)}">×</button></span>`).join("")}</div>
        ${item.source_labels?.length ? `<p class="hint">Added from: ${item.source_labels.map(esc).join(" · ")}</p>` : ""}${item.depth && item.depth !== "Notice" ? `<p class="hint">Earlier teaching depth: ${esc(item.depth)}</p>` : ""}
        <div class="lesson-actions"><button data-lesson-word>View word information</button><button data-move="-1" ${index===0 ? "disabled" : ""}>Move up</button><button data-move="1" ${index===ordered.length-1 ? "disabled" : ""}>Move down</button><button data-remove-family>Remove from lesson</button></div></div></details>
        <div class="lesson-card-preview"><span class="lesson-plan-pill ${item.teaching_focus==="focus" ? "focus" : ""}">${lesson.focusLabel(item.teaching_focus)}</span><span class="hint">Family: ${esc(item.display_family)}</span><p class="lesson-note-preview">${esc(item.notes)}</p><p class="lesson-related-preview hint">${item.connections ? `Related: ${esc(item.connections)}` : ""}</p></div></article>`).join("");
      $$('#list-body [data-list-key]').forEach(row => {
        const item = state.selected.find(value => value.baseword_key === row.dataset.listKey);
        const details = row.querySelector("details");
        details.addEventListener("toggle", () => {if(details.open)state.lessonOpen.add(item.baseword_key);else state.lessonOpen.delete(item.baseword_key);row.querySelector(".lesson-edit-label").textContent=details.open ? "Done" : "Edit";});
        row.querySelector(".list-focus").addEventListener("change", event => {forgetUndo();item.teaching_focus=event.target.value;saveList();updateCounts();const pill=row.querySelector(".lesson-plan-pill");pill.textContent=lesson.focusLabel(item.teaching_focus);pill.classList.toggle("focus",item.teaching_focus==="focus");});
        row.querySelector(".notes").addEventListener("input", event => { forgetUndo();item.notes=event.target.value;saveList();row.querySelector(".lesson-note-preview").textContent=item.notes; });
        row.querySelector(".connections").addEventListener("input", event => {forgetUndo();item.connections=event.target.value;saveList();row.querySelector(".lesson-related-preview").textContent=item.connections ? `Related: ${item.connections}` : "";});
        row.querySelector("[data-lesson-word]").addEventListener("click",()=>openFamily(item.baseword_key,item.selected_forms[0]));
        row.querySelectorAll("[data-move]").forEach(button=>button.addEventListener("click",()=>{
          const index=ordered.indexOf(item),target=index+Number(button.dataset.move);if(target<0||target>=ordered.length)return;
          rememberUndo();[ordered[index],ordered[target]]=[ordered[target],ordered[index]];state.selected=ordered.map((entry,index)=>({...entry,order:index+1}));saveList();renderList();
        }));
        row.querySelector("[data-remove-family]").addEventListener("click", () => {rememberUndo(); state.selected=state.selected.filter(value=>value!==item); saveList();renderList();});
        row.querySelectorAll("[data-remove-form]").forEach(button=>button.addEventListener("click",()=>{
          rememberUndo();item.selected_forms=item.selected_forms.filter(form=>form!==button.dataset.removeForm);
          if(!item.selected_forms.length)state.selected=state.selected.filter(value=>value!==item);saveList();renderList();
        }));
      });
    }
    function bind() {
      $("#lesson-name").addEventListener("input",event=>{state.lessonTitle=event.target.value;try{localStorage.setItem(titleKey,state.lessonTitle);}catch{toast("We couldn't save the lesson name. Export a copy before leaving.");}});
      $$("[data-lesson-view]").forEach(button=>button.addEventListener("click",()=>showView(button.dataset.lessonView)));
      $("#undo-lesson").addEventListener("click",()=>{if(!state.undoList)return;state.selected=state.undoList;state.undoList=null;saveList();renderList();});
    }
    return {renderList, renderPicker, bind, rememberUndo, hidePicker};
  }
  root.HKELE_LESSON_WORKSPACE = {create};
})(globalThis);
