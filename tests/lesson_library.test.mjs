import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import "../lesson_contract.js";
import "../lesson_library.js";
import "../lesson_library_ui.js";
const api = globalThis.HKELE_LESSON_LIBRARY;
const legacyKey = "hkele-phase1v-teaching-list-v1";
const item = {baseword_key:"use", display_family:"use", selected_forms:["use","reusable"], order:2,
  notes:"Keep target meaning", connections:"reuse", depth:"Master", teaching_focus:"focus"};
test("mixed compound and family lessons keep saved notes, exact forms and separate export identities",()=>{
  const {hooks,context,disk}=harness();
  const expression={expressionId:"hc_test",displayExpression:"classroom",normalizedExpression:"classroom",sourceVersion:"compound-test"};
  const compound=context.HKELE_COMPOUND_TEACHING.createItem(expression,3,"2026-10-20-a-main-v1");
  compound.notes="Explain routines";
  hooks.state.selected=[structuredClone(item),compound];hooks.saveList();
  const reopened=api.create(disk).library.lessons[0].items;
  assert.equal(reopened[1].notes,"Explain routines");assert.equal(reopened[0].selected_forms[1],"reusable");
  const rows=hooks.lessonExportRows(),header=rows[0],row=rows.find(r=>r.includes("hc_test"));
  assert.ok(row);assert.equal(row[header.indexOf("Expression ID")],"hc_test");
  assert.equal(row[header.indexOf("Record type")],"Compound");
  assert.equal(row[header.indexOf("Word family")],"");
  assert.equal(row[header.indexOf("Family key")],"");
  assert.ok(row.includes("Explain routines"));
});
function storage(initial={}) {
  const values = new Map(Object.entries(initial));
  return {values, fail:false, getItem(key){return values.get(key) ?? null;},
    setItem(key,value){if(this.fail)throw new Error("quota"); values.set(key,value);}};
}
test("legacy list migrates without changing old keys, teacher fields, order or selected forms",()=>{
  const raw=JSON.stringify([item]); const disk=storage({[legacyKey]:raw,"hkele-lesson-title-v1":"P5 Science"});
  const store=api.create(disk), lib=store.library;
  assert.equal(lib.lessons[0].title,"P5 Science"); assert.deepEqual(lib.lessons[0].items,[item]);
  assert.equal(store.save(lib).ok,true);
  assert.equal(disk.getItem(legacyKey),raw); assert.equal(disk.getItem("hkele-lesson-title-v1"),"P5 Science");
  assert.deepEqual(api.create(disk).library,lib);
});
test("quota failure preserves original saved data and retries the same unsaved edits",()=>{
  const disk=storage({[legacyKey]:JSON.stringify([item])}), store=api.create(disk);
  assert.equal(store.save(store.library).ok,true); const before=disk.getItem(api.KEY);
  const changed=api.withCurrent(store.library,"Cells",[{...item,notes:"new note"}]);
  disk.fail=true; assert.deepEqual(store.save(changed),{ok:false,reason:"unavailable"});
  assert.equal(disk.getItem(api.KEY),before);
  disk.fail=false; assert.equal(store.save(changed).ok,true);
  assert.equal(api.create(disk).library.lessons[0].items[0].notes,"new note");
});
test("two lessons survive reopening; edits and export selection remain attached to the active lesson",()=>{
  const disk=storage(), store=api.create(disk);
  let lib=api.withCurrent(store.library,"First",[item]);
  const firstId=lib.activeId;
  lib=api.add(lib,"Second"); lib=api.withCurrent(lib,"Second",[{...item,baseword_key:"cell",selected_forms:["cell"],notes:"Biology"}]);
  assert.equal(store.save(lib).ok,true);
  const reopened=api.create(disk).library;
  assert.equal(reopened.lessons.find(x=>x.id===reopened.activeId).title,"Second");
  assert.deepEqual(reopened.lessons.find(x=>x.id===firstId).items,[item]);
  assert.equal(reopened.lessons[1].items[0].notes,"Biology");
});
test("another tab cannot overwrite a newer saved library",()=>{
  const disk=storage(), seed=api.create(disk); seed.save(seed.library);
  const first=api.create(disk), second=api.create(disk);
  first.save(api.withCurrent(first.library,"First tab",[item]));
  const newer=disk.getItem(api.KEY);
  assert.deepEqual(second.save(api.withCurrent(second.library,"Stale tab",[])),{ok:false,reason:"conflict"});
  assert.equal(disk.getItem(api.KEY),newer);
});
test("damaged saved or legacy data is never silently replaced with an empty lesson",()=>{
  for(const initial of [{[api.KEY]:"{broken"},{[legacyKey]:"not json"},{[api.KEY]:JSON.stringify({version:2})}]){
    const disk=storage(initial), before=[...disk.values], store=api.create(disk);
    assert.equal(store.problem,"invalid"); assert.equal(store.save(store.library).ok,false);
    assert.deepEqual([...disk.values],before);
  }
});
test("empty browse guidance distinguishes reviewed filters from Core and ordinary browsing",()=>{
  assert.match(api.emptyMessage(true,false),/filters/);
  assert.match(api.emptyMessage(false,true),/Full database/);
  assert.doesNotMatch(api.emptyMessage(false,false),/AI|controlled|filters/);
});

