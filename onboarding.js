(() => {
  "use strict";
  const contract = globalThis.HKELE_ONBOARDING_CONTRACT;
  const $ = selector => document.querySelector(selector);
  let storage; try { storage = globalThis.localStorage; } catch { storage = null; }
  const choice = contract.storageState(storage);
  const invitation = $("#first-visit-invitation");
  const coach = document.createElement("aside");
  coach.className = "onboarding-coach"; coach.hidden = true;
  coach.setAttribute("aria-labelledby", "onboarding-step-title");
  coach.innerHTML = '<div class="onboarding-coach-heading"><h2 id="onboarding-step-title"></h2><button type="button" data-guide-end>Skip guide</button></div><p id="onboarding-step-copy" role="status" aria-live="polite"></p><div class="onboarding-actions"><button type="button" data-guide-list hidden>Open Selected words</button></div>';
  let running = false, step = "check", target = null, scheduled = false, insertedExample = false;
  const context = () => globalThis.HKELE_WEB_GUIDE_CONTEXT?.read();
  const blocked = () => document.documentElement.hasAttribute("data-consent-pending") || document.documentElement.hasAttribute("data-privacy-open");
  const setText = (node, text) => { if(node.textContent !== text) node.textContent = text; };
  const setHidden = (node, value) => { if(node.hidden !== value) node.hidden = value; };
  function setTarget(node) {
    if (target === node) return;
    target?.classList.remove("onboarding-target"); target = node;
    target?.classList.add("onboarding-target");
  }
  function hideCoach() {
    setHidden(coach, true); delete document.documentElement.dataset.onboardingStep;
    document.documentElement.removeAttribute('data-onboarding-example');
    setTarget(null);
  }
  function end(focus = false) {
    const returnTarget = target;
    running = false; hideCoach(); choice.remember();
    if(focus && returnTarget?.isConnected) returnTarget.focus({preventScroll:true});
  }
  function refresh() {
    scheduled = false;
    const current = context(), privacyBlocked = blocked();
    setHidden(invitation, running || !contract.offer(current, choice, privacyBlocked));
    document.querySelectorAll('[data-start-onboarding]').forEach(button => {
      const disabled = !current?.ready;
      if(button.disabled !== disabled) button.disabled = disabled;
      setText(button, disabled ? 'Loading words…' : 'Try an example');
    });
    if(!running || !current?.ready || privacyBlocked) { hideCoach(); return; }
    document.documentElement.toggleAttribute('data-onboarding-example', insertedExample && $("#text-input").value === globalThis.HKELE_TEACHER_HELP_CONTENT.example.sentence);
    step = contract.advance(step, current);
    if(!step) { end(); return; }
    const modal = document.querySelector("dialog[open]");
    if(modal && !modal.classList.contains("text-word-dialog")) { hideCoach(); return; }
    let host, anchor = null, title, copy, nextTarget = null;
    if(modal) {
      host = modal.querySelector(".word-dialog-body") || modal; anchor = host.firstChild;
      title = "2 of 3 · Explore a word";
      copy = modal.querySelector("[data-reader-owner]") ? "Choose the family that fits here, or close this box to try another word." : "Close this box to try another word, or finish the guide.";
      nextTarget = modal.querySelector("[data-reader-owner], [data-reader-close]");
    } else if(step === "check") {
      host = $("#check-compose"); anchor = host.firstChild;
      title = "1 of 3 · Check a text";
      copy = current.hasDraft ? (insertedExample && $("#text-input").value === globalThis.HKELE_TEACHER_HELP_CONTENT.example.sentence ? "Choose Check text to try this example." : "Choose Check text to explore the words in this text.") : "Paste your text, then choose Check text.";
      nextTarget = current.hasDraft ? $("#check-button") : $("#text-input");
    } else if(step === "explore") {
      host = $("#checked-reader"); anchor = host.querySelector(".reader-heading")?.nextSibling;
      const buttons = [...host.querySelectorAll("[data-reader-word]")].filter(node => current.eligibleIds.includes(node.dataset.readerWord));
      nextTarget = buttons.find(node => node.getAttribute("aria-label")?.toLowerCase() === "stressed") || buttons[0];
      title = "2 of 3 · Explore a word";
      copy = nextTarget ? (nextTarget.getAttribute("aria-label")?.toLowerCase() === "stressed" ? "Click stressed to see its information and related forms." : "Click a word to see its information and related forms.") : "No automatic matches here. You can edit the text or finish the guide.";
    } else if(step === "choose") {
      host = $("#word-workspace .selected-word-card");
      if(!host) { hideCoach(); return; }
      anchor = host.querySelector(".word-card-head")?.nextSibling;
      title = "3 of 3 · Choose words to teach";
      copy = "If your class needs help, mark May need explaining. Add to selected words keeps the word for later.";
      nextTarget = host.querySelector("[data-add-selected]");
    } else {
      host = $("#view-list"); anchor = host.querySelector(".page-heading")?.nextSibling;
      title = "3 of 3 · Use your saved words";
      copy = "Add a note if useful, then copy your words into your materials.";
      nextTarget = host.querySelector("#list-copy-actions button");
    }
    if(!host) { hideCoach(); return; }
    // Keep one in-flow hint. Re-rendering a word card must not orphan its guide.
    if(coach.parentElement !== host) host.insertBefore(coach, anchor);
    setText($("#onboarding-step-title"), title);
    setText($("#onboarding-step-copy"), copy);
    setText(coach.querySelector("[data-guide-end]"), step === "choose" || step === "saved" || modal || (step === "explore" && !nextTarget) ? "Finish guide" : "Skip guide");
    setHidden(coach.querySelector("[data-guide-list]"), step !== "choose" || !current.hasSelectedWords);
    setHidden(coach, false); document.documentElement.dataset.onboardingStep = step;
    setTarget(nextTarget);
  }
  function schedule() {
    if(scheduled) return; scheduled = true; queueMicrotask(refresh);
  }
  function start() {
    if(blocked()) return;
    const current = context(); if(!current?.ready) return;
    choice.remember();
    document.querySelector(".teacher-help-dialog[open]")?.close();
    const plan = contract.start(current);
    running = true; step = plan.step; insertedExample = plan.useExample;
    // Only an empty workspace receives the example. Existing input is never replaced.
    if(plan.useExample) {
      $("#text-input").value = globalThis.HKELE_TEACHER_HELP_CONTENT.example.sentence;
      $("#text-input").dispatchEvent(new Event("input", {bubbles:true}));
    }
    document.querySelector('.nav-button[data-view="check"]').click();
    refresh();
    requestAnimationFrame(() => {
      if(!running || blocked()) return;
      coach.style.scrollMarginTop = `${Math.ceil($(".site-header").getBoundingClientRect().height) + 12}px`;
      coach.scrollIntoView({block:"start",behavior:"instant"});
      (step === "check" ? $("#text-input") : target)?.focus({preventScroll:true});
    });
  }
  document.addEventListener("click", event => {
    if(event.target.closest("[data-start-onboarding]")) start();
    if(event.target.closest("[data-guide-dismiss]")) {choice.remember();refresh();}
    if(event.target.closest("[data-guide-end]")) end(true);
    if(event.target.closest("[data-guide-list]")) document.querySelector('.nav-button[data-view="list"]').click();
  });
  document.addEventListener("keydown", event => {if(event.key === "Escape" && running && !blocked()) end();});
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","open","data-consent-pending","data-privacy-open"]});
  refresh();
})();
