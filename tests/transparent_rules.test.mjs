import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const read=name=>readFileSync(new URL('../'+name,import.meta.url));
const contract=createRequire(import.meta.url)('../ai_filter_contract.js');
function repository(corruptOnce=false){
  const ctx=vm.createContext({window:{HKELE_AI_FILTER_CONTRACT:contract},HKELE_AI_FILTER_CONTRACT:contract,location:{href:'https://fixture.invalid/'},URL,crypto:globalThis.crypto,TextDecoder,TextEncoder,Blob,Response,DecompressionStream,
    fetch:async path=>{const raw=new Uint8Array(read(path));if(corruptOnce&&path.includes('ai-form-evidence')){raw[raw.length-1]^=1;corruptOnce=false;}return new Response(raw);}});
  for(const file of ['cpb100.js','ai_form_release.js','ai_form_filter.js'])vm.runInContext(read(file).toString(),ctx);
  ctx.window.HKELE_CPB100=ctx.HKELE_CPB100;ctx.window.HKELE_AI_FORM_RELEASE=ctx.HKELE_AI_FORM_RELEASE;ctx.window.HKELE_AI_WORD_FILTER=ctx.HKELE_AI_WORD_FILTER;
  vm.runInContext(read('static_api.js').toString(),ctx);
  return ctx.window.HKELE_STATIC_API;
}
test('actual word evidence rejects corrupt AI projection, retries, and retains agency under its canonical age owner',async()=>{
  const repo=repository(true),filters={scope:'full',root:'act',overallRankMin:787,overallRankMax:787,sort:'overall',limit:100};
  const query='/families?ai_filters='+encodeURIComponent(JSON.stringify(filters));
  await assert.rejects(repo.request(query),/integrity|changed|hash/i);
  const result=await repo.request(query);
  const agency=result.families.find(row=>row.ai_match_form==='agency');
  assert.ok(agency);assert.equal(agency.baseword_key,'agent');assert.equal(agency.ai_source_family.baseword_key,'agent');
  assert.equal(agency.textbook_first_seen_level,null);
  assert.ok(!result.families.some(row=>['age','aged','ageing'].includes(row.ai_match_form)));
});
test('real AI result handlers open and add the matched spelling, preserving canonical family information',()=>{
  const app=read('app.js').toString();
  const start=app.indexOf("    $$('[data-view-family]').forEach");
  const end=app.indexOf('\n  }',start);assert.ok(start>0&&end>start);
  const canonical={baseword_key:'age',textbook_first_seen_level:'P1'};
  const hit={...canonical,ai_match_form:'agency',ai_source_family:canonical,textbook_first_seen_level:'S2'};
  const callbacks={},opened=[],added=[];
  vm.runInNewContext(app.slice(start,end),{
    $$:selector=>[{dataset:{viewFamily:'age',addFamily:'age',browseRow:'0'},addEventListener:(_event,callback)=>{callbacks[selector]=callback;}}],
    state:{rows:[hit]},openFamily:(...args)=>opened.push(args),addToList:(...args)=>added.push(args),addFamilyByKey:()=>assert.fail('must retain the matched form'),
  });
  callbacks['[data-view-family]']();callbacks['[data-add-family]']();
  assert.deepEqual(opened,[['age','agency']]);assert.deepEqual(added,[[canonical,'agency','Find words']]);
});
test('Web CPB100 filtering uses the fixed 100-word list rather than the legacy 52-word grouping',async()=>{
  const ctx={};vm.runInNewContext(read('cpb100.js').toString(),ctx);
  const tokens=new Set(ctx.HKELE_CPB100.tokens);
  assert.equal(tokens.size,100);assert.ok(tokens.has('our'));assert.ok(tokens.has('we'));
  const result=await repository().request('/families?ai_filters='+encodeURIComponent(JSON.stringify({scope:'full',cpb100:true,sort:'az',limit:100})));
  assert.ok(result.matched_before_limit>52);
  assert.ok(result.families.every(row=>tokens.has(row.ai_match_form.toLowerCase().replace(/[’‘ʼ＇]/g,"'"))));
  const oldTokens=new Set((await repository().request('/filters')).common_word_register.tokens);
  assert.ok(result.families.some(row=>!oldTokens.has(row.ai_match_form.toLowerCase())));
});
test('fact filters keep exact-form evidence and have no hidden cap',()=>{
 const ctx={};vm.runInNewContext(read('text_workspace.js').toString(),ctx);
 const items=Array.from({length:12},(_,i)=>({occurrence_id:String(i),surface:'word'+i,occurrence_order:i,status:'RESOLVED',owners:[{baseword_key:'f'+i,display_family:'family'+i,current_hk_frequency_rank:2001,awl:1,msvl:'Science',matched_form_evidence:{awl:0,msvl:0,first_seen_hk_textbooks:i===11?'P5':null}}]}));
 const api=ctx.HKELE_TEXT_WORKSPACE;
 assert.equal(api.suggestions(items,new Set(),'P4').length,0);
 assert.equal(api.suggestions(items,new Set(),'P4',{filter:'all'}).length,12);
 assert.equal(api.suggestions(items,new Set(),'P4',{filter:'later'})[0].form,'word11');
 assert.equal(api.suggestions(items,new Set(),'P4',{filter:'academic'}).length,0);
});

test('CPB membership does not exclude a teacher-selected use',()=>{
 const ctx={};vm.runInNewContext(read('text_workspace.js').toString(),ctx);
 const item={occurrence_id:'the-0',surface:'the',status:'RESOLVED',owners:[{baseword_key:'the',display_family:'the',current_hk_frequency_rank:1,matched_form_evidence:{}}]};
 assert.equal(ctx.HKELE_TEXT_WORKSPACE.suggestions([item],new Set(['the']),null,{judgements:{'the-0':false}}).length,1);
});
