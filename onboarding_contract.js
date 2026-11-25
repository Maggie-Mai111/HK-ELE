(function(root) {
  "use strict";
  const KEY = "hkele.web.first-visit-guide.v1";
  const PRIVACY_KEY = "hkele.web.local-preview.privacy.v1";
  function storageState(storage) {
    let seen = false, returning = false;
    try { seen = storage?.getItem(KEY) === "seen"; returning = !!storage?.getItem(PRIVACY_KEY); }
    catch { /* The guide remains usable without persistent storage. */ }
    return {
      seen: () => seen,
      returning,
      remember() { seen = true; try { storage?.setItem(KEY, "seen"); } catch { /* Remember for this page. */ } },
    };
  }
  function offer(context, choice, blocked) {
    return !!context?.ready && context.view === "home" && !blocked && !context.hasSavedWords &&
      !context.hasDraft && !context.hasCheckedText && !choice.returning && !choice.seen();
  }
  function start(context) {
    return {useExample: !context.hasDraft && !context.hasCheckedText, step: context.hasCheckedText ? "explore" : "check"};
  }
  function advance(step, context) {
    if (!context || !["check", "word", "list"].includes(context.view)) return null;
    if (context.view === "list") return context.hasSelectedWords ? "saved" : null;
    if (context.view === "word") return context.wordFromText ? "choose" : null;
    return context.hasCheckedText ? "explore" : "check";
  }
  root.HKELE_ONBOARDING_CONTRACT = Object.freeze({KEY, storageState, offer, start, advance});
})(globalThis);
