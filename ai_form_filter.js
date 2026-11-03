(function(root){
  "use strict";
  const norm=v=>String(v??"").normalize("NFKC").trim().toLowerCase();
  const values=v=>norm(v).split(/[|;,·/]+/).map(x=>x.trim().replace(/^[-–—]+|[-–—]+$/g,"")).filter(Boolean);
  const includes=(v,q)=>values(v).includes(norm(q).replace(/^[-–—]+|[-–—]+$/g,""));
  const flag=v=>v===true||v===1;
  const registered=v=>v!=null&&v!==""&&v!==0&&v!==false;
  const range=(v,min,max)=>min===undefined&&max===undefined||v!==null&&Number.isFinite(v)&&(min===undefined||v>=min)&&(max===undefined||v<=max);
  const grades=["P1","P2","P3","P4","P5","P6","S1","S2","S3"];
  const hasWordConditions=f=>[f.root,f.prefix,f.suffix,f.earliestObservedFrom,f.earliestObservedTo,f.awl,f.msvl,f.msvlSubjects,f.externalLevels,f.cpb100].some(v=>v!==undefined);
  const label=v=>typeof v==="string"&&v.trim()&&!/^[\d.\s,;|+\-–—eE]+$/.test(v)?v.trim():null;
  function formsFor(document,key){
    return (document.families[key]||[]).map(row=>{
      const form=Object.fromEntries(document.fields.map((field,i)=>[field,field!=="form"&&typeof row[i]==="number"&&row[i]<0?document.strings[-row[i]-1]:row[i]??null]));
      form.baseword_key=key;form.normalized_form=norm(form.form);
      form.external_level_reference=label(form.external_level_reference_teacher_display)??label(form.external_level_reference);
      return form;
    });
  }
  function matches(form,f,common){
    if(form.lookup_only) return false;
    const grade=grades.indexOf(form.first_seen_hk_textbooks);
    if(f.earliestObservedFrom&&(grade<0||grade<grades.indexOf(f.earliestObservedFrom)))return false;
    if(f.earliestObservedTo&&(grade<0||grade>grades.indexOf(f.earliestObservedTo)))return false;
    const withheld=String(form.phase1c_evidence_withheld_fields??"").toLowerCase();
    for(const key of ["root","prefix","suffix"])if(f[key]&&(withheld.includes(key)||!includes(form[key],f[key])))return false;
    if(f.awl!==undefined&&(form.awl===null||flag(form.awl)!==f.awl))return false;
    if(f.msvl!==undefined&&(form.msvl===null||registered(form.msvl)!==f.msvl))return false;
    if(f.msvlSubjects&&!f.msvlSubjects.some(x=>includes(form.msvl,x)))return false;
    if(f.externalLevels&&!f.externalLevels.some(x=>includes(form.external_level_reference,x)))return false;
    if(f.cpb100!==undefined&&common.has(norm(form.form).replace(/[’‘ʼ＇]/g,"'"))!==f.cpb100)return false;
    return true;
  }
  function project(family,form){
    const withheld=String(form.phase1c_evidence_withheld_fields??"").toLowerCase();
    return {...family,ai_match_form:form.form,ai_match_key:family.baseword_key+"\u0000"+norm(form.form),ai_source_family:family,browse_display_word:form.form,
      textbook_first_seen_level:form.first_seen_hk_textbooks,external_level_reference_display:form.external_level_reference,browse_external_level_reference:form.external_level_reference,
      awl:form.awl,msvl:form.msvl,browse_root:form.root,browse_root_meaning:form.root_meaning_alignment_status==="MATCHED_UNIQUE_EXACT"?form.root_meaning:null,
      browse_prefix:withheld.includes("prefix")?null:form.prefix,browse_suffix:withheld.includes("suffix")?null:form.suffix};
  }
  function apply(families,proposed,document,common){
    const f=root.HKELE_AI_FILTER_CONTRACT.validateConditions(proposed),hits=[];
    const compareHit=(a,b)=>f.sort==="az"?norm(a.form.form).localeCompare(norm(b.form.form),"en")||a.family.baseword_key.localeCompare(b.family.baseword_key):
      (a.family[f.sort==="hk"?"current_hk_frequency_rank":"overall_frequency_order"]??Number.MAX_SAFE_INTEGER)-(b.family[f.sort==="hk"?"current_hk_frequency_rank":"overall_frequency_order"]??Number.MAX_SAFE_INTEGER)||norm(a.form.form).localeCompare(norm(b.form.form),"en");
    let matchedBeforeLimit=0;
    for(const family of families){
      if(flag(family.display_blocked)||f.scope==="candidate"&&!flag(family.candidate_member)||f.scope==="inclusive_reference"&&!flag(family.reference_member))continue;
      if(!range(family.overall_frequency_order,f.overallRankMin,f.overallRankMax)||!range(family.current_hk_frequency_rank,f.hkRankMin,f.hkRankMax))continue;
      if(f.hkBands&&!f.hkBands.includes(family.current_hk_frequency_band))continue;
      for(const form of formsFor(document,family.baseword_key))if(matches(form,f,common)){matchedBeforeLimit++;const hit={family,form};if(hits.length<f.limit||compareHit(hit,hits[hits.length-1])<0){hits.push(hit);hits.sort(compareHit);if(hits.length>f.limit)hits.pop();}}
    }

    return {filters:f,matchedBeforeLimit,families:hits.slice(0,f.limit).map(x=>project(x.family,x.form)),resultUnit:"word"};
  }
  root.HKELE_AI_WORD_FILTER=Object.freeze({hasWordConditions,formsFor,matches,apply});
})(globalThis);
