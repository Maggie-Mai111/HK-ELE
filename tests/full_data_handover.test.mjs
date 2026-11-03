import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),base='data/releases/2026-11-03-a2658-finite-family-closure-v1/';
const read=p=>readFileSync(new URL(p,root));
function api(){const ctx={window:{},location:{href:'http://fixture.invalid/'},URL,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,crypto:globalThis.crypto,fetch:async path=>new Response(new Uint8Array(read(path)))};vm.runInNewContext(read('static_api.js').toString(),ctx);return ctx.window.HKELE_STATIC_API;}
test('opaque identity keys keep their exact case instead of becoming another family',async()=>{
 const key='final20261102:d:Latin-letter-name',r=await api().request('/families/'+encodeURIComponent(key));
 assert.equal(r.family.baseword_key,key);assert.notEqual(r.family.baseword_key,'d');
});
test('limited-only readings stay queryable but never become an ordinary passage owner',async()=>{
 const shard=JSON.parse(gunzipSync(read(base+'search/a.json.gz'))),word=Object.keys(shard).find(k=>shard[k][0]===10);assert.ok(word);
 const repo=api(),lookup=await repo.request('/search?q='+encodeURIComponent(word));assert.ok(lookup.owners.length);
 const result=await repo.request('/occurrences/resolve',{body:JSON.stringify({occurrences:[{occurrence_id:'x',surface:word,normalized_token:word,start_offset:0,end_offset:word.length,occurrence_order:0,token_status:'SUPPORTED_TOKEN'}]})});
 assert.equal(result.occurrences[0].status,'UNMATCHED');assert.equal(result.occurrences[0].owners.length,0);assert.ok(result.occurrences[0].alternatives.length);
});
test('word-list membership and counts use the new generation; exact spelling keeps its own grade',async()=>{
 const repo=api(),m=await repo.manifest();assert.equal(m.metadata.data_version,'2026-11-03-a2658-finite-family-closure-v1');assert.equal(m.browse.core.overall.total_items,2658);assert.equal(m.browse.full.overall.total_items,167630);
 const {forms}=await repo.request('/families/stress');assert.equal(forms.find(f=>f.form==='stressed').external_level_reference,'Grade 6');assert.equal(forms.find(f=>f.form==='stressful').external_level_reference,'Grades 8–9');
});

test('structured lexical scopes preserve exact meanings as readable text',()=>{
 const ctx={};vm.runInNewContext(read('lexical_uses.js').toString(),ctx);
 assert.equal(ctx.HKELE_LEXICAL_USES.summary({channel:'default',condition:'Chief-reviewed canonical endpoint and source-token allocation.'}),'');
 assert.equal(ctx.HKELE_LEXICAL_USES.summary({channel:'limited',condition:'Existing accepted source identity; prior constraints apply.'}),'Special use — check the meaning in your text.');
 assert.equal(ctx.HKELE_LEXICAL_USES.summary({channel:'default',condition:JSON.stringify({exact_target_readings:[{glosses:['An identity matrix.']}]})}),'An identity matrix.');
 assert.ok(!read('app.js').toString().includes('Historical General frequency'));
 const condition=JSON.stringify({defined_scope:{only_exact_source_denotation:'obsolete spelling of party',compatible_canonical_application:['A person.'],boundary:'internal relation rule'}});
 assert.equal(ctx.HKELE_LEXICAL_USES.summary({condition}),'obsolete spelling of party A person.');
 assert.equal(ctx.HKELE_LEXICAL_USES.summary({condition:JSON.stringify({defined_scope:[{glosses:['A distance unit.']}]})}),'A distance unit.');
});
