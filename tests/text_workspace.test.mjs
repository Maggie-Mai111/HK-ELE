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
test("missing rank is not rarity; class comparison uses form evidence before family evidence",()=>{
  const family={baseword_key:"use",display_family:"use",candidate_member:1,current_hk_frequency_rank:null,
    textbook_first_seen_level:"P1",matched_form_evidence:{first_seen_hk_textbooks:"P5"}};
  const items=[{status:"RESOLVED",surface:"reusable",normalized_token:"reusable",owners:[family]}];
  assert.equal(reader.suggestions(items,new Set()).length,0);
  const entries=reader.suggestions(items,new Set(),"P4");
  assert.equal(entries.length,1);assert.deepEqual(entries[0].reasons,["Textbooks: P5"]);
  assert.equal(reader.suggestions(items,new Set(["reusable"]),"P4").length,0);
});
test("list count distinguishes selected words from family rows",()=>{
  assert.equal(globalThis.HKELE_LESSON.wordCount([{selected_forms:["reuse","reusable"]},{selected_forms:["plastic"]}]),3);
});
