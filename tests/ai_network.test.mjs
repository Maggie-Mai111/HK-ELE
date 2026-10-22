import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const contract=require('../ai_filter_contract.js');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/package85_package87_ai_filter_cases.json',import.meta.url),'utf8')).cases.find(x=>x.response.status==='ready');
const script=readFileSync(new URL('../ai_filter.js',import.meta.url),'utf8');
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(setImmediate);};
class Element {
  hidden=true;disabled=false;value='';textContent='';innerHTML='';dataset={};
  children=new Map();listeners=new Map();attributes=new Map([['aria-expanded','false']]);
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  querySelectorAll(){return [];}
  addEventListener(key,fn){this.listeners.set(key,fn);}
  setAttribute(key,value){this.attributes.set(key,value);}
  getAttribute(key){return this.attributes.get(key);}
  insertAdjacentHTML(_position,text){this.innerHTML+=text;}
  focus(){} scrollIntoView(){}
  click(){assert.equal(this.disabled,false);this.listeners.get('click')?.();}
}
function setup(online,fetchImpl){
  const panel=new Element(),other=new Element(),listeners=new Map(),navigator={onLine:online};
  let verifications=0,calls=0;
  const window={
    HKELE_AI_PUBLIC_CONFIG:{configured:true,fixtureMode:false,endpoint:'https://example.test/api/ai/interpret-filter',turnstileSiteKey:'public-test',requestTimeoutMs:12000},
    HKELE_AI_FILTER_CONTRACT:contract,
    addEventListener:(key,fn)=>listeners.set(key,fn),
    turnstile:{render(_host,options){verifications++;options.callback('fresh-token');return 'widget-'+verifications;},remove(){},reset(){}},
  };
  vm.runInNewContext(script,{
    window,navigator,AbortController,
    document:{querySelector:key=>key==='#ai-filter-panel'?panel:key==='.scope.active'?{dataset:{scope:'full'}}:other.querySelector(key)},
    setTimeout:()=>1,clearTimeout(){},
    crypto:{randomUUID:()=> '12345678-1234-4234-9234-123456789012'},sessionStorage:{getItem:()=>null,setItem(){}},
    fetch:async (...args)=>{calls++;return fetchImpl(...args);},
  });
  return {panel,get calls(){return calls;},get verifications(){return verifications;},
    async connected(value){navigator.onLine=value;listeners.get(value?'online':'offline')();await flush();},
    async open(){panel.querySelector('#ai-filter-toggle').click();await flush();},
    async draft(){const input=panel.querySelector('#ai-filter-query');input.value=fixture.query;input.listeners.get('input')();await flush();},
  };
}
const response=()=>({ok:true,json:async()=>fixture.response});
test('one AI entry remains offline, keeps the draft, and reconnects without automatically submitting',async()=>{
  const app=setup(false,async()=>response());await app.open();await app.draft();
  assert.equal(app.panel.hidden,false);
  assert.equal(app.panel.querySelector('#ai-network-note').hidden,false);
  assert.equal(app.panel.querySelector('#ai-filter-query').disabled,false);
  assert.equal(app.panel.querySelector('#ai-filter-preview-button').disabled,true);
  assert.equal(app.verifications,0);assert.equal(app.calls,0);
  await app.connected(true);
  assert.equal(app.panel.querySelector('#ai-network-note').hidden,true);
  assert.equal(app.panel.querySelector('#ai-filter-query').value,fixture.query);
  assert.equal(app.calls,0);assert.equal(app.verifications,1);
  app.panel.querySelector('#ai-filter-preview-button').click();await flush();
  assert.equal(app.calls,1);assert.equal(app.panel.querySelector('#ai-filter-preview').hidden,false);
  await app.connected(false);
  assert.equal(app.panel.querySelector('#ai-filter-preview').hidden,false,'An interpreted result is retained');
  assert.equal(app.panel.querySelector('#ai-filter-confirm-button').disabled,false,'Local application remains available');
});
test('disconnect during an AI request cancels it, retains input and permits a deliberate retry',async()=>{
  let first=true;
  const app=setup(true,async(_url,options)=>{
    if(!first)return response();first=false;
    return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  });
  await app.open();await app.draft();app.panel.querySelector('#ai-filter-preview-button').click();await flush();
  assert.equal(app.calls,1);await app.connected(false);
  assert.equal(app.panel.querySelector('#ai-network-note').hidden,false);
  assert.equal(app.panel.querySelector('#ai-filter-message').textContent,'');
  assert.equal(app.panel.querySelector('#ai-filter-query').value,fixture.query);
  await app.connected(true);assert.equal(app.calls,1);
  app.panel.querySelector('#ai-filter-preview-button').click();await flush();
  assert.equal(app.calls,2);assert.equal(app.panel.querySelector('#ai-filter-preview').hidden,false);
});
test('online HTTP errors retain the ordinary retry message rather than an offline claim',async()=>{
  const app=setup(true,async()=>({ok:false,status:403}));await app.open();await app.draft();
  app.panel.querySelector('#ai-filter-preview-button').click();await flush();
  assert.equal(app.panel.querySelector('#ai-network-note').hidden,true);
  assert.match(app.panel.querySelector('#ai-filter-message').textContent,/couldn't complete/);
});
