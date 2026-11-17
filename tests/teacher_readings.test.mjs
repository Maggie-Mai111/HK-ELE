import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
function resources(){
 const ctx=vm.createContext({window:{},location:{href:'https://fixture.invalid/'},URL,crypto:globalThis.crypto,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,fetch:async url=>new Response(new Uint8Array(readFileSync(join(root,String(url).split('?')[0]))))});
 for(const file of ['text_normalization.js','static_api.js'])vm.runInContext(readFileSync(join(root,file),'utf8'),ctx);
 return ctx.window.HKELE_STATIC_API;
}
const keys=r=>Array.from(r.owners,o=>o.baseword_key).sort();
async function resolve(api,text){const occurrences=[...text.matchAll(/[A-Za-z]+/g)].map((m,i)=>({occurrence_id:String(i),surface:m[0],normalized_token:m[0].toLowerCase(),start_offset:m.index,end_offset:m.index+m[0].length,occurrence_order:i,token_status:'SUPPORTED_TOKEN',failure_reason:null}));return (await api.request('/occurrences/resolve',{body:JSON.stringify({source:text,occurrences})})).occurrences;}

test('ordinary classroom has/a/wall resolve while original alternative readings and family forms remain',async()=>{
 const api=resources(),rows=await resolve(api,'Each cell has a wall.');
 for(const[word,key]of[['has','have'],['a','a'],['wall','wall']]){const r=rows.find(r=>r.surface===word);assert.equal(r.status,'RESOLVED');assert.deepEqual(keys(r),[key]);assert.equal(r.normalizedAnalysis.tokens[0].familyKey,key);assert.ok(r.alternatives.length);assert.ok((await api.request('/families/'+key)).forms.some(f=>f.normalized_form===word));}
});

test('explicit letters, noun plurals and quoted readings retain choices independently for repeated tokens',async()=>{
 const rows=await resolve(resources(),'It has a wall. The has were discussed. The letter a is printed. "wall" is quoted. Wall, I disagree.');
 for(const word of ['has','a','wall']){const pairs=rows.filter(r=>r.surface===word);assert.equal(pairs[0].status,'RESOLVED');assert.equal(pairs[1].status,'AMBIGUOUS');assert.equal(pairs[1].normalizedAnalysis.tokens[0].familyKey,null);}
 assert.equal(rows.find(r=>r.surface==='Wall').status,'AMBIGUOUS');
});

test('true ordinary ambiguity and normal variants/abbreviations keep their existing candidates',async()=>{
 const api=resources();for(const word of ['saw','does','in'])assert.equal((await api.request('/search?q='+word)).status,'AMBIGUOUS',word);
 for(const word of ['cell','programme','theatre','media']){const r=await api.request('/search?q='+word);assert.ok(r.owners.length);assert.ok(!r.alternatives.some(o=>o.match_classes.includes('SECONDARY_RECORDED_READING')),word);}
});


test('ordinary they and They use the accepted teacher family, retaining recorded alternatives',async()=>{
 const api=resources(),rows=await resolve(api,'They read the text. Later they play.');
 const pronouns=rows.filter(row=>row.surface.toLowerCase()==='they');
 assert.equal(pronouns.length,2);
 for(const row of pronouns){assert.equal(row.status,'RESOLVED');assert.deepEqual(keys(row),['they']);assert.equal(row.normalizedAnalysis.tokens[0].familyKey,'they');assert.ok(row.alternatives.some(owner=>owner.baseword_key==='it'));}
 assert.deepEqual(keys(await api.request('/search?q=they')),['they']);
});
