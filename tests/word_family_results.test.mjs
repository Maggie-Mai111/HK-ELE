import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import '../word_family_results.js';
import '../evidence_tokens.js';
import '../lesson_contract.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = globalThis.HKELE_WORD_FAMILY_RESULTS;
const app = readFileSync(join(root, 'app.js'), 'utf8');
function resources(options = {}) {
  let failure = options.failure;
  const context = vm.createContext({window:{}, location:{href:'https://fixture.invalid/'}, URL,
    crypto:globalThis.crypto, TextEncoder, TextDecoder, Blob, Response, DecompressionStream,
    fetch:async path => {
      if (failure && path.endsWith(failure)) {failure = ''; return new Response('try again', {status:503});}
      let bytes = readFileSync(join(root, path));
      if (options.crlf && path.endsWith('/manifest.json')) bytes = Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n'));
      if (options.corrupt && path.includes('/word-forms/') && path.endsWith('.gz')) {
        bytes = Buffer.from(bytes); bytes[bytes.length - 1] ^= 1;
      }
      return new Response(new Uint8Array(bytes));
    }});
  for (const file of ['static_api.js', 'word_family_results.js']) vm.runInContext(readFileSync(join(root, file), 'utf8'), context);
  return {api:context.window.HKELE_STATIC_API, reader:context.HKELE_WORD_FAMILY_RESULTS.createReader()};
}
const names = rows => Array.from(rows, row => row.form.form);
test('searched form stays first under every sort; absent frequencies stay last and do not become zero', () => {
  const forms = ['use','reusable','unrecorded','reuse','zero'].map(form => ({form, normalized_form:form}));
  const counts = {use:[1000,2000], reusable:[null,1], reuse:[10,10], zero:[0,0]};
  assert.deepEqual(names(results.sortedForms(forms, 'REUSABLE', counts)), ['reusable','use','reuse','zero','unrecorded']);
  assert.deepEqual(names(results.sortedForms(forms, 'reusable', counts, 'frequency-asc')), ['reusable','zero','reuse','use','unrecorded']);
  assert.deepEqual(names(results.sortedForms(forms, 'reusable', counts, 'az')), ['reusable','reuse','unrecorded','use','zero']);
  assert.deepEqual(names(results.sortedForms(forms, 'reusable', counts, 'za')), ['reusable','zero','use','unrecorded','reuse']);
  assert.equal(results.frequency([null,null]), null);
  assert.equal(results.frequency([0,null]), 0);
  assert.deepEqual(forms.map(f => f.form), ['use','reusable','unrecorded','reuse','zero']);
});
test('real A family lists preserve all accepted forms and bind each grade to its form', async () => {
  const {api, reader} = resources();
  for (const query of ['reusable','beingness','cell']) {
    const search = await api.request('/search?q='+query);
    for (const owner of search.owners.filter(o => !o.blocked)) {
      const detail = await api.request('/families/'+owner.baseword_key), counts = await reader.load(owner.baseword_key);
      const sorted = results.sortedForms(detail.forms, query, counts);
      assert.equal(sorted.length, detail.forms.length);
      assert.deepEqual(new Set(names(sorted)), new Set(Array.from(detail.forms, f => f.form)));
      assert.equal(sorted[0].form.normalized_form, query);
      const rest = sorted.slice(1).filter(r => r.frequency !== null);
      assert.ok(rest.every((r, index) => index === 0 || rest[index-1].frequency >= r.frequency));
    }
  }
  const {forms} = await api.request('/families/be');
  assert.equal(forms.find(f => f.form === 'be').external_level_reference, 'Kindergarten–Grade 1');
  assert.equal(forms.find(f => f.form === 'beingness').external_level_reference, 'Grades 10–11');
  const use = await reader.load('use');
  assert.ok(results.frequency(use.use) > results.frequency(use.reusable));
});
test('frequency reader survives Git CRLF conversion, rejects altered gzip, and retries failed loads', async () => {
  assert.ok(Object.keys(await resources({crlf:true}).reader.load('be')).length > 0);
  await assert.rejects(resources({corrupt:true}).reader.load('be'), /reload/);
  const retry = resources({failure:'/manifest.json'}).reader;
  await assert.rejects(retry.load('be'), /could not/);
  assert.ok(Object.keys(await retry.load('be')).length > 0);
});

