(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HkeleSupplementaryExpressions = factory();
})(typeof window !== "undefined" ? window : this, function () {
  async function lookupSupplementaryExpression(source, normalizedExpression, productDataVersion) {
    if (!source) return { status: "EXPRESSION_LAYER_UNAVAILABLE" };
    if (source.descriptor.schemaVersion !== "1.0.0" || source.descriptor.productDataVersion !== productDataVersion) throw new Error("Expression layer is incompatible with this data release.");
    const expression = await source.lookupExact(normalizedExpression);
    if (!expression) return { status: "NO_REGISTERED_EXPRESSION", expressionDataVersion: source.descriptor.expressionDataVersion };
    if (expression.normalizedExpression !== normalizedExpression || expression.sourceVersion !== source.descriptor.expressionDataVersion || expression.kind !== "COMPOUND") throw new Error("Unregistered or inconsistent expression record.");
    return { status: "MATCHED_EXPRESSION", expression };
  }
  return { lookupSupplementaryExpression };
});
