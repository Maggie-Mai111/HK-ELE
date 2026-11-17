import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const contract=require('../ai_filter_contract.js');
require('../ai_form_filter.js');
const formFilter=globalThis.HKELE_AI_WORD_FILTER;
const grades=['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'];
const common={scope:'full',limit:100,sort:'overall'};

test('Web AI accepts and displays P1–S6 ranges in chronological order',()=>{
  assert.deepEqual([...contract.GRADES],grades);
  for(let start=0;start<grades.length;start++)for(let end=start;end<grades.length;end++){
    const filters=contract.validateConditions({...common,earliestObservedFrom:grades[start],earliestObservedTo:grades[end]});
    for(let index=0;index<grades.length;index++){
      const family={baseword_key:'fixture',display_family:'fixture',textbook_first_seen_level:grades[index]};
      assert.equal(contract.applyToRows([family],filters).matchedBeforeLimit,index>=start&&index<=end?1:0);
      assert.equal(formFilter.matches({first_seen_hk_textbooks:grades[index]},filters,new Set()),index>=start&&index<=end);
    }
    assert.equal(formFilter.matches({first_seen_hk_textbooks:null},filters,new Set()),false);
  }
  for(const level of ['S4','S5','S6']){
    const filters=contract.validateConditions({...common,earliestObservedFrom:level,earliestObservedTo:level});
    const result=contract.teacherResult({status:'ready',summary:'Textbook record filter',filters,clarifyingQuestion:null,warnings:[]});
    assert.equal(result.filters.earliestObservedFrom,level);
    assert.ok(contract.describeConditions(filters).some(text=>text.includes(level)));
  }
  assert.throws(()=>contract.validateConditions({...common,earliestObservedTo:'S7'}));
  assert.throws(()=>contract.validateConditions({...common,earliestObservedFrom:'S6',earliestObservedTo:'S4'}));
});

test('Web AI uses the actual spelling’s S4–S6 textbook record, not another family member’s stage',()=>{
  const evidence=JSON.parse(gunzipSync(readFileSync(new URL('../ai-form-evidence/20261103-wordlist1764-v1.json.gz',import.meta.url))).toString());
  for(const [family,word,grade] of [['cover','coverage','S4'],['cover','uncover','S5'],['suit','suitability','S6']]){
    const forms=formFilter.formsFor(evidence,family);
    const selected=forms.find(form=>form.form===word);
    assert.equal(selected.first_seen_hk_textbooks,grade);
    const filters=contract.validateConditions({...common,earliestObservedFrom:grade,earliestObservedTo:grade});
    assert.equal(formFilter.matches(selected,filters,new Set()),true);
    for(const other of forms.filter(form=>form.first_seen_hk_textbooks!==grade))assert.equal(formFilter.matches(other,filters,new Set()),false);
  }
});

test('Web AI retains navigation-only flags from actual source records',()=>{
  const evidence=JSON.parse(gunzipSync(readFileSync(new URL('../ai-form-evidence/20261103-wordlist1764-v1.json.gz',import.meta.url))).toString());
  assert.ok(evidence.fields.includes('lookup_only'));
  const filters=contract.validateConditions({...common,earliestObservedFrom:'S4',earliestObservedTo:'S4'});
  let checked=0;
  for(const key of Object.keys(evidence.families))for(const form of formFilter.formsFor(evidence,key)){
    if(form.lookup_only&&form.first_seen_hk_textbooks==='S4'){
      assert.equal(formFilter.matches(form,filters,new Set()),false);checked++;
    }
  }
  assert.equal(checked,21);
});
