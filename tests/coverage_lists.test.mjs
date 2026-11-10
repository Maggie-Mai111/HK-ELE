import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
function setup(){const c={URL,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,crypto:globalThis.crypto,location:{href:'http://fixture.invalid/'},fetch:async p=>new Response(new Uint8Array(read(p)))};c.window=c;for(const f of ['coverage_lists.js','coverage_lists_release.js','ai_filter_contract.js','ai_form_filter.js','static_api.js'])vm.runInNewContext(read(f).toString(),c);return c;}
test('registered 95% view has 2907 nested families with its own overall, HK and alphabetical sorting',async()=>{
 const c=setup(),api=c.HKELE_STATIC_API;
 const main=(await api.request('/families?scope=core&sort=overall&page=1&page_size=100')).families;
 const wide=await api.request('/families?scope=core95&sort=overall&page=1&page_size=100');
 assert.equal(wide.total_items,2907);assert.deepEqual(Array.from(wide.families,f=>f.baseword_key),Array.from(main,f=>f.baseword_key));
 const last=await api.request('/families?scope=core95&sort=overall&page=30&page_size=100');assert.equal(last.families.at(-1).overall_frequency_order,2907);
 for(const sort of ['hk','az']){const result=await api.request(`/families?scope=core95&sort=${sort}&page=1&page_size=100`);assert.equal(result.families.length,100);assert.equal(result.total_items,2907);}
});
test('actual 8-word passage yields 8 list occurrences, including the and and',async()=>{
 const c=setup(),text='The teacher and the students read the text.';
 const occurrences=Array.from(text.matchAll(/[A-Za-z]+/g),(m,i)=>({occurrence_id:String(i),surface:m[0],normalized_token:m[0].toLowerCase(),start_offset:m.index,end_offset:m.index+m[0].length,occurrence_order:i,token_status:'SUPPORTED_TOKEN'}));
 const result=await c.HKELE_STATIC_API.request('/occurrences/resolve',{body:JSON.stringify({text,occurrences})});
 assert.equal(result.occurrences.length,8);
 for(const target of ['90','95']){const counts=c.HKELE_COVERAGE_LISTS.summarize(result.occurrences,target);assert.equal(counts.included,8);assert.equal(counts.total,8);assert.equal(counts.percent,100);}
 const corrupt={...result.occurrences[0],owners:[{...result.occurrences[0].owners[0],matched_form_evidence:{coverage_member:0}}]};
 assert.equal(c.HKELE_COVERAGE_LISTS.summarize([corrupt],'95').included,0);
});

test('95% AI execution includes actual families beyond the 90% boundary before applying limits',async()=>{
 const c=setup(),filters={scope:'full',overallRankMin:1664,sort:'overall',limit:3};
 const r=await c.HKELE_STATIC_API.request('/families?scope=core95&page=1&page_size=25&ai_filters='+encodeURIComponent(JSON.stringify(filters)));
 assert.equal(r.families.length,3);assert.equal(r.families[0].overall_frequency_order,1664);assert.ok(r.families.every(f=>f.overall_frequency_order<=2907&&!f.candidate_member));
 const none=await c.HKELE_STATIC_API.request('/families?scope=core95&ai_filters='+encodeURIComponent(JSON.stringify({...filters,overallRankMin:2908})));assert.equal(none.families.length,0);
});
