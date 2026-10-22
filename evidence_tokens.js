(function(root) {
  "use strict";
  const subjects = [
    ["English Grammar and Writing", "english"], ["Health", "health"], ["Mathematics", "math"],
    ["Science", "science"], ["Social Studies and History", "social"],
  ];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function split(value, kind) {
    if (value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "—") return [];
    const text=String(value).trim();
    if (kind === "root") return text.split(/\s*[/|;·]\s*/).map(item=>item.trim()).filter(Boolean);
    if (kind !== "meaning") return [text];
    // Keep quoted phrases and parenthetical explanations intact; no root/gloss pairing is inferred.
    const parts=[];let start=0,depth=0,quote="";
    for(let i=0;i<text.length;i++) {
      const char=text[i];
      if(char==='"' && text[i-1]!=="\\") {quote=quote?"":'"';continue;}
      if(quote) continue;
      if(char==='('||char==='[')depth++;
      else if(char===')'||char===']')depth--;
      else if(depth===0&&(char===','||char===';'||char==='|'||char==='·')) {parts.push(text.slice(start,i).trim());start=i+1;}
      if(depth<0)return [text];
    }
    if(quote||depth!==0)return [text];
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  }
  function chips(values,kind) {
    const items=Array.isArray(values)?values:split(values,kind);
    if(!items.length)return "—";
    return `<span class="evidence-tokens">${items.map(value=>{
      const tone=kind==='subject'?(subjects.find(([label])=>label===value)?.[1]||'subject'):kind;
      return `<span class="evidence-token token-${esc(tone)}">${esc(value)}</span>`;
    }).join("")}</span>`;
  }
  root.HKELE_EVIDENCE_TOKENS=Object.freeze({split,chips});
})(globalThis);
