import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname,join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const contract=require(join(root,'ai_filter_contract.js'));
function api(failFullIndexOnce = false) {
  const context=vm.createContext({window:{HKELE_AI_FILTER_CONTRACT:contract},location:{href:'https://fixture.invalid/'},URL,crypto:globalThis.crypto,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,fetch:async path=>{
    if (failFullIndexOnce && path === 'data/releases/2026-10-20-a-main-v1/ai_full_projection.json.gz') { failFullIndexOnce=false;return new Response('unavailable',{status:503}); }
    return new Response(new Uint8Array(readFileSync(join(root,path))));
  }});
  vm.runInContext(readFileSync(join(root,'static_api.js'),'utf8'),context);
  return context.window.HKELE_STATIC_API;
}
test('default Full and Core scopes retain exact populations and the former Reference-only word fabric',async()=>{
  const repository=api();
  assert.equal((await repository.request('/families')).available_items,163906);
  assert.equal((await repository.request('/families?scope=core')).available_items,2871);
  const result=await repository.request('/search?q=fabric');
  assert.equal(result.status,'RESOLVED');
  assert.equal(Number(result.owners[0].candidate_member),0);
  assert.equal(Number(result.owners[0].reference_member),0);
});
test('full AI failure is explicit, with retry rather than a smaller-list fallback',async()=>{
  const repository=api(true);
  const query='/families?ai_filters='+encodeURIComponent(JSON.stringify({scope:'full',root:'act',limit:100,sort:'overall'}));
  await assert.rejects(repository.request(query),/503/);
  assert.equal((await repository.request(query)).matched_before_limit,69);
});
test('teacher AI review defaults to Full, with an explicit Core option',()=>{
  const raw={status:'ready',summary:'Candidate and Reference',filters:{scope:'inclusive_reference',limit:10,sort:'overall'},clarifyingQuestion:null,warnings:[]};
  const reviewed=contract.teacherResult(raw);
  assert.equal(reviewed.filters.scope,'full');
  assert.equal(raw.filters.scope,'inclusive_reference');
  const rows=[{baseword_key:'core',candidate_member:1,reference_member:1,overall_frequency_order:1},{baseword_key:'extra',candidate_member:0,reference_member:1,overall_frequency_order:2}];
  const result=contract.applyToRows(rows,reviewed.filters,{});
  assert.deepEqual(result.families.map(f=>f.baseword_key),['core','extra']);
  assert.deepEqual(contract.applyToRows(rows,contract.teacherResult(raw,'core').filters,{}).families.map(f=>f.baseword_key),['core']);
  assert.doesNotMatch([reviewed.summary,...contract.describeConditions(reviewed.filters)].join(' '),/Candidate|Reference/);
});
test('teacher scope controls contain only Full database and Core list',()=>{
  const html=readFileSync(join(root,'index.html'),'utf8');
  assert.deepEqual([...html.matchAll(/class="scope(?: active)?" data-scope="([^"]+)"/g)].map(m=>m[1]).sort(),['core','full']);
  assert.doesNotMatch(html,/Candidate|Candidate \+ reference|value="broader"/);
  assert.match(html,/<strong>Core list<\/strong>/);
  assert.match(html,/<table id="family-table">/);
});
test('actual full AI filtering reaches non-Core and non-reference families with all-member morphology',async()=>{
  const repository=api();
  const filters={scope:'full',root:'act',limit:100,sort:'overall'};
  const full=await repository.request('/families?ai_filters='+encodeURIComponent(JSON.stringify(filters)));
  const core=await repository.request('/families?ai_filters='+encodeURIComponent(JSON.stringify({...filters,scope:'candidate'})));
  assert.equal(full.scope,'full');
  assert.equal(full.matched_before_limit,69);
  assert.equal(core.matched_before_limit,7);
  assert.ok(full.families.some(f=>!f.candidate_member&&!f.reference_member));
  for(const [field,value,count] of [['earliestObservedTo','P2',1697],['hkBands',['HK Top 1k'],1000]]){
    const result=await repository.request('/families?ai_filters='+encodeURIComponent(JSON.stringify({scope:'full',[field]:value,limit:10,sort:'overall'})));
    assert.equal(result.matched_before_limit,count);
  }
});
