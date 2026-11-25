import test from 'node:test';
import assert from 'node:assert/strict';
import '../coverage_lists.js';
import '../text_workspace.js';
const lists=globalThis.HKELE_COVERAGE_LISTS, display=globalThis.HKELE_TEXT_WORKSPACE.comparisonDisplay;
test('compact comparison keeps repeated, ambiguous and unmatched uses in the existing denominator',()=>{
  const known={status:'RESOLVED',owners:[{candidate_member:1,matched_form_evidence:{coverage_member:1}}]};
  const rows=[known,known,{status:'AMBIGUOUS',owners:[]},{status:'UNMATCHED',owners:[]}];
  const counts=Object.freeze(lists.summarize(rows,'90'));
  assert.equal(counts.total,4);assert.equal(counts.included,2);
  assert.deepEqual(display(counts),{value:'2 of 4 words · 50%',outsideHidden:false,outsideLabel:'2 words outside this list →'});
  assert.equal(rows.length,4);assert.equal(counts.percent,50);
});
test('zero matches, a fully matched passage and an empty input remain distinct',()=>{
  const absent=Object.freeze(lists.summarize([{status:'UNMATCHED',owners:[]}],'90'));
  assert.equal(display(absent).value,'0 of 1 word · 0%');
  assert.equal(display(absent).outsideLabel,'1 word outside this list →');
  assert.equal(display({included:1,total:1,outside:0,percent:100}).outsideHidden,true);
  assert.equal(display(lists.summarize([])).value,'No words to count.');
});
