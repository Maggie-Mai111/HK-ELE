import assert from "node:assert/strict";
import test from "node:test";
import "../lesson_contract.js";
const lesson=globalThis.HKELE_LESSON;
const family={baseword_key:"use",display_family:"use"};
const create=(owner,index)=>({baseword_key:owner.baseword_key,selected_forms:[],order:index+1,notes:"",connections:"",depth:"Notice"});
test("lesson batch merges repeated forms without losing prior teacher work",()=>{
  const saved={...create(family,0),selected_forms:["use"],notes:"Compare reuse",connections:"recycle",depth:"Master",teaching_focus:"mention"};
  const before=JSON.stringify(saved);
  const result=lesson.mergeSelections([saved],[{family,selectedForms:["use","reusable","reusable"],sourceLabel:"Check a text"}],create);
  assert.equal(result.added,0);assert.equal(result.formsAdded,1);
  assert.deepEqual(result.items[0].selected_forms,["use","reusable"]);
  assert.equal(result.items[0].notes,"Compare reuse");assert.equal(result.items[0].connections,"recycle");
  assert.equal(result.items[0].depth,"Master");assert.equal(result.items[0].teaching_focus,"mention");
  assert.equal(JSON.stringify(saved),before);
});
test("choices preserve observed forms and exclude unresolved/ambiguous/blocked owners and context",()=>{
  const result=lesson.choicesFromResults([
    {status:"RESOLVED",owners:[family],surface_forms:["reusable","reuse"],context_examples:["private source"]},
    {status:"UNMATCHED",owners:[],surface:"missing"},
    {status:"AMBIGUOUS",owners:[family,family],surface:"ambiguous"},
    {status:"RESOLVED",owners:[{...family,blocked:1}],surface:"blocked"},
  ]);
  assert.equal(result.length,1);assert.deepEqual(result[0].selectedForms,["reusable","reuse"]);
  assert.equal(JSON.stringify(result).includes("private source"),false);
});
test("new teaching plans are undecided; blocked records and empty selections never enter a lesson",()=>{
  const result=lesson.mergeSelections([],[{family,selectedForms:["reusable"]},{family:{...family,blocked:1},selectedForms:["blocked"]},{family,selectedForms:[" "]}],create);
  assert.equal(result.items.length,1);assert.equal(result.formsAdded,1);
  assert.equal(lesson.focusLabel(result.items[0].teaching_focus),"Not decided");
  assert.equal(lesson.focusLabel("focus"),"Teach in depth");assert.equal(lesson.focusLabel("mention"),"Briefly introduce");
});
