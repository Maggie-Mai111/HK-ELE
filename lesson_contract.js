(function (root) {
  "use strict";
  const focusOptions = [["", "Not decided"], ["focus", "Teach in depth"], ["mention", "Briefly introduce"]];
  function wordCount(items) { return items.reduce((sum,item)=>sum+(item.selected_forms || []).length,0); }
  function focusLabel(value) { return focusOptions.find(([key]) => key === value)?.[1] || "Not decided"; }
  function choicesFromResults(items) {
    const choices = new Map();
    for (const item of items) {
      if (item.status !== "RESOLVED" || item.owners?.length !== 1) continue;
      const family = item.owners[0];
      if (!family || family.blocked || family.display_blocked) continue;
      const forms = item.surface_forms?.length ? item.surface_forms : [item.display_word || item.surface];
      let choice = choices.get(family.baseword_key);
      if (!choice) { choice = {family, selectedForms:[], sourceLabel:"Check a text"}; choices.set(family.baseword_key, choice); }
      for (const value of forms) {
        const form = String(value || "").trim();
        if (form && !choice.selectedForms.includes(form)) choice.selectedForms.push(form);
      }
    }
    return [...choices.values()].filter((choice) => choice.selectedForms.length);
  }
  function mergeSelections(items, selections, create) {
    const next = items.map((item) => ({...item, selected_forms:[...(item.selected_forms || [])]}));
    let added = 0, formsAdded = 0;
    for (const selection of selections) {
      if (selection.family.blocked || selection.family.display_blocked) continue;
      const forms = [...new Set(selection.selectedForms.map((form) => form.trim()).filter(Boolean))];
      if (!forms.length) continue;
      let item = next.find((row) => row.baseword_key === selection.family.baseword_key);
      if (!item) { item = create(selection.family, next.length); next.push(item); added += 1; }
      for (const form of forms) if (!item.selected_forms.includes(form)) { item.selected_forms.push(form); formsAdded += 1; }
      if (selection.sourceLabel) item.source_labels = [...new Set([...(item.source_labels || []), selection.sourceLabel])];
    }
    return {items:next, added, formsAdded};
  }
  root.HKELE_LESSON = Object.freeze({focusOptions, focusLabel, choicesFromResults, mergeSelections, wordCount});
})(globalThis);