class Element {
  constructor(){this.listeners={};this.value="";this.hidden=false;this.disabled=false;this.textContent="";this.innerHTML="";this.classes=new Set();
    this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),contains:name=>this.classes.has(name)};}
  addEventListener(name,callback){this.listeners[name]=callback;}
  setAttribute(name,value){this[name]=value;}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  fire(name){return this.listeners[name]?.({target:this,preventDefault(){}});}
}
function harness() {
  const elements=new Map(), get=name=>{if(!elements.has(name))elements.set(name,new Element());return elements.get(name);};
  const disk=storage(), events={}; let requests=[];
  const context=vm.createContext({console,URLSearchParams,Set,Map,JSON,Date,Math,Boolean,Number,String,Object,
    localStorage:disk,document:{querySelector:get,querySelectorAll:()=>[]},
    addEventListener:(name,fn)=>events[name]=fn,confirm:()=>false,location:{hash:"",reload(){}},
    setTimeout:()=>{}, CustomEvent:class{},scrollY:0});
  context.window=context;
  for(const file of ["lesson_contract.js","lesson_library.js","lesson_library_ui.js","word_family_results.js","evidence_tokens.js","compound_teaching.js","compound_ui.js"])
    vm.runInContext(fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8"),context);
  context.HKELE_LESSON_WORKSPACE={create:()=>({renderList(){},renderPicker(){},rememberUndo(){}})};
  context.HKELE_TEXT_WORKSPACE={create:()=>({refreshSuggestions(){},resetLessonContext(){}})};
  context.HKELE_STATIC_API={request:()=>new Promise(resolve=>requests.push(resolve))};
  const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
  vm.runInContext(source.replace('  init().catch(error => toast("We couldn\'t complete that action. Please try again."));',
    'globalThis.hooks={state,saveList,exportItems,lessonExportRows,addToList,refreshSelectedFromDatabase,libraryUi};'),context);
  const hooks=context.hooks; hooks.libraryUi.bind(); hooks.saveList();
  return {context,hooks,get,disk,events,requests};
}
test("real UI handlers switch/new/reopen lessons without copying words or clearing the checked passage",()=>{
  const h=harness(), {hooks,get,disk}=h;
  hooks.state.selected=[structuredClone(item)]; hooks.state.lessonTitle="First";hooks.saveList();
  const first=hooks.state.library.activeId; hooks.state.checkedText="Keep this passage";
  get("#new-lesson").fire("click"); get("#new-lesson-name").value="Second";get("#new-lesson-form").fire("submit");
  assert.equal(hooks.state.lessonTitle,"Second");assert.equal(hooks.state.selected.length,0);
  hooks.state.selected=[{...item,baseword_key:"cell",selected_forms:["cell"],notes:"Biology"}];hooks.saveList();
  assert.equal(hooks.exportItems()[0].lesson_title,"Second");
  assert.equal(hooks.lessonExportRows().length,2);assert.equal(hooks.lessonExportRows()[1][2],"cell");
  get("#active-lesson").value=first;get("#active-lesson").fire("change");
  assert.equal(hooks.state.lessonTitle,"First");assert.equal(hooks.state.selected[0].notes,item.notes);
  assert.equal(hooks.state.checkedText,"Keep this passage");
  assert.equal(hooks.lessonExportRows().length,3);
  assert.equal(api.create(disk).library.activeId,first);
});
test("save failure stays visible after adding and blocks switching; retry saves the draft",()=>{
  const {hooks,get,disk,events}=harness();
  disk.fail=true;
  hooks.addToList({baseword_key:"cell",display_family:"cell"},"cell");
  assert.match(get("#lesson-save-message").textContent,/not been saved/);
  assert.equal(get("#lesson-save-state").role,"alert");
  assert.equal(get("#active-lesson").disabled,true);assert.equal(get("#retry-lesson-save").hidden,false);
  let prevented=false; events.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  disk.fail=false; get("#retry-lesson-save").fire("click");
  assert.equal(get("#active-lesson").disabled,false);
  assert.equal(api.create(disk).library.lessons[0].items[0].selected_forms[0],"cell");
  prevented=false; events.beforeunload({preventDefault(){prevented=true;}}); assert.equal(prevented,false);
});
test("slow evidence refresh cannot replace a newer note or a different lesson",async()=>{
  const {hooks,requests}=harness();
  hooks.state.selected=[structuredClone(item)];hooks.saveList();
  const pending=hooks.refreshSelectedFromDatabase();
  hooks.state.selected[0].notes="Edited while loading";hooks.saveList();
  requests.shift()({family:{display_family:"use"}});await pending;
  assert.equal(hooks.state.selected[0].notes,"Edited while loading");
});
test("each selected form is a separate information button outside the collapsed editor",()=>{
  const {context,hooks,get}=harness();
  vm.runInContext(fs.readFileSync(new URL("../lesson_workspace.js",import.meta.url),"utf8"),context);
  hooks.state.selected=[structuredClone(item)]; const opened=[]; let formButtons=[];
  const row={dataset:{listKey:"use"},querySelector:()=>new Element(),querySelectorAll:selector=>selector==="[data-open-form]"?formButtons:[]};
  const $$=selector=>{
    if(selector!=="#list-body [data-list-key]")return [];
    const html=get("#list-body").innerHTML;
    formButtons=[...html.matchAll(/data-open-form="([^"]+)"/g)].map(match=>{const node=new Element();node.dataset={openForm:match[1]};return node;});
    assert.ok(html.indexOf('class="lesson-card-preview"')<html.indexOf('data-open-form'));
    return [row];
  };
  const workspace=context.HKELE_LESSON_WORKSPACE.create({state:hooks.state,$:get,$$,esc:String,saveList:()=>true,
    updateListCount(){},openFamily:(key,form)=>opened.push([key,form])});
  workspace.renderList();
  assert.equal(formButtons.length,2);formButtons[0].fire("click");formButtons[1].fire("click");
  assert.deepEqual(opened,[["use","use"],["use","reusable"]]);
});
