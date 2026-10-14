(() => {
  "use strict";
  const key = "hkele.web.local-preview.privacy.v1";
  const contract = window.HkelePrivacyContract;
  const overlay = document.createElement("div");
  overlay.className = "privacy-overlay";
  overlay.hidden = true;
  const dialog = document.createElement("section");
  dialog.className = "privacy-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "privacy-title");
  dialog.tabIndex = -1;
  dialog.innerHTML = `<p class="privacy-brand">HK-ELE · For teachers</p>
    <h1 id="privacy-title">Welcome to HK-ELE</h1>
    <p>Help us improve vocabulary teaching. With your agreement, we can use:</p>
    <ul class="privacy-scope"><li>Feedback about problems you report</li><li>Your ratings of words for teaching and your class</li><li>Basic records of clicks and features used</li></ul>
    <p>Your classroom texts, photos and teaching notes are not included in these records.</p>
    <p class="privacy-note">In this trial, your choice is saved on this device. Usage records are not sent.</p>
    <details><summary>Read data information</summary>
      <p>Feedback and ratings are shared only when you submit a linked Google Form. Please leave out student names and other identifying information.</p>
      <p>Your checked text, teaching list and notes stay in this browser. Export your list to keep a backup. When you use AI word search, only your search request is sent to the AI service.</p>
      <p>You can review or withdraw this choice using Your data choices. This trial does not enrol you in a research study. Study information will be provided before research usage collection begins, and you will be asked again.</p>
    </details>
    <div class="privacy-first"><label class="privacy-choice"><input id="privacy-agree" type="checkbox"><span>I have read the data information and agree to the uses described above.</span></label>
      <button type="button" class="primary privacy-continue" disabled>Agree and continue</button><p class="privacy-note">Please confirm your choice to enter HK-ELE.</p></div>
    <div class="privacy-saved" hidden><p class="privacy-note">Your agreement is saved on this device.</p><button type="button" class="primary privacy-back">Back to your work</button><button type="button" class="privacy-withdraw">Withdraw agreement</button><p class="privacy-note">Withdrawing returns you to the welcome screen.</p></div>
    <p class="privacy-error" role="alert" hidden></p>`;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  let accepted = false;
  const checkbox = dialog.querySelector("#privacy-agree");
  const continueButton = dialog.querySelector(".privacy-continue");
  const error = dialog.querySelector(".privacy-error");
  const workspace = [...document.querySelectorAll(".site-header, main")];
  function gate(blocked) {
    document.documentElement.toggleAttribute("data-consent-pending", blocked);
    workspace.forEach(element => { element.inert = blocked || !overlay.hidden; });
  }
  function show() {
    checkbox.checked = false;
    continueButton.disabled = true;
    error.hidden = true;
    dialog.querySelector("details").open = false;
    dialog.querySelector("h1").textContent = accepted ? "Your data choices" : "Welcome to HK-ELE";
    dialog.querySelector(".privacy-first").hidden = accepted;
    dialog.querySelector(".privacy-saved").hidden = !accepted;
    overlay.hidden = false;
    document.documentElement.setAttribute("data-privacy-open", "");
    workspace.forEach(element => { element.inert = true; });
    dialog.focus();
  }
  function close() {
    if (!accepted) return;
    overlay.hidden = true;
    document.documentElement.removeAttribute("data-privacy-open");
    workspace.forEach(element => { element.inert = false; });
    document.querySelector("[data-privacy-open]")?.focus();
  }
  function storageError(text) { error.textContent = text; error.hidden = false; }
  checkbox.addEventListener("change", () => { continueButton.disabled = !checkbox.checked; });
  continueButton.addEventListener("click", () => {
    const choice = contract.consentChoice(checkbox.checked, new Date().toISOString());
    if (!choice) return;
    try { localStorage.setItem(key, JSON.stringify(choice)); }
    catch { storageError("Your choice could not be saved. Please allow browser storage and try again."); return; }
    accepted = true;
    gate(false);
    close();
    document.querySelector('.nav-button[data-view="home"]')?.click();
  });
  dialog.querySelector(".privacy-back").addEventListener("click", close);
  dialog.querySelector(".privacy-withdraw").addEventListener("click", () => {
    try { localStorage.removeItem(key); }
    catch { storageError("Your choice could not be changed. Please try again."); return; }
    accepted = false;
    gate(true);
    show();
  });
  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (accepted) close(); }
    if (event.key === "Tab") {
      const targets = [...dialog.querySelectorAll('button:not([disabled]), input, summary, [href]')].filter(element => element.offsetParent !== null);
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, true);
  document.querySelector("[data-privacy-open]")?.addEventListener("click", show);
  try { accepted = contract.validConsentChoice(JSON.parse(localStorage.getItem(key) || "null")); }
  catch { accepted = false; }
  gate(!accepted);
  if (!accepted) show();
})();
