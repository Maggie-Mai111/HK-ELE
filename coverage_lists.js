(function(root) {
  "use strict";
  const lists = {get "90"(){return {label:"90% list",families:root.HKELE_WORD_VIEW?.counts()["90"]??1676};},get "95"(){return {label:"95% list",families:root.HKELE_WORD_VIEW?.counts()["95"]??2910};}};
  function inFamily(family,target="90") {
    if(!family)return false;
    if(target==="90")return family.candidate_member===true||family.candidate_member===1;
    const rank=family.overall_frequency_order;
    return typeof rank==="number"&&Number.isInteger(rank)&&rank>=1&&rank<=(root.HKELE_WORD_VIEW?.get()==="familiar"?3685:2910);
  }
  function inForm(owner,target="90") {return inFamily(owner,target)&&owner?.matched_form_evidence?.coverage_member===1;}
  function occurrenceInList(item,target="90") {return item.status==="RESOLVED"&&item.owners?.length===1&&inForm(item.owners[0],target);}
  function summarize(items,target="90") {const included=items.filter(item=>occurrenceInList(item,target)).length;return {total:items.length,included,outside:items.length-included,percent:items.length?100*included/items.length:null};}
  root.HKELE_COVERAGE_LISTS={lists,inFamily,inForm,occurrenceInList,summarize};
})(globalThis);
