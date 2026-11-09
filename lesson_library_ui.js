(function (root) {
  "use strict";
  function create({state, store, $, esc, saveList, renderList, refreshContext, exportCsv}) {
    let dirty = false, reason = store.problem;
    function render() {
      $(".lesson-context").classList.toggle("has-save-error", Boolean(reason));
      const selector = $("#active-lesson");
      selector.innerHTML = state.library.lessons.map((lesson, index) => ({lesson,index})).filter(({lesson}) => lesson.id === state.library.activeId || lesson.items.length > 0).map(({lesson, index}) =>
        `<option value="${esc(lesson.id)}">Saved words ${index + 1} · ${root.HKELE_LESSON.wordCount(lesson.items)} ${root.HKELE_LESSON.wordCount(lesson.items) === 1 ? "word" : "words"}</option>`).join("");
      selector.value = state.library.activeId;
      $(".lesson-context-controls").hidden = state.view !== "list" || !state.library.lessons.some(item => item.id !== state.library.activeId && item.items.length > 0);
      const messages = {
        conflict:"Another tab changed your saved words. Export this copy before reloading the saved words.",
        invalid:"Your saved words could not be opened. They have not been replaced. Export any new work before reloading.",
        unavailable:"Changes are only on this page. They have not been saved. Try again or export a copy before leaving."
      };
      $("#lesson-save-message").textContent = reason ? messages[reason] : "Saved in this browser";
      $("#lesson-save-state").classList.toggle("save-failed", Boolean(reason));
      $("#lesson-save-state").setAttribute("role", reason ? "alert" : "status");
      $("#retry-lesson-save").hidden = !reason || reason !== "unavailable" || Boolean(store.problem);
      $("#export-unsaved-lesson").hidden = !reason;
      $("#reload-saved-lessons").hidden = !reason;
      selector.disabled = Boolean(reason);

    }
    function persist() {
      dirty = true; state.lessonEditVersion += 1;
      state.library = root.HKELE_LESSON_LIBRARY.withCurrent(state.library, state.lessonTitle, state.selected);
      const result = store.save(state.library);
      reason = result.ok ? null : result.reason;
      if (result.ok) dirty = false;
      render();
      return result.ok;
    }
    function adopt(next) {
      state.library = next;
      const active = next.lessons.find(item => item.id === next.activeId);
      state.selected = JSON.parse(JSON.stringify(active.items)); state.lessonTitle = active.title;
      state.lessonEditVersion += 1;
      state.undoList = null; state.lessonOpen.clear(); state.lessonSelection.clear();
      renderList(); refreshContext(); render();
    }
    function commit(next) {
      const result = store.save(next);
      if (!result.ok) { reason = result.reason; render(); return false; }
      reason = null; dirty = false; adopt(next); return true;
    }
    function bind() {
      $("#active-lesson").addEventListener("change", event => {
        const activeId = event.target.value;
        if (!saveList()) { render(); return; }
        commit({...state.library, activeId});
      });
      $("#retry-lesson-save").addEventListener("click", saveList);
      $("#export-unsaved-lesson").addEventListener("click", exportCsv);
      $("#reload-saved-lessons").addEventListener("click", () => {
        if (root.confirm("Reload saved words? Changes that have not been saved and the current passage will be cleared. Export or copy them first.")) root.location.reload();
      });
      root.addEventListener("beforeunload", event => {
        if (!dirty) return; event.preventDefault(); event.returnValue = "";
      });
      root.addEventListener("storage", event => {
        if (event.key !== root.HKELE_LESSON_LIBRARY.KEY && event.key !== null) return;
        reason = "conflict"; render();
      });
      render();
    }
    return {persist, render, bind};
  }
  root.HKELE_LESSON_LIBRARY_UI = {create};
})(globalThis);
