(() => {
  let wordContext = null;
  let config = null;
  const dialog = document.createElement("dialog");
  dialog.className = "feedback-dialog";
  dialog.setAttribute("aria-labelledby", "feedback-dialog-title");
  dialog.innerHTML = '<button type="button" class="feedback-close" aria-label="Close feedback">Close</button><h2 id="feedback-dialog-title"></h2><p class="feedback-description"></p><p class="feedback-context"></p><a class="feedback-open" target="_blank" rel="noopener noreferrer">Open Google Form ↗</a><p class="feedback-status" role="status"></p>';
  document.body.appendChild(dialog);
  dialog.querySelector(".feedback-close").addEventListener("click", () => dialog.close());
  window.addEventListener("hkele-word-feedback-context", (event) => { wordContext = event.detail; });
  const currentContext = (useWord) => {
    const onWordPage = document.querySelector("#view-word")?.classList.contains("active");
    return { product: "Web", page: useWord || onWordPage ? "Word detail" : ({ "#home": "Home", "#browse": "Browse", "#check": "Check a Text", "#list": "Teaching List" })[location.hash] || "Home", ...((useWord || onWordPage) && wordContext ? wordContext : {}) };
  };
  const showFeedback = async (kind, useWord) => {
    dialog.querySelector("h2").textContent = kind === "rating" ? "Rate this word" : "Report a problem";
    dialog.querySelector(".feedback-description").textContent = kind === "rating" ? "Rate how easy this word is to teach and how suitable it is for your students. Select the target grade in the form." : "Describe what happened and what you expected. Leave out student names, classroom photos and full source texts.";
    const context = currentContext(useWord);
    dialog.querySelector(".feedback-context").textContent = [context.word, context.family && `Family: ${context.family}`, context.page].filter(Boolean).join(" · ");
    const link = dialog.querySelector(".feedback-open");
    link.removeAttribute("href"); link.hidden = true;
    const status = dialog.querySelector(".feedback-status");
    status.textContent = "Opening form…";
    dialog.showModal();
    try {
      if (!config) { const response = await fetch("./feedback_forms.json"); if (!response.ok) throw new Error(); config = await response.json(); }
      const url = window.HkeleFeedbackContract.buildFeedbackUrl(kind, context, config);
      if (url) { link.href = url; link.hidden = false; status.textContent = ""; }
      else status.textContent = "Please try this form again later.";
    } catch { status.textContent = "Couldn’t open the form. Close this window and try again."; }
  };
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-feedback-kind]");
    if (button) void showFeedback(button.dataset.feedbackKind, button.dataset.feedbackWord === "true");
  });
  const actions = document.createElement("div");
  actions.className = "feedback-global";
  actions.innerHTML = '<button type="button" data-feedback-kind="report">Report a problem</button><button type="button" data-privacy-open>Privacy</button>';
  document.querySelector("header")?.appendChild(actions);
  actions.querySelector("[data-privacy-open]").textContent = "Your data choices";
})();
