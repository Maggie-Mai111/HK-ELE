import assert from "node:assert/strict";
import test from "node:test";
import "../text_workspace.js";
import "../lesson_contract.js";
const reader=globalThis.HKELE_TEXT_WORKSPACE;

test("reader retains punctuation and unmatched words without assigning a family",()=>{
  const text="cell, classroom.\ncell";
  const items=[{surface:"cell",start_offset:0,end_offset:4,status:"RESOLVED"},
    {surface:"classroom",start_offset:6,end_offset:15,status:"UNMATCHED"},
    {surface:"cell",start_offset:17,end_offset:21,status:"RESOLVED"}];
  const parts=reader.segments(text,items);
  assert.equal(parts.map(part=>part.text).join(""),text);
  assert.equal(parts.find(part=>part.item?.status==="UNMATCHED").text,"classroom");
  assert.equal(parts.find(part=>part.item?.status==="UNMATCHED").item.owners,undefined);
  assert.equal(reader.segments(text,[{surface:"wrong",start_offset:0,end_offset:4}]).filter(part=>part.item).length,0);
});
test("missing rank and later textbook records do not imply teaching need",()=>{
 const family={baseword_key:"use",display_family:"use",current_hk_frequency_rank:null,matched_form_evidence:{first_seen_hk_textbooks:"P5"}};
 const item={occurrence_id:"x",status:"RESOLVED",surface:"reusable",owners:[family]};
 assert.equal(reader.suggestions([item],new Set(),"P4").length,0);
 const entries=reader.suggestions([item],new Set(),"P4",{filter:"later"});
 assert.equal(entries.length,1);assert.deepEqual(entries[0].reasons,["Textbooks: P5 · after P4"]);
});

test("list count distinguishes selected words from family rows",()=>{
  assert.equal(globalThis.HKELE_LESSON.wordCount([{selected_forms:["reuse","reusable"]},{selected_forms:["plastic"]}]),3);
});

test("optional fact browsing groups real identities and keeps form-specific records",()=>{
 const make=(key,word,level,order)=>({occurrence_id:String(order),status:"RESOLVED",surface:word,occurrence_order:order,owners:[{baseword_key:key,display_family:"cell",current_hk_frequency_rank:1132,matched_form_evidence:{first_seen_hk_textbooks:level}}]});
 const entries=reader.suggestions([make("cell","cells","P5",0),make("cell","cell","P4",6),make("cell","cells","P5",11),make("other-cell","other","P3",17)],new Set(),null,{filter:"all"});
 const groups=reader.groupSuggestions(entries);assert.equal(groups.length,2);
 assert.deepEqual(groups[0].forms.map(({entry})=>[entry.form,entry.count]),[["cells",2],["cell",1]]);
 assert.equal(reader.suggestionEvidence(entries[0]).primary,null);
 assert.ok(!reader.suggestionEvidence(entries[0]).extra.some(v=>v.includes("outside")));
});

test("only teacher-selected occurrences produce the default explanation list",()=>{
 const a={occurrence_id:"a",occurrence_order:0,status:"RESOLVED",surface:"run",owners:[{baseword_key:"run",display_family:"run",current_hk_frequency_rank:1001,matched_form_evidence:{awl:1,first_seen_hk_textbooks:"P6"}}]};
 const b={...a,occurrence_id:"b",occurrence_order:10,context:"another use"};
 assert.deepEqual(reader.suggestions([a,b],new Set(),"P1"),[]);
 const entries=reader.suggestions([a,b],new Set(),"P1",{judgements:{a:true,b:false}});
 assert.equal(entries.length,1);assert.equal(entries[0].occurrence,b);
 assert.equal(reader.suggestionEvidence(entries[0]).primary,"You marked this use May need explaining");
 assert.equal(reader.suggestions([a,b],new Set(),null,{judgements:{a:true}}).length,0);
 const unmatched={...a,status:"UNMATCHED",owners:[]};
 assert.deepEqual(reader.markedOtherOccurrences([unmatched],{a:false}),[unmatched]);
});

test("occurrence lookup uses the whole text and keeps distinct uses and their order",()=>{
  const first={surface:"Stress",owners:[{baseword_key:"one"}],context:"first"};
  const other={surface:"stressed",context:"different spelling"};
  const last={surface:"stress",owners:[{baseword_key:"two"}],context:"last"};
  assert.deepEqual(reader.wordOccurrences([first,other,last],"stress"),[first,last]);
  assert.equal(reader.wordOccurrences([first,other,last],"stress")[1],last);
  assert.deepEqual(reader.wordOccurrences([first,other,last],"absent"),[]);
});


test("occurrence excerpts use verified offsets in the teacher's original text",()=>{
  const text="Students discussed stress. A stressful lesson caused stress.";
  const item={surface:"stress",start_offset:19,end_offset:25};
  const excerpt=reader.occurrenceExcerpt(text,item);
  assert.equal(excerpt.word,"stress");
  assert.equal(excerpt.before+excerpt.word+excerpt.after,text);
  assert.deepEqual(reader.occurrenceExcerpt(text,{...item,surface:"wrong"}),{before:"",word:"wrong",after:""});
});
