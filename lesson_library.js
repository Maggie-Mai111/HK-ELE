(function (root) {
  "use strict";
  const KEY = "hkele-web-lessons-v1";
  const LEGACY_LIST = "hkele-phase1v-teaching-list-v1";
  const LEGACY_TITLE = "hkele-lesson-title-v1";
  const copy = value => JSON.parse(JSON.stringify(value));
  const id = () => root.crypto?.randomUUID?.() || `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function validItems(items) {
    return Array.isArray(items) && items.every(item => item && typeof item.baseword_key === "string" &&
      Array.isArray(item.selected_forms) && item.selected_forms.every(form => typeof form === "string"));
  }
  function validate(value) {
    if (value?.version !== 1 || !Array.isArray(value.lessons) || !value.lessons.length ||
      !value.lessons.every(item => item && typeof item.id === "string" && typeof item.title === "string" && validItems(item.items)) ||
      new Set(value.lessons.map(item => item.id)).size !== value.lessons.length ||
      !value.lessons.some(item => item.id === value.activeId)) throw new Error("invalid");
    return value;
  }
  function create(storage) {
    let expected, blocked = false;
    let library = {version:1, activeId:id(), lessons:[]};
    library.lessons.push({id:library.activeId, title:"", items:[]});
    let problem = null;
    try {
      expected = storage.getItem(KEY);
      if (expected !== null) {
        library = validate(JSON.parse(expected));
        const backupKey = KEY + ":before-a-main-v1";
        if (storage.getItem(backupKey) === null) storage.setItem(backupKey, expected);
      }
      else {
        const raw = storage.getItem(LEGACY_LIST);
        const items = raw === null ? [] : JSON.parse(raw);
        if (!validItems(items)) throw new Error("invalid");
        library.lessons[0] = {id:library.activeId, title:storage.getItem(LEGACY_TITLE) || "", items:copy(items)};
      }
    } catch (error) {
      blocked = true; problem = error.message === "invalid" || error instanceof SyntaxError ? "invalid" : "unavailable";
    }
    function save(next) {
      if (blocked) return {ok:false, reason:problem};
      try {
        validate(next);
        if (storage.getItem(KEY) !== expected) return {ok:false, reason:"conflict"};
        const raw = JSON.stringify(next);
        storage.setItem(KEY, raw);
        expected = raw; library = copy(next);
        return {ok:true};
      } catch { return {ok:false, reason:"unavailable"}; }
    }
    return {library:copy(library), problem, save};
  }
  function withCurrent(library, title, items) {
    return {...copy(library), lessons:library.lessons.map(lesson => lesson.id === library.activeId ?
      {...lesson, title, items:copy(items)} : copy(lesson))};
  }
  function add(library, title) {
    const next = copy(library), lesson = {id:id(), title:title.trim(), items:[]};
    next.lessons.push(lesson); next.activeId = lesson.id;
    return next;
  }
  function emptyMessage(hasAi, core) {
    return hasAi ? "No words match these filters. Change or clear the filters to try again." : core ?
      "No words found in the Core list. Try the Full database." : "No words found. Try another word or check the spelling.";
  }
  root.HKELE_LESSON_LIBRARY = {KEY, create, withCurrent, add, emptyMessage};
})(globalThis);
