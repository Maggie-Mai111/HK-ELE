import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const load=path=>JSON.parse(gunzipSync(readFileSync(root+'data/releases/2026-10-20-a-main-v1/'+path)));
const manifest=load('manifest.json.gz');
function detail(key) {
  let hash=2166136261;
  for(const byte of new TextEncoder().encode(key))hash=Math.imul(hash^byte,16777619)>>>0;
  const [family,forms]=load(`detail/${String(hash%manifest.detail_buckets).padStart(3,'0')}.json.gz`)[key];
  const inflate=(fields,row)=>Object.fromEntries(fields.map((field,i)=>[field,row[i]]));
  return {family:inflate(manifest.family_fields,family),forms:forms.map(row=>inflate(manifest.form_fields,row))};
}
const context=vm.createContext({});vm.runInContext(readFileSync(root+'lesson_data_refresh.js','utf8'),context);
const refresh=(item,value)=>JSON.parse(JSON.stringify(context.HKELE_LESSON_DATA_REFRESH.refresh(item,value)));
test('Web refresh keeps concrete forms, teacher work and a recoverable pre-update snapshot',()=>{
  const old={baseword_key:'use',display_family:'use',selected_forms:['reusable'],notes:'My lesson note',connections:'target meaning',order:4,depth:'Practise',teaching_focus:'focus',overall_frequency_order:15};
  const next=refresh(old,detail('use'));
  for(const key of ['selected_forms','notes','connections','order','depth','teaching_focus'])assert.deepEqual(next[key],old[key]);
  assert.equal(next.data_version,'2026-10-20-a-main-v1');assert.equal(next.overall_frequency_order,detail('use').family.overall_frequency_order);
  assert.deepEqual(next.previous_evidence,old);
});
test('Web retains a changed-owner selection under its original identity for review',()=>{
  for(const [key,word] of [['absorpt','absorption'],['alterable','alterable']]) {
    const old={baseword_key:key,display_family:key,selected_forms:[word],notes:'Keep this note',order:2,overall_frequency_order:15};
    const next=refresh(old,detail(key));
    assert.match(next.data_review_status,/Saved selection kept/);
    for(const field of Object.keys(old))assert.deepEqual(next[field],old[field]);
  }
});
