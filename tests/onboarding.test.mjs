import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),sandbox={};sandbox.globalThis=sandbox;
vm.runInNewContext(readFileSync(new URL('onboarding_contract.js',root),'utf8'),sandbox);
const guide=sandbox.HKELE_ONBOARDING_CONTRACT;
const fresh=()=>({ready:true,view:'home',hasSavedWords:false,hasSelectedWords:false,hasDraft:false,hasCheckedText:false});
const memory=initial=>{const values=new Map(Object.entries(initial||{}));return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};

test('new invitation waits for consent and real application readiness without interrupting another page',()=>{
 const choice=guide.storageState(memory());
 assert.equal(guide.offer(fresh(),choice,false),true);
 for(const patch of [{ready:false},{view:'check'},{view:'browse'},{hasSavedWords:true},{hasDraft:true},{hasCheckedText:true}])assert.equal(guide.offer({...fresh(),...patch},choice,false),false);
 assert.equal(guide.offer(fresh(),choice,true),false);
});
test('dismissed guides and existing users retain replay but are not invited automatically again',()=>{
 const storage=memory(),choice=guide.storageState(storage);choice.remember();
 assert.equal(guide.offer(fresh(),choice,false),false);
 assert.equal(guide.offer(fresh(),guide.storageState(storage),false),false);
 const returning=guide.storageState(memory({'hkele.web.local-preview.privacy.v1':'existing consent'}));
 assert.equal(guide.offer(fresh(),returning,false),false);
 assert.equal(guide.start(fresh()).useExample,true);
});
test('example planning preserves teacher input and an already checked passage',()=>{
 assert.equal(guide.start(fresh()).useExample,true);
 for(const patch of [{hasDraft:true},{hasCheckedText:true},{hasDraft:true,hasCheckedText:true}])assert.equal(guide.start({...fresh(),...patch}).useExample,false);
 assert.equal(guide.start({...fresh(),hasCheckedText:true}).step,'explore');
 assert.equal(guide.start({...fresh(),hasDraft:true}).step,'check');
});
test('stages follow actual successful results, a passage word and the active saved list',()=>{
 assert.equal(guide.advance('check',{...fresh(),view:'check',hasCheckedText:false}),'check');
 assert.equal(guide.advance('check',{...fresh(),view:'check',hasCheckedText:true}),'explore');
 assert.equal(guide.advance('explore',{...fresh(),view:'word',wordFromText:true}),'choose');
 assert.equal(guide.advance('explore',{...fresh(),view:'word',wordFromText:false}),null);
 assert.equal(guide.advance('choose',{...fresh(),view:'list',hasSavedWords:true,hasSelectedWords:false}),null);
 assert.equal(guide.advance('choose',{...fresh(),view:'list',hasSelectedWords:true}),'saved');
 assert.equal(guide.advance('choose',{...fresh(),view:'browse'}),null);
});
test('remembering the invitation writes only its own flag and retains consent, selected forms and notes',()=>{
 const original={'hkele-web-lessons-v1':'{"selected_forms":["stresslessness"],"notes":"keep me"}','hkele.web.local-preview.privacy.v1':'existing consent'};
 const storage=memory(original);guide.storageState(storage).remember();
 for(const [key,value] of Object.entries(original))assert.equal(storage.getItem(key),value);
 assert.equal(storage.values.size,3);assert.equal(storage.getItem(guide.KEY),'seen');
});
test('denied browser storage leaves replay usable and remembers dismissal for this page',()=>{
 const choice=guide.storageState({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});
 assert.doesNotThrow(()=>choice.remember());assert.equal(choice.seen(),true);
 assert.equal(guide.start(fresh()).useExample,true);
});
