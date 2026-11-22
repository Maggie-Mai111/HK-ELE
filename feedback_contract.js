(function (root) {
  function values(context) {
    const result = {
      product: context.product === "App/PWA" ? "App" : context.product,
      page: String(context.page || "").slice(0, 80),
      word: String(context.word || "").slice(0, 160),
      family: String(context.family || "").slice(0, 160),
    };
    const reference = [
      context.expressionId && "Compound word",
      result.word && `Word: ${result.word}`,
      result.family && `Family: ${result.family}`,
      `Product: ${result.product}`,
      `Page: ${result.page}`,
    ].filter(Boolean).join(" | ");
    return { ...result, reference };
  }
  function buildFeedbackUrl(kind, context, config) {
    if (!["report", "rating"].includes(kind)) return null;
    if (kind === "rating" && (!context.word || (!context.familyKey && !context.expressionId))) return null;
    try {
      const target = config[kind];
      if (target.requiredContext && (target.requiredContext !== "reference" || !/^entry\.\d+$/.test(target.fields.reference || ""))) return null;
      const url = new URL(target.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      if (url.hostname !== "docs.google.com" || !/^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(url.pathname)) return null;
      url.search = ""; url.hash = ""; url.searchParams.set("usp", "pp_url");
      Object.entries(values(context)).forEach(([key, value]) => {
        const entry = target.fields[key];
        if (value && entry && /^entry\.\d+$/.test(entry)) url.searchParams.set(entry, value);
      });
      return url.toString();
    } catch { return null; }
  }
  const api = { buildFeedbackUrl, feedbackValues: values };
  if (typeof module !== "undefined") module.exports = api;
  else root.HkeleFeedbackContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
