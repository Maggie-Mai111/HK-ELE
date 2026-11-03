import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const {createLoader,select}=createRequire(import.meta.url)('../word_origins.js');
const root=new URL('../',import.meta.url), context={};
vm.runInNewContext(readFileSync(new URL('word_origins_release.js',root),'utf8'),context);
const release=context.HKELE_WORD_ORIGINS_RELEASE;
const read=async name=>new Uint8Array(readFileSync(new URL(`data/word-origins/${release.version}/${name}`,root)));
const hash=async b=>createHash('sha256').update(b).digest('hex');
const inflate=async b=>gunzipSync(b).toString('utf8');
const loader=createLoader(release,{read,hash,inflate});
let all;
function records(){return all??=Object.keys(release.files).flatMap(n=>Object.values(JSON.parse(gunzipSync(readFileSync(new URL(`data/word-origins/${release.version}/${n}`,root))).toString()).records));}
const find=w=>records().find(r=>r.normalizedForm===w);
test('exact accepted form keeps each original language / etymon / meaning, including Greek',async()=>{
 const r=find('telephone');assert.ok(r);
 assert.deepEqual((await loader.lookup(r.familyKey,'telephone',release.dataVersion)).origins,[
  {slot:1,language:'Greek',form:'τηλε',meaning:'afar'},
  {slot:2,language:'Greek',form:'φωνη',meaning:'voice, sound'},
 ]);
 const s=find('spectator');assert.equal((await loader.lookup(s.familyKey,'spectator')).origins[0].form,'spectator');
});
test('second-only slot stays paired; no inherited family origin or other family attachment',async()=>{
 const r=find('school'),record=await loader.lookup(r.familyKey,'school');
 assert.equal(record.origins.length,1);assert.equal(record.origins[0].slot,2);assert.equal(record.origins[0].language,'Greek');
 assert.equal(await loader.lookup(r.familyKey,'book'),null);
 assert.equal(await loader.lookup('wrong-family','school'),null);
 assert.equal(await loader.lookup(r.familyKey,'school','old-data'),null);
});
test('corrupt bytes, mismatched generation and mismatched record are rejected',async()=>{
 const r=find('school');const broken=createLoader(release,{read:async()=>new Uint8Array([1,2]),hash,inflate});
 await assert.rejects(broken.lookup(r.familyKey,'school'));
 const shard={schema:'hkele-word-origins/1',version:'old',dataVersion:release.dataVersion,records:{}};
 assert.throws(()=>select(shard,'x','x',release));shard.version=release.version;shard.records['x\tx']={...r};
 assert.throws(()=>select(shard,'x','x',release));
});
test('all published sidecar bytes match the pinned release and contain no alternate base or root replacement',async()=>{
 let n=0;
 for(const name of Object.keys(release.files)){
  const b=await read(name);assert.equal(b.length,release.files[name].bytes);assert.equal(await hash(b),release.files[name].sha256);
  const shard=JSON.parse(await inflate(b));
  for(const r of Object.values(shard.records)){assert.equal(select(shard,r.familyKey,r.normalizedForm,release),r);assert.deepEqual(Object.keys(r).sort(),['familyKey','normalizedForm','origins','sourceWords']);n++;}
 }
 assert.equal(n,116283);
});
