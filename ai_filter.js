(() => {
  "use strict";

  const config = window.HKELE_AI_PUBLIC_CONFIG;
  const contract = window.HKELE_AI_FILTER_CONTRACT;
  const panel = document.querySelector("#ai-filter-panel");
  if (!config || !contract || !panel) return;

  const $ = selector => panel.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]));
  const toggle = $("#ai-filter-toggle");
  const body = $("#ai-filter-body");
  const input = $("#ai-filter-query");
  const previewButton = $("#ai-filter-preview-button");
  const editButton = $("#ai-filter-edit-button");
  const confirmButton = $("#ai-filter-confirm-button");
  const preview = $("#ai-filter-preview");
  const summary = $("#ai-filter-summary");
  const conditions = $("#ai-filter-conditions");
  const message = $("#ai-filter-message");
  const turnstileMessage = $("#ai-turnstile-message");
  const turnstileHost = $("#ai-turnstile");
  const active = document.querySelector("#ai-active-summary");
  const activeTitle = document.querySelector("#ai-active-title");
  const activeConditions = document.querySelector("#ai-active-conditions");
  const activeEdit = document.querySelector("#ai-active-edit");
  const activeClear = document.querySelector("#ai-active-clear");
  let interpretation = null;
  let turnstileToken = null;
  let widgetId = null;
  let busy = false;
  let fixturePromise = null;

  function setExpanded(expanded) {
    toggle.setAttribute("aria-expanded", String(expanded));
    body.hidden = !expanded;
    toggle.querySelector(".ai-toggle-label").textContent = expanded ? "Close −" : "Open +";
    if (expanded) {
      void prepareProtection();
      setTimeout(() => input.focus(), 0);
    }
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value;
    previewButton.disabled = value || !input.value.trim() || (!config.fixtureMode && !turnstileToken);
    editButton.disabled = value;
    confirmButton.disabled = value;
    previewButton.textContent = value ? "Working…" : "Preview filters";
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.className = `ai-message${kind ? ` ${kind}` : ""}${text ? "" : " hidden"}`;
  }

  function clearPreview() {
    interpretation = null;
    preview.hidden = true;
    summary.textContent = "";
    conditions.innerHTML = "";
    confirmButton.hidden = true;
    editButton.hidden = true;
  }

  function renderInterpretation(result) {
    interpretation = result;
    summary.textContent = result.summary;
    conditions.innerHTML = result.filters
      ? contract.describeConditions(result.filters).map(item => `<li>${esc(item)}</li>`).join("")
      : "";
    const notes = [result.clarifyingQuestion, ...result.warnings].filter(Boolean);
    if (notes.length) conditions.insertAdjacentHTML("beforeend", notes.map(item => `<li class="ai-warning">${esc(item)}</li>`).join(""));
    confirmButton.hidden = result.status !== "ready";
    editButton.hidden = false;
    preview.hidden = false;
    if (result.status === "unsupported") setMessage("Unsupported request. Nothing was applied; Browse and manual search remain available.", "error");
    else if (result.status === "needs_clarification") setMessage("Please edit the request before applying any filter.", "warning");
    else setMessage("Review the controlled conditions below. Browse results have not changed yet.", "success");
  }

  function uuidV4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  function anonymousSessionId() {
    const key = "hkele-ai-anonymous-session-v1";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = uuidV4();
    sessionStorage.setItem(key, value);
    return value;
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return new Promise((resolve, reject) => {
      const id = "hkele-cloudflare-turnstile";
      const existing = document.getElementById(id);
      const script = existing || document.createElement("script");
      const finish = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
      script.addEventListener("load", finish, {once: true});
      script.addEventListener("error", () => reject(new Error("Turnstile unavailable")), {once: true});
      if (!existing) {
        script.id = id;
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }

  async function prepareProtection() {
    if (config.fixtureMode) {
      turnstileToken = "local-fixture-token";
      turnstileMessage.textContent = "Local fixture protection ready; no external AI call will be made.";
      setBusy(false);
      return;
    }
    if (!config.configured || !config.endpoint || !config.turnstileSiteKey) {
      turnstileMessage.textContent = "AI is not configured for this environment. Existing search and filters remain available.";
      setBusy(false);
      return;
    }
    try {
      const api = await loadTurnstile();
      if (widgetId) return;
      widgetId = api.render(turnstileHost, {
        sitekey: config.turnstileSiteKey,
        action: "ai_filter",
        callback: token => { turnstileToken = token; turnstileMessage.textContent = "Anti-abuse check ready for one AI request."; setBusy(false); },
        "error-callback": () => { turnstileToken = null; turnstileMessage.textContent = "Anti-abuse check failed. Existing search and filters remain available."; setBusy(false); },
        "expired-callback": () => { turnstileToken = null; turnstileMessage.textContent = "Anti-abuse check expired. Complete it again before previewing."; setBusy(false); },
        "timeout-callback": () => { turnstileToken = null; turnstileMessage.textContent = "Anti-abuse check timed out. Existing search and filters remain available."; setBusy(false); },
        theme: "auto",
      });
    } catch {
      turnstileMessage.textContent = "Anti-abuse check is unavailable. Existing search and filters remain available.";
    }
  }

  async function fixtureResult(query) {
    fixturePromise ||= fetch("tests/fixtures/package85_package87_ai_filter_cases.json", {cache: "no-store"}).then(response => {
      if (!response.ok) throw new Error("Fixture unavailable");
      return response.json();
    });
    const document = await fixturePromise;
    const target = query.normalize("NFKC").trim().toLocaleLowerCase();
    const item = document.cases.find(candidate => candidate.query.normalize("NFKC").trim().toLocaleLowerCase() === target);
    if (!item) return document.cases.find(candidate => candidate.id === "unsupported").response;
    return item.response;
  }

  async function workerResult(query) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          query,
          locale: /[\u3400-\u9fff]/u.test(query) ? "zh-HK" : "en-HK",
          surface: "browse",
          turnstileToken,
          anonymousSessionId: anonymousSessionId(),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(response.status === 429 ? "AI search is busy. Try again later." : "AI search is unavailable.");
      return response.json();
    } finally {
      clearTimeout(timer);
      turnstileToken = null;
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    }
  }

  async function previewRequest() {
    const query = input.value.trim();
    if (!query || query.length > 300 || busy) return;
    if (!config.fixtureMode && (!config.configured || !turnstileToken)) {
      setMessage("AI protection is not ready. Nothing changed; existing search and filters remain available.", "error");
      return;
    }
    setBusy(true);
    setMessage("");
    clearPreview();
    try {
      const raw = config.fixtureMode ? await fixtureResult(query) : await workerResult(query);
      renderInterpretation(contract.validateResult(raw));
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "AI search failed."} Nothing was applied; existing search and filters remain available.`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRequest() {
    if (!interpretation?.filters || busy || !window.HKELE_BROWSE_ADAPTER) return;
    setBusy(true);
    try {
      const result = await window.HKELE_BROWSE_ADAPTER.apply(interpretation.filters);
      activeTitle.textContent = `${result.matchedBeforeLimit.toLocaleString("en")} matches · showing first ${result.availableItems.toLocaleString("en")}`;
      activeConditions.textContent = contract.describeConditions(interpretation.filters).join(" · ");
      active.hidden = false;
      setExpanded(false);
      setMessage("");
      document.querySelector("#family-table")?.scrollIntoView({block: "start", behavior: "smooth"});
    } catch {
      setMessage("The controlled filter could not be applied. Nothing changed; existing search and filters remain available.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearApplied({edit = false} = {}) {
    if (window.HKELE_BROWSE_ADAPTER) await window.HKELE_BROWSE_ADAPTER.clear();
    active.hidden = true;
    clearPreview();
    setMessage("");
    if (edit) setExpanded(true);
  }

  toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
  input.addEventListener("input", () => { clearPreview(); setMessage(""); setBusy(false); });
  previewButton.addEventListener("click", () => void previewRequest());
  editButton.addEventListener("click", () => { clearPreview(); setMessage(""); input.focus(); });
  confirmButton.addEventListener("click", () => void confirmRequest());
  activeEdit.addEventListener("click", () => void clearApplied({edit: true}));
  activeClear.addEventListener("click", () => void clearApplied());
  panel.querySelectorAll("[data-ai-example]").forEach(button => button.addEventListener("click", () => {
    input.value = button.dataset.aiExample;
    clearPreview();
    setMessage("");
    setBusy(false);
  }));
  window.addEventListener("hkele:manual-browse-change", () => { active.hidden = true; clearPreview(); });
  setExpanded(false);
  setBusy(false);
})();