// Execute the actual event workflow with a small DOM boundary; no browser-layout claim.
function workflow(api, reader) {
  const input = {value:'reusable'};
  const state = {scope:'full', view:'browse', familySearch:null};
  let clears = 0, renders = 0;
  const context = vm.createContext({state, Map, encodeURIComponent,
    familyFrequency:reader, searchGate:results.createRequestGate(), detailRequest:0,
    $:selector => selector === '#browse-search' ? input : {focus(){}},
    json:path => api.request(path),
    renderFamilySearch:() => renders++, syncBrowseControls:() => {},
    clearFamilySearch:() => {clears++; state.familySearch=null;}, identityNote:() => 'Check the sentence.',
    openFamily:() => {throw new Error('Search must not open a detail page.');}});
  vm.runInContext(app.slice(app.indexOf('  async function searchWordFamily('), app.indexOf('  window.HKELE_BROWSE_ADAPTER')), context);
  return {state, input, context, search:sort => context.searchWordFamily(sort), clears:() => clears, renders:() => renders};
}
test('search returns the whole family without opening details; Core miss keeps the Full route', async () => {
  const source = resources(), flow = workflow(source.api, source.reader);
  await flow.search();
  assert.equal(flow.state.familySearch.groups[0].family.baseword_key, 'use');
  assert.ok(flow.state.familySearch.groups[0].forms.length > 10);
  assert.equal(flow.state.familySearch.sort, 'frequency-desc');
  flow.state.scope='core'; flow.input.value='fabric'; await flow.search();
  assert.equal(flow.state.familySearch.outsideCore, true);
  assert.equal(flow.state.familySearch.groups.length, 0);
  flow.state.scope='full'; await flow.search();
  assert.equal(flow.state.familySearch.groups[0].family.baseword_key, 'fabric');
});
test('equal-best homonym owners are separate groups, without changing their accepted forms', async () => {
  const source = resources();
  // Discover an existing equal-best ambiguity within the registered A search shard.
  const {gunzipSync} = await import('node:zlib');
  const shard = JSON.parse(gunzipSync(readFileSync(join(root, 'data/releases/2026-10-20-a-main-v1/search/a.json.gz'))));
  const query = Object.keys(shard).find(key => shard[key][1]?.length > 1);
  assert.ok(query);
  const expected = (await source.api.request('/search?q='+query)).owners.filter(owner => !owner.blocked);
  const flow = workflow(source.api, source.reader); flow.input.value=query; await flow.search();
  assert.equal(flow.state.familySearch.groups.length, expected.length);
  assert.deepEqual(Array.from(flow.state.familySearch.groups, group => group.family.baseword_key), Array.from(expected, owner => owner.baseword_key));
});
test('an older request cannot replace a newer search or a navigation away from Browse', async () => {
  let resolveOld;
  const pending = new Promise(resolve => resolveOld=resolve);
  const owner = {baseword_key:'use',candidate_member:1};
  const source = {request:path => path.includes('q=old') ? pending : Promise.resolve({owners:[]})};
  const flow = workflow(source, {load:async()=>({})});
  flow.input.value='old'; const old = flow.search();
  flow.input.value='new'; await flow.search(); resolveOld({owners:[owner]}); await old;
  assert.equal(flow.state.familySearch.query, 'new');
  assert.equal(flow.state.familySearch.groups.length, 0);
  const second = workflow({request:()=>Promise.resolve({owners:[owner]})}, {load:async()=>({})});
  second.state.view='check'; await second.search();
  assert.equal(second.state.familySearch.groups.length, 0);
});
test('frequency failure keeps real forms available, with a retry rather than fabricated counts', async () => {
  const source = resources(), flow = workflow(source.api, {load:async()=>{throw new Error('offline');}});
  await flow.search();
  assert.ok(flow.state.familySearch.groups[0].forms.length > 10);
  assert.equal(flow.state.familySearch.frequencyError, true);
  const rows = results.sortedForms(flow.state.familySearch.groups[0].forms, 'reusable', flow.state.familySearch.groups[0].frequencies);
  assert.ok(rows.every(row => row.frequency === null));
});
test('choosing two individual forms preserves the same lesson notes and the exact selections', () => {
  const family = {baseword_key:'use', display_family:'use'};
  const items = [{...family, selected_forms:['reuse'], notes:'Explain in context', order:4}];
  const changed = globalThis.HKELE_LESSON.mergeSelections(items, [{family, selectedForms:['reusable'], sourceLabel:'Find words'}], () => assert.fail('must retain the existing family'));
  assert.deepEqual(changed.items[0].selected_forms, ['reuse','reusable']);
  assert.equal(changed.items[0].notes, 'Explain in context');
  assert.deepEqual(items[0].selected_forms, ['reuse']);
});

