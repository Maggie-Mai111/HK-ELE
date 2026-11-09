(() => {
  "use strict";
  const content = globalThis.HKELE_TEACHER_HELP_CONTENT;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const entries = rows => `<dl>${rows.map(([title, body]) => `<dt>${esc(title)}</dt><dd>${esc(body)}</dd>`).join("")}</dl>`;
  const dialog = document.createElement("dialog");
  dialog.className = "teacher-help-dialog";
  dialog.setAttribute("aria-labelledby", "teacher-help-title");
  document.body.appendChild(dialog);
  let opener, overflow;
  function open(mode, trigger) {
    if (document.documentElement.hasAttribute("data-consent-pending")) return;
    opener = trigger; overflow = document.body.style.overflow;
    dialog.innerHTML = `<div class="teacher-help-inner"><header><h1 id="teacher-help-title">${mode === "columns" ? "About these columns" : "Quick guide"}</h1><button type="button" data-help-close>Close</button></header><div class="teacher-help-body">${mode === "columns" ? entries(content.columns) : `${content.steps.map(step=>`<section><h2>${esc(step.title)}</h2><p>${esc(step.body)}</p></section>`).join("")}<section class="teacher-help-example"><h2>Try this example</h2><p class="teacher-help-sentence">${esc(content.example.sentence)}</p><p>${esc(content.example.body)}</p></section><details><summary>Other features</summary>${entries(content.features)}</details><details><summary>About these columns</summary>${entries(content.columns)}</details>`}</div></div>`;
    dialog.querySelector("[data-help-close]").addEventListener("click", () => dialog.close());
    document.body.style.overflow = "hidden";
    dialog.showModal(); dialog.scrollTop = 0;
    dialog.querySelector("[data-help-close]").focus({preventScroll:true});
  }
  dialog.addEventListener("close", () => {
    document.body.style.overflow = overflow ?? "";
    opener?.focus({preventScroll:true});
  });
  dialog.addEventListener("click", event => { if(event.target === dialog) dialog.close(); });
  document.querySelectorAll("[data-teacher-help]").forEach(button => button.addEventListener("click", () => open(button.dataset.teacherHelp, button)));
})();
