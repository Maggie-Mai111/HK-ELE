import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
function api(){const ctx={};vm.runInNewContext(read('selected_words.js'),ctx);return ctx.HKELE_SELECTED_WORDS;}
test('copy uses saved order and explicit forms instead of making a family-head selection',()=>{
 const items=[{order:1,selected_forms:['classroom']},{order:0,selected_forms:['reusable','reusability']},{order:2,display_family:'unselected',selected_forms:[]}];const before=JSON.stringify(items);
 assert.equal(JSON.stringify(api().selectedWordsText(items)),JSON.stringify({text:'reusable\nreusability\nclassroom',count:3,skipped:1}));assert.equal(JSON.stringify(items),before);
});
test('notes copy keeps separate meanings, compounds and case without source metadata',()=>{
 const result=api().selectedWordsText([{selected_forms:['cell'],notes:'Biological sense.',connections:'A living cell'},{selected_forms:['cell'],notes:'Spreadsheet sense.'},{selected_forms:['US','us','café',"teacher's"]}],true);
 assert.match(api().selectedWordsText([{selected_forms:['reusable'],teaching_focus:'focus'}],true).text,/Teaching focus: Teach in depth/);assert.equal(result.count,6);assert.equal(result.text,"cell\nNote: Biological sense.\nRelated/example: A living cell\n\ncell\nNote: Spreadsheet sense.\n\nUS, us, café, teacher's");assert.doesNotMatch(result.text,/Family|rank|version|baseword/);
});
test('copy never clears empty text and returns a manual-copy path on clipboard denial',async()=>{
 const helper=api(),written=[];assert.equal(await helper.copyPlainText('reusable',async value=>written.push(value)),true);assert.equal(await helper.copyPlainText('',async value=>written.push(value)),false);assert.deepEqual(written,['reusable']);assert.equal(await helper.copyPlainText('reusable',async()=>{throw new Error('Denied');}),false);
});
test('copying is available on the selected-word page and passage selection without CSV or Markdown controls',()=>{
 const html=read('index.html');assert.match(html,/id="list-title">Selected words/);assert.match(html,/id="list-copy-actions"/);assert.match(html,/id="preteach-copy-actions"/);assert.match(html,/id="export-xlsx">Download Excel/);assert.doesNotMatch(html,/id="export-csv"|id="export-md"|More formats/);
 assert.match(read('selected_words.js'),/data-copy-text/);assert.match(read('lesson_workspace.js'),/data-picker-copy/);
});
