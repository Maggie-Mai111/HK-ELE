(() => {
  "use strict";
  const content = globalThis.HKELE_TEACHER_HELP_CONTENT;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const entries = rows => `<dl class="help-definitions">${rows.map(([title, body]) => `<div><dt>${esc(title)}</dt><dd>${esc(body)}</dd></div>`).join("")}</dl>`;
  const dialog = document.createElement("dialog");
  dialog.className = "teacher-help-dialog";
  dialog.setAttribute("aria-labelledby", "teacher-help-title");
  document.body.appendChild(dialog);
  let opener, overflow;
  function render(mode) {
    dialog.querySelectorAll('[data-help-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.helpTopic === mode)));
    const body=dialog.querySelector('.teacher-help-body');
    body.innerHTML = mode === 'columns'
      ? `<p class="help-intro">Choose a group to see what each column means.</p><div class="help-column-groups">${content.columnGroups.map(group=>`<details class="help-group"><summary><strong>${esc(group.title)}</strong><span>${esc(group.hint)}</span></summary>${entries(group.items)}</details>`).join('')}</div>`
      : `<p class="help-intro">Start with a passage or look up a word.</p><div class="help-tasks">${content.tasks.map(task=>`<section class="help-task"><h2>${esc(task.title)}</h2><ol>${task.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><button type="button" data-help-view="${esc(task.view)}">${esc(task.action)} →</button></section>`).join('')}</div><section class="help-keep"><h2>${esc(content.keep.title)}</h2><p>${esc(content.keep.body)}</p><p class="help-save-note">${esc(content.keep.note)}</p></section><details class="teacher-help-example"><summary>Try a short example</summary><p class="teacher-help-sentence">${esc(content.example.sentence)}</p><p>${esc(content.example.body)}</p></details><details class="help-features"><summary>Help with other tools</summary>${entries(content.features)}</details>`;
    body.querySelectorAll('[data-help-view]').forEach(button=>button.addEventListener('click',()=>{
      const target=document.querySelector(`.nav-button[data-view="${button.dataset.helpView}"]`);
      dialog.close();
      target?.click();
      document.querySelector(`#view-${button.dataset.helpView} input, #view-${button.dataset.helpView} textarea`)?.focus();
    }));
    dialog.scrollTop=0;
  }
  function open(mode, trigger) {
    if (document.documentElement.hasAttribute("data-consent-pending") || dialog.open) return;
    opener = trigger; overflow = document.body.style.overflow;
    dialog.innerHTML = `<div class="teacher-help-inner"><header><h1 id="teacher-help-title">Quick guide</h1><button type="button" data-help-close>Close</button></header><nav class="help-topics" aria-label="Help topics"><button type="button" data-help-topic="guide">Getting started</button><button type="button" data-help-topic="columns">Word information</button></nav><div class="teacher-help-body"></div></div>`;
    dialog.querySelector('[data-help-close]').addEventListener('click',()=>dialog.close());
    dialog.querySelectorAll('[data-help-topic]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.helpTopic)));
    render(mode);
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector('[data-help-close]').focus({preventScroll:true});
  }
  dialog.addEventListener("close", () => {
    document.body.style.overflow = overflow ?? "";
    opener?.focus({preventScroll:true});
  });
  dialog.addEventListener("click", event => { if(event.target === dialog) dialog.close(); });
  document.querySelectorAll("[data-teacher-help]").forEach(button => button.addEventListener("click", () => open(button.dataset.teacherHelp, button)));
})();
