(function (root) {
  "use strict";
  const noticeVersion = "teacher-preview-consent-20261012-v2";
  function consentChoice(agreed, now) {
    if (!agreed || !Number.isFinite(Date.parse(now))) return null;
    return { noticeVersion, consentedAt: now, feedbackConsent: true, ratingConsent: true,
      usageConsent: true, collectionEnabled: false, scope: "local-preview-choice" };
  }
  function validConsentChoice(record) {
    return !!record && typeof record === "object" && record.noticeVersion === noticeVersion &&
      typeof record.consentedAt === "string" && Number.isFinite(Date.parse(record.consentedAt)) &&
      record.feedbackConsent === true && record.ratingConsent === true && record.usageConsent === true &&
      record.collectionEnabled === false && record.scope === "local-preview-choice";
  }
  const api = Object.freeze({ noticeVersion, consentChoice, validConsentChoice, mayCollectUsage: () => false });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HkelePrivacyContract = api;
})(typeof window !== "undefined" ? window : globalThis);
