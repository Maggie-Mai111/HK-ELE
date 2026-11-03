import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const context=vm.createContext({});
for(const name of ['identity_migration.js','lesson_data_refresh.js'])vm.runInContext(source(name),context);
const api=context.HKELE_LESSON_DATA_REFRESH;
test('old agency selection retains its old identity and all teacher work when its owner has moved',()=>{
 const old={baseword_key:'age',display_family:'age',selected_forms:['agency'],data_version:'2026-10-20-a-main-v1',order:3,notes:'Explain organisation',connections:'Target meaning',depth:'Practise',teaching_focus:'focus'};
 const current={family:{baseword_key:'agent',display_family:'agent',data_version:'2026-11-03-a2658-finite-family-closure-v1'},forms:[{normalized_form:'agency'}]};
 assert.equal(api.identityApplies(old,current.family.data_version),false);
 const next=api.refresh(old,current);for(const key of Object.keys(old))assert.deepEqual(next[key],old[key]);assert.match(next.data_review_status,/family has changed/);
});
test('unchanged saved spellings can refresh evidence without replacing notes, order or forms',()=>{
 const old={baseword_key:'use',display_family:'use',selected_forms:['reusable'],data_version:'2026-10-20-a-main-v1',order:2,notes:'P5 lesson'};
 const next=api.refresh(old,{family:{baseword_key:'use',display_family:'use',data_version:'2026-11-03-a2658-finite-family-closure-v1',overall_frequency_order:54},forms:[{normalized_form:'reusable'}]});
 assert.equal(next.notes,old.notes);assert.equal(next.order,old.order);assert.deepEqual(next.selected_forms,old.selected_forms);assert.equal(next.data_review_status,null);assert.equal(next.overall_frequency_order,54);
});
