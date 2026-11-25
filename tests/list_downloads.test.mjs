import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFileSync}from'node:fs';
const c={};vm.runInNewContext(readFileSync(new URL('../list_downloads.js',import.meta.url),'utf8'),c);const api=c.HKELE_LIST_DOWNLOAD;
const exports=Object.fromEntries(['all-90','all-95','familiar-90','familiar-95'].map(key=>[key,{filename:key+'.xlsx',assetPath:key,byteSize:3,sha256:'abc'}]));const release={dataVersion:'current',exports};
function fixture(overrides={}){
 const button={hidden:false,disabled:false,textContent:'',setAttribute(){},addEventListener(){}};const status={hidden:true};let view='all';const saved=[];
 const ui=api.create({button,status,getView:()=>view,getRelease:()=>release,getDataVersion:async()=>'current',fetchFile:async()=>new Uint8Array([1,2,3]).buffer,digest:async()=>'abc',save:(bytes,name)=>saved.push(name),...overrides});
 return{...ui,button,status,saved,setView:v=>view=v};
}
test('download follows sealed view and list, independently of search results',async()=>{
 const f=fixture();assert.equal(f.button.hidden,true);
 for(const view of ['all','familiar'])for(const scope of ['core','core95']){f.setView(view);f.refresh(scope);assert.equal(f.button.hidden,false);await f.download();assert.equal(f.saved.at(-1),`${view}-${scope==='core'?'90':'95'}.xlsx`);}
 f.refresh('full');assert.equal(f.button.hidden,true);
});
test('wrong release or corrupted workbook is never saved',async()=>{
 for(const overrides of [{getDataVersion:async()=>'old'},{digest:async()=>'bad'},{fetchFile:async()=>new ArrayBuffer(0)}]){const f=fixture(overrides);f.refresh('core');await f.download();assert.equal(f.saved.length,0);assert.equal(f.status.hidden,false);assert.equal(f.button.disabled,false);}
});
test('changing the list during download cancels the earlier selection',async()=>{
 let done;const gate=new Promise(resolve=>done=resolve);const f=fixture({fetchFile:async()=>{await gate;return new Uint8Array([1,2,3]).buffer;}});
 f.refresh('core');const pending=f.download();f.setView('familiar');f.refresh('core95');done();await pending;assert.equal(f.saved.length,0);assert.match(f.button.textContent,/95%/);await f.download();assert.equal(f.saved.at(-1),'familiar-95.xlsx');
});
