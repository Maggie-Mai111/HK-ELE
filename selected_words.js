(function(exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectedWordsText = selectedWordsText;
exports.copyPlainText = copyPlainText;
function selectedWordsText(items, withNotes = false) {
    let count = 0, skipped = 0;
    const blocks = [];
    const ordered = [...items].sort((a, b) => (a.customOrder ?? a.order ?? 0) - (b.customOrder ?? b.order ?? 0));
    for (const item of ordered) {
        const forms = (item.selectedForms ?? item.selected_forms ?? []).filter((s) => typeof s === "string" && Boolean(s.trim())).map(s => s.trim());
        if (!forms.length) {
            skipped++;
            continue;
        }
        count += forms.length;
        if (!withNotes) {
            blocks.push(...forms);
            continue;
        }
        const lines = [forms.join(", ")];
        const focus = item.teachingFocus ?? item.teaching_focus;
        if (focus === "focus" || focus === "mention")
            lines.push("Teaching focus: " + (focus === "focus" ? "Teach in depth" : "Briefly introduce"));
        if (typeof item.notes === "string" && item.notes.trim())
            lines.push("Note: " + item.notes.trim().replace(/\r\n/g, "\n"));
        if (typeof item.connections === "string" && item.connections.trim())
            lines.push("Related/example: " + item.connections.trim().replace(/\r\n/g, "\n"));
        blocks.push(lines.join("\n"));
    }
    return { text: blocks.join(withNotes ? "\n\n" : "\n"), count, skipped };
}
async function copyPlainText(text, writer) {
    if (!text)
        return false;
    const write = writer ?? (typeof navigator !== "undefined" && navigator.clipboard?.writeText
        ? (value) => navigator.clipboard.writeText(value) : undefined);
    if (!write)
        return false;
    try {
        await write(text);
        return true;
    }
    catch {
        return false;
    }
}

})(globalThis.HKELE_SELECTED_WORDS={});
(function(root){
  const api=root.HKELE_SELECTED_WORDS,tokens=new WeakMap();
  api.mount=function(host,getItems,options={}){
    if(!host)return;
    const token=(tokens.get(host)||0)+1;tokens.set(host,token);
    const count=api.selectedWordsText(getItems()).count;
    host.hidden=!count;
    if(!count){host.innerHTML='';return;}
    host.innerHTML='<div class="lesson-actions"><button type="button" class="primary" data-copy-mode="words">Copy words ('+count+')</button><button type="button" data-copy-mode="notes">Copy with notes</button>'+(options.review?'<button type="button" data-copy-review>Review selected words ('+count+')</button>':'')+'</div><p class="hint" data-copy-status role="status" aria-live="polite"></p><div data-copy-fallback hidden><label>Text to copy<textarea rows="5" readonly data-copy-text></textarea></label></div>';
    host.querySelectorAll('[data-copy-mode]').forEach(button=>button.addEventListener('click',async()=>{
      const withNotes=button.dataset.copyMode==='notes',snapshot=api.selectedWordsText(getItems(),withNotes);
      if(!snapshot.count)return;
      const copied=await api.copyPlainText(snapshot.text);
      if(tokens.get(host)!==token || api.selectedWordsText(getItems(),withNotes).text!==snapshot.text)return;
      const skipped=snapshot.skipped?' Choose a word for '+snapshot.skipped+' saved '+(snapshot.skipped===1?'entry.':'entries.'):'';
      host.querySelector('[data-copy-status]').textContent=(copied?'Copied '+snapshot.count+' '+(snapshot.count===1?'word':'words')+(withNotes?' with notes':'')+'.':'Select the text below, then copy.')+skipped;
      host.querySelector('[data-copy-fallback]').hidden=copied;
      const text=host.querySelector('[data-copy-text]');text.value=copied?'':snapshot.text;
      if(!copied){text.focus();text.select();}
    }));
    host.querySelector('[data-copy-review]')?.addEventListener('click',options.review);
  };
})(globalThis);
