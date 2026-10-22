import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),teaching=require('../compound_teaching.js');
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root));
const config=JSON.parse(read('data/compounds/2026-10-22-a-main-closed-v1/manifest.json'));
const compound=word=>JSON.parse(gunzipSync(read(`data/compounds/2026-10-22-a-main-closed-v1/${word[0]}.json.gz`)))[word];
test('compound manifest survives Git CRLF conversion with the same content identity',async()=>{
 const {createLoader}=require('../compound_data.js');
 const lf=JSON.stringify(config,null,2)+'\n',digest=createHash('sha256').update(lf).digest('hex');
 const release={dataVersion:config.productDataVersion,expressionVersion:config.expressionDataVersion,manifestSha256:digest};
 const loader=createLoader(release,{read:async name=>new Uint8Array(name==='manifest.json'?Buffer.from(lf.replace(/\n/g,'\r\n')):read(`data/compounds/${config.expressionDataVersion}/${name}`))});
 assert.equal((await loader.lookup('classroom')).normalizedExpression,'classroom');
 const corrupt=createLoader(release,{read:async()=>new Uint8Array(Buffer.from(lf.replace('57881','57880')))});
 await assert.rejects(corrupt.lookup('classroom'),/changed/);
});
function product({corrupt=false}={}){
 let corruptOnce=corrupt;
 const context=vm.createContext({URL,crypto:globalThis.crypto,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,
   location:{href:'https://fixture.invalid/'},fetch:async file=>{
     let bytes=read(file);
     if(corruptOnce && file.endsWith('/c.json.gz') && file.includes('/compounds/')){corruptOnce=false;bytes=Buffer.from(bytes);bytes[10]^=1;}
     return new Response(new Uint8Array(bytes));
   }});
 context.window=context;
 for(const file of ['compound_release.js','compound_data.js','static_api.js','tokenizer.js'])vm.runInContext(read(file).toString('utf8'),context);
 return context;
}
test('recorded closed compounds are returned independently, without invented family owners or grades',async()=>{
 const p=product();
 for(const word of ['classroom','classmates','homework','everyone','something']){
   const result=await p.HKELE_STATIC_API.request('/search?q='+word);
   assert.equal(result.status,'REGISTERED_EXPRESSION');assert.equal(result.owners.length,0);
   assert.equal(result.expression.normalizedExpression,word);assert.equal(result.expression.kind,'COMPOUND');
   assert.equal(result.expression.sourceVersion,config.expressionDataVersion);
   assert.ok(!('candidate_member' in result.expression));assert.ok(!('overall_frequency_order' in result.expression));
 }
 const result=await p.HKELE_STATIC_API.request('/search?q=classroom');
 assert.deepEqual(Array.from(result.expression.parts,p=>p.form),['class','room']);
 assert.deepEqual(Array.from(result.expression.parts,p=>p.familyKey),['class','room']);
});
test('compound lookup is exact and does not manufacture hyphenated, spaced or inflected forms',async()=>{
 const p=product();
 for(const word of ['class-room','school bus','classroomzzzz'])assert.equal(await p.HKELE_COMPOUNDS.lookup(word),null);
 assert.equal((await p.HKELE_COMPOUNDS.lookup('CLASSROOM')).normalizedExpression,'classroom');
 await assert.rejects(p.HKELE_COMPOUNDS.lookup('classroom','wrong-data'),/another wordlist/);
});
test('passage matching preserves source offsets and counts each occurrence once, including overlapping family facts',async()=>{
 const p=product(),text='Classroom homework football classroom does classroomzzzz.';
 const tokens=p.HKELE_TOKENIZER.tokenize(text,500);
 const result=await p.HKELE_STATIC_API.request('/occurrences/resolve',{body:JSON.stringify({occurrences:tokens})});
 assert.equal(result.occurrences.length,tokens.length);
 assert.equal(new Set(Array.from(result.occurrences,x=>x.occurrence_id)).size,tokens.length);
 for(const item of result.occurrences)assert.equal(text.slice(item.start_offset,item.end_offset),item.surface);
 assert.equal(result.occurrences.filter(x=>x.expression?.normalizedExpression==='classroom').length,2);
 assert.equal(result.occurrences.find(x=>x.surface==='does').status,'BLOCKED');
 assert.equal(result.occurrences.find(x=>x.surface==='classroomzzzz').status,'UNMATCHED');
 const football=result.occurrences.find(x=>x.surface==='football');assert.ok(football.expression);
 if(football.owners.length)assert.equal(football.status,'RESOLVED');
 const overlap=await p.HKELE_STATIC_API.request('/search?q=coinsured');
 assert.equal(overlap.status,'RESOLVED');assert.ok(overlap.expression);
 assert.ok(overlap.owners.some(owner=>owner.baseword_key==='coinsure'));
 const manifest=await p.HKELE_STATIC_API.manifest();
 assert.equal(manifest.browse.full.overall.available_items,163906);assert.equal(manifest.browse.core.overall.available_items,2871);
});
test('a corrupt compound shard cannot produce a match and can be retried without losing ordinary lookup',async()=>{
 const p=product({corrupt:true});
 const failed=await p.HKELE_STATIC_API.request('/search?q=classroom');assert.equal(failed.status,'UNMATCHED');assert.equal(failed.expression_layer_status,'UNAVAILABLE');
 const retry=await p.HKELE_STATIC_API.request('/search?q=classroom');assert.equal(retry.status,'REGISTERED_EXPRESSION');
 assert.equal((await p.HKELE_STATIC_API.request('/search?q=school')).owners.length,1);
});
test('compound lesson identities survive serialization and refresh without acquiring a family rank',()=>{
 const expression=compound('classroom');
 const item={...teaching.createItem(expression,3,'2026-10-20-a-main-v1','Check a text'),notes:'Target classroom sense',connections:'My lesson example',teaching_focus:'focus'};
 const reopened=JSON.parse(JSON.stringify(item));const updated=teaching.refresh(reopened,expression);
 assert.equal(updated.baseword_key,'expression:'+expression.expressionId);assert.equal(updated.order,3);assert.equal(updated.notes,item.notes);
 assert.equal(updated.overall_frequency_order,null);assert.equal(updated.hk_corpus_frequency_rank,null);
 const retained=teaching.refresh(updated,null);assert.equal(retained.notes,item.notes);assert.equal(retained.expression.expressionId,expression.expressionId);assert.match(retained.data_review_status,/kept/);
});
test('compound feedback prefill carries an expression identity and does not invent a family',()=>{
 const feedback=require('../feedback_contract.js'),expression=compound('classroom');
 const cfg=JSON.parse(read('feedback_forms.json'));
 const ctx={product:'Web',page:'Check a text',word:expression.displayExpression,expressionId:expression.expressionId,expressionVersion:expression.sourceVersion};
 const url=feedback.buildFeedbackUrl('rating',ctx,cfg);assert.ok(url);
 const reference=feedback.feedbackValues(ctx,cfg).reference;
 assert.match(reference,/Record type: Compound/);assert.match(reference,/Expression ID:/);assert.ok(!reference.includes('Family key:'));
});
