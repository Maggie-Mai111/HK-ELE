import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ctx={};vm.runInNewContext(fs.readFileSync(new URL('../text_normalization.js',import.meta.url),'utf8'),ctx);const api=ctx.HKELE_TEXT_NORMALIZATION;
const lookup=async word=>({owners:[{baseword_key:word==='i'?'trial:pronoun:i':word==='am'?'be':word==='reuse'?'use':word,blocked:false,match_classes:[],candidate_member:1,matched_form_evidence:{coverage_member:1}}]});
test('finite A expansion replaces its analysis token without altering the original surface or selection',async()=>{const source="I'm";const a=await api.normalizedAnalysis(source,lookup);assert.deepEqual(JSON.parse(JSON.stringify(a.tokens)).map(x=>x.familyKey),['trial:pronoun:i','be']);assert.equal(source,"I'm");const n=api.normalizedCounts([{normalizedAnalysis:a}]);assert.equal(n.tokens,2);assert.equal(n.wordList,2);});
test('only registered accepted spelling aliases normalize; no global hyphen stripping or corpus-position exceptions',async()=>{assert.equal(api.analysisSurface('We re-use this',3,5),'re-use');assert.equal(api.analysisSurface('We re-use this',6,9),null);assert.equal((await api.normalizedAnalysis('re-use',lookup)).tokens[0].form,'reuse');assert.equal((await api.normalizedAnalysis('sci-fi',lookup)).tokens[0].form,'sci-fi');assert.equal((await api.normalizedAnalysis('new-unregistered-hyphen',lookup)).applied,false);});

test('word-list credit requires the exact familiar form while keeping its Full family match',async()=>{
 const lookupMember=flag=>async()=>({owners:[{baseword_key:'the',blocked:false,match_classes:['EXACT_FORM'],candidate_member:1,matched_form_evidence:{coverage_member:flag}}]});
 const outside=await api.normalizedAnalysis('tha',lookupMember(0));
 assert.equal(outside.tokens[0].familyKey,'the');assert.equal(outside.tokens[0].wordListMember,false);
 assert.equal((await api.normalizedAnalysis('the',lookupMember(1))).tokens[0].wordListMember,true);
});
