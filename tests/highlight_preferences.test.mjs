import test from 'node:test';
import assert from 'node:assert/strict';
import '../text_workspace.js';
const {readHighlights,rememberHighlights}=globalThis.HKELE_TEXT_WORKSPACE;
const key='hkele.web.reader-display.v1';
test('first-use display shows rank colour without marking teaching choices',()=>{
  const writes=[];
  assert.deepEqual(readHighlights({getItem:()=>null,setItem:(...args)=>writes.push(args)}),{common:false,hk:true});
  assert.deepEqual(writes,[]);
});
test('Plain text and each optional mark persist across reloads',()=>{
  const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  for(const [common,hk] of [[false,false],[true,false],[true,true],[false,true]]){
    rememberHighlights(storage,common,hk);assert.deepEqual(readHighlights(storage),{common,hk});
  }
});
test('invalid or unavailable display storage keeps text checking usable',()=>{
  for(const raw of ['{','null','[]','{"common":"false","hk":true}','{"common":false}'])
    assert.deepEqual(readHighlights({getItem:()=>raw}),{common:false,hk:true});
  const unavailable={getItem(){throw Error('denied');},setItem(){throw Error('full');}};
  assert.deepEqual(readHighlights(unavailable),{common:false,hk:true});
  assert.doesNotThrow(()=>rememberHighlights(unavailable,true,true));
});
test('display settings only write their own key, preserving teacher records and consent',()=>{
  const values=new Map([['saved-words','stressed: note'],['consent','existing'],['hkele.web.first-visit-guide.v1','done']]);
  rememberHighlights({setItem:(k,v)=>values.set(k,v)},false,false);
  values.delete(key);
  assert.deepEqual([...values],[['saved-words','stressed: note'],['consent','existing'],['hkele.web.first-visit-guide.v1','done']]);
});