test('rendered results pin the query, keep form grades separate, and route View/Add with the concrete form', async () => {
  const source = resources(), detail = await source.api.request('/families/be');
  const opened = [], added = [], nodes = new Map();
  class Node {
    constructor() {this.listeners={};this.hidden=false;this.innerHTML='';this.dataset={};this.classList={toggle(){}};}
    addEventListener(event, callback) {this.listeners[event]=callback;}
    click() {this.listeners.click?.();}
    querySelectorAll(selector) {
      if (!this.buttons) this.buttons = [...this.innerHTML.matchAll(/<button\b([^>]*)>/g)].map(match => {
        const button = new Node();
        for (const attr of match[1].matchAll(/data-([a-z-]+)(?:="([^"]*)")?/g)) {
          const name = attr[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          button.dataset[name] = attr[2] || '';
        }
        return button;
      });
      const name=selector.match(/\[data-([a-z-]+)\]/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
      return this.buttons.filter(button => name && name in button.dataset);
    }
  }
  const get = selector => {if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector);};
  const state = {selected:[], familySearch:{query:'beingness',sort:'frequency-desc',loading:false,
    groups:[{...detail, frequencies:await source.reader.load('be')}],frequencyError:false}};
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const context = vm.createContext({state, familyResults:results, $:get, $$:()=>[], esc,
    tokens:(value,kind)=>globalThis.HKELE_EVIDENCE_TOKENS.chips(value,kind),subjectTokens:()=> '—',
    HKELE_EVIDENCE_TOKENS:globalThis.HKELE_EVIDENCE_TOKENS,
    blank:value=>value===null||value===undefined||String(value).trim()==='',normalized:value=>String(value||'').trim().toLowerCase(),
    integer:value => value === null || value === undefined ? '—' : String(value),
    shown:value => value === null || value === undefined ? '—' : esc(value),
    evidenceBadge:(_label, value) => value ? `<span>${esc(value)}</span>` : '',
    hasAwl:form => Boolean(form?.awl), msvlDisplay:() => '', statusClass:()=>'core',statusLabel:()=>'Core list',
    rankBand:(rank, band)=>`${rank} · ${band}`, yes:value=>value?'Yes':'—',refreshSearchAddButtons:()=>{},
    openFamily:(...args)=>opened.push(args),addToList:(...args)=>added.push(args)});
  vm.runInContext(readFileSync(new URL('../compound_ui.js',import.meta.url),'utf8'),context);
  context.compoundUi=context.HKELE_COMPOUND_UI.create({state,esc,openFamily:context.openFamily,onChanged(){}});
  vm.runInContext(app.slice(app.indexOf('  const MSVL_LABELS'),app.indexOf('  const state =')),context);
  vm.runInContext(app.slice(app.indexOf('  function msvlSubjects('),app.indexOf('  function hasAwl(')),context);
  vm.runInContext(app.slice(app.indexOf('  function renderFamilySearch()'), app.indexOf('  async function searchWordFamily(')), context);
  context.renderFamilySearch();
  const host = get('#family-search-results'), rows = [...host.innerHTML.matchAll(/<tr(?: class="search-hit")?>[\s\S]*?<\/tr>/g)].map(m=>m[0]).filter(row=>row.includes('data-search-view'));
  assert.match(rows[0], /class="search-hit"/); assert.match(rows[0], /Your search/);
  assert.match(rows[0], /data-form="beingness"/); assert.match(rows[0], /Grades 10–11/);
  const beRow = rows.find(row=>row.includes('data-form="be"'));
  assert.match(beRow, /Kindergarten–Grade 1/); assert.doesNotMatch(beRow, /Grades 10–11/);
  assert.equal(rows.length, detail.forms.length);
  host.querySelectorAll('[data-search-view]')[0].click();
  host.querySelectorAll('[data-search-add]')[0].click();
  assert.deepEqual(opened[0], ['be','beingness']);
  assert.equal(added[0][0].baseword_key, 'be'); assert.equal(added[0][1], 'beingness');
  assert.equal(get('#browse-table-shell').hidden, true);
  state.familySearch = null; context.renderFamilySearch();
  assert.equal(get('#browse-table-shell').hidden, false); assert.equal(host.hidden, true);
  const stress=await source.api.request('/families/stress');
  state.familySearch={query:'stress',sort:'frequency-desc',loading:false,groups:[{...stress,frequencies:await source.reader.load('stress')}],frequencyError:false};
  context.renderFamilySearch();
  const selected=host.innerHTML.match(/<tr class="search-hit">[\s\S]*?<\/tr>/)[0];
  assert.equal((selected.match(/class="evidence-token token-(english|health|math|science|social)"/g)||[]).length,4);
  assert.equal((selected.match(/class="evidence-token token-root"/g)||[]).length,2);
  assert.equal((selected.match(/class="evidence-token token-meaning"/g)||[]).length,3);
});
