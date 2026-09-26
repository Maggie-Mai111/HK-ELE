(() => {
  "use strict";

  const supplied = window.__HKELE_AI_PUBLIC_CONFIG__ || {};
  const loopback = ["127.0.0.1", "localhost"].includes(location.hostname);
  const fixtureMode = loopback && new URLSearchParams(location.search).get("ai_fixture") === "1";
  const endpoint = typeof supplied.endpoint === "string" ? supplied.endpoint.trim() : "";
  const turnstileSiteKey = typeof supplied.turnstileSiteKey === "string" ? supplied.turnstileSiteKey.trim() : "";

  function validEndpoint(value) {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.pathname === "/api/ai/interpret-filter";
    } catch {
      return false;
    }
  }

  window.HKELE_AI_PUBLIC_CONFIG = Object.freeze({
    endpoint: validEndpoint(endpoint) ? endpoint : null,
    turnstileSiteKey: turnstileSiteKey || null,
    turnstileAction: "ai_filter",
    allowedOrigin: "https://maggie-mai111.github.io",
    requestTimeoutMs: 12000,
    fixtureMode,
    configured: fixtureMode || (validEndpoint(endpoint) && Boolean(turnstileSiteKey)),
  });
})();
