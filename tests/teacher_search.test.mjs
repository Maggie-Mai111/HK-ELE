import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
const root=new URL('../',import.meta.url);const c={};c.globalThis=c;
for(const name of ['ai_filter_contract.js','ai_form_filter.js','word_family_results.js'])vm.runInNewContext(readFileSync(new URL(name,root),'utf8'),c);
const api=c.HKELE_AI_FILTER_CONTRACT,wordApi=c.HKELE_AI_WORD_FILTER;
const f={scope:'full',sort:'overall',limit:25,semanticQuery:'Music',candidateWords:['music','melody','notarecordedword']};
test('browser topic checks reject invented records, unchecked metadata and partial semantic conditions',()=>{
 for(const patch of [{candidateWords:undefined},{semanticQuery:undefined},{candidateWords:['music','Music']},{candidateWords:['musical instrument']},{candidateWords:['SELECT * FROM words']},{definitions:['invented']}])assert.throws(()=>api.validateConditions({...f,...patch}));
 assert.throws(()=>api.applyToRows([],f),/word-form evidence/);
});
test('browser topic results use exact accepted word records, membership, and evidence together',()=>{
 const families=[{baseword_key:'music',display_family:'music',candidate_member:1,overall_frequency_order:1},{baseword_key:'melody',display_family:'melody',candidate_member:0,overall_frequency_order:2}];
 const document={fields:['form','first_seen_hk_textbooks','lookup_only'],strings:[],families:{music:[['music','P1',0],['musical','S4',0]],melody:[['melody','S4',0]]}};
 const all=wordApi.apply(families,f,document,new Set());assert.deepEqual(Array.from(all.families,x=>x.ai_match_form),['music','melody']);
 assert.deepEqual(Array.from(wordApi.apply(families,{...f,earliestObservedFrom:'S4'},document,new Set()).families,x=>x.ai_match_form),['melody']);
 assert.deepEqual(Array.from(wordApi.apply(families,{...f,scope:'candidate'},document,new Set()).families,x=>x.ai_match_form),['music']);
 c.HKELE_WORD_VIEW={allowsForm:(key,word)=>word==='music'};
 assert.deepEqual(Array.from(wordApi.apply(families,f,document,new Set()).families,x=>x.ai_match_form),['music']);
});
test('preview keeps the exact search plus familiar forms, and expanding restores every form',()=>{
 c.HKELE_WORD_VIEW={familiarForm:(key,word)=>key==='stress'&&['stress','stressed'].includes(word)};
 const result=c.HKELE_WORD_FAMILY_RESULTS;const rows=result.sortedForms(['stress','stressed','stressingly','stressfulness'].map(word=>({form:word,normalized_form:word})),'stressingly');
 assert.deepEqual(Array.from(result.previewForms(rows,'stress'),r=>r.form.form),['stressingly','stress','stressed']);
 assert.equal(result.previewForms(rows,'stress',true).length,4);assert.equal(rows.length,4);
});
test('candidate preselection preserves exact forms and evidence with a non-first spelling column',()=>{
 c.HKELE_WORD_VIEW={allowsForm:()=>true};
 const document={fields:['first_seen_hk_textbooks','form','lookup_only'],strings:[],families:{music:[['P1','music',0],['S4','musical',0],['S5','MUSIC',0]]}};
 const all=wordApi.formsFor(document,'music');
 assert.deepEqual(wordApi.formsFor(document,'music',new Set(['music'])),all.filter(item=>item.normalized_form==='music'));
});
