(function (root) {
  "use strict";
  function create({state, store, $, esc, saveList, renderList, refreshContext, exportCsv}) {
    let dirty = false, reason = store.problem;
    const dialog = $("#new-lesson-dialog");
    function render() {
      $(".lesson-context").classList.toggle("has-save-error", Boolean(reason));
      const selector = $("#active-lesson");
      selector.innerHTML = state.library.lessons.map((lesson, index) =>
        `<option value="${esc(lesson.id)}">${esc(lesson.title || "Your lesson")} · ${root.HKELE_LESSON.wordCount(lesson.items)} words</option>`).join("");
      selector.value = state.library.activeId;
      const messages = {
        conflict:"Another tab changed your saved lessons. Export this copy before reloading the saved lessons.",
        invalid:"Your saved lessons could not be opened. They have not been replaced. Export any new work before reloading.",
        unavailable:"Changes are only on this page. They have not been saved. Try again or export a copy before leaving."
      };
      $("#lesson-save-message").textContent = reason ? messages[reason] : "Saved in this browser";
      $("#lesson-save-state").classList.toggle("save-failed", Boolean(reason));
      $("#lesson-save-state").setAttribute("role", reason ? "alert" : "status");
      $("#retry-lesson-save").hidden = !reason || reason !== "unavailable" || Boolean(store.problem);
      $("#export-unsaved-lesson").hidden = !reason;
      $("#reload-saved-lessons").hidden = !reason;
      selector.disabled = Boolean(reason);
      $("#new-lesson").disabled = Boolean(reason);
      document.querySelectorAll("[data-current-lesson]").forEach(node => {
        node.textContent = `Adding to: ${state.lessonTitle || "Your lesson"}`;
      });
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
      $("#new-lesson").addEventListener("click", () => {
        if (!saveList()) return;
        $("#new-lesson-name").value = "";
        dialog.showModal(); $("#new-lesson-name").focus();
      });
      $("#cancel-new-lesson").addEventListener("click", () => dialog.close());
      $("#new-lesson-form").addEventListener("submit", event => {
        event.preventDefault();
        const title = $("#new-lesson-name").value.trim();
        if (!title) { $("#new-lesson-name").focus(); return; }
        if (!saveList()) { dialog.close(); return; }
        if (commit(root.HKELE_LESSON_LIBRARY.add(state.library, title))) {
          dialog.close(); $("#active-lesson").focus();
        } else dialog.close();
      });
      $("#retry-lesson-save").addEventListener("click", saveList);
      $("#export-unsaved-lesson").addEventListener("click", exportCsv);
      $("#reload-saved-lessons").addEventListener("click", () => {
        if (root.confirm("Reload saved lessons? Changes that have not been saved and the current passage will be cleared. Export or copy them first.")) root.location.reload();
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
