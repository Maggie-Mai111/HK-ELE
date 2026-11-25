(function () {
  "use strict";
  const shortcut = document.querySelector("#browse-ai-shortcut");
  const toggle = document.querySelector("#ai-filter-toggle");
  const panel = document.querySelector("#ai-filter-panel");
  const body = document.querySelector("#ai-filter-body");
  if (!shortcut || !toggle || !panel || !body) return;
  // The existing AI controller owns requests, validation and expanded state.
  const sync = () => {
    const open = !body.hidden;
    panel.classList.toggle("ai-is-open", open);
    shortcut.setAttribute("aria-expanded", String(open));
  };
  shortcut.addEventListener("click", () => toggle.click());
  new MutationObserver(sync).observe(body, {attributes:true, attributeFilter:["hidden"]});
  document.querySelector("#browse-search-form").addEventListener("submit", () => {
    if (!body.hidden) toggle.click();
    sync();
  });
  sync();
})();
