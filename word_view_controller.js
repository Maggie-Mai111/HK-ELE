(function(root){
 "use strict";
 let current="all";const d=root.HKELE_WORD_VIEW_DATA;
 const counts=()=>d.counts[current];
 const familiarForm=(key,word)=>(d.members[key]||[]).includes(String(word||"").normalize("NFKC").trim().toLowerCase());
 function project(item){
  if(!item)return item;const raw=item._allView||item;if(current==="all")return raw;
  const row=d.families[raw.baseword_key];const values=Object.fromEntries(d.fields.map((key,i)=>[key,row?.[i]??null]));const form=raw.matched_form_evidence;
  return {...raw,...values,candidate_member:row?.[4]||0,reference_member:row?.[5]||0,word_list_member:row?.[4]||0,set_membership:row?.[6]||"Full database",_allView:raw,
   ...(form?{matched_form_evidence:{...form,coverage_member:familiarForm(raw.baseword_key,form.normalized_form||form.form)?1:0}}:{})};
 }
 function item(value){
  const raw=value._allViewItem||value;
  // Group metadata belongs to the displayed result, not its original occurrence.
  const keys=["display_word","count","first_order","occurrence_ids","surface_forms","context_examples"];
  const grouped=Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
  const visible=Object.keys(grouped).length?{...raw,...grouped}:raw;
  if(current==="all")return visible;
  return {...visible,_allViewItem:raw,owners:(raw.owners||[]).map(project),alternatives:(raw.alternatives||[]).map(project),...(raw.normalizedAnalysis?{normalizedAnalysis:{...raw.normalizedAnalysis,tokens:raw.normalizedAnalysis.tokens.map(t=>({...t,wordListMember:Boolean(d.families[t.familyKey]?.[4])&&familiarForm(t.familyKey,t.form)}))}}:{})};}
 root.HKELE_WORD_VIEW={get:()=>current,set:value=>{current=value==="familiar"?"familiar":"all";},counts,project,item,familiarForm,eligible:key=>Boolean(d.families[key]),allowsForm:(key,word)=>current==="all"||familiarForm(key,word)};
})(globalThis);
