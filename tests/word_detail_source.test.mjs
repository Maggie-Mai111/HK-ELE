import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// Run the actual word-card event bindings, including form-table Add buttons.
const start = app.indexOf('    window.dispatchEvent(new CustomEvent("hkele-word-feedback-context"');
const end = app.indexOf('    [["hk", "#form-filter-hk"]', start);
assert.ok(start >= 0 && end > start);

test('word-card Add keeps its concrete form and actual entry source after changing forms', () => {
  for (const [view, expected] of [['check','Check a text'],['list','Teaching list'],['browse','Find words'],[undefined,'Find words']]) {
    const callbacks = new Map(), added = [];
    const button = name => ({dataset:{addForm:name},addEventListener:(_type,handler)=>callbacks.set(name,handler)});
    const family = {display_family:'cell'};
    const selected = {form:'cells'};
    const context = vm.createContext({
      window:{dispatchEvent:()=>{}},CustomEvent:class {},family,selected,
      state:{wordReturn:view ? {view} : null,selectedForm:'cells'},
      detail:{forms:[{form_key:'f:cell',form:'cell'}]},
      $:()=>button('selected'),$$:selector=>selector==='[data-add-form]'?[button('f:cell')]:[],
      addToList:(...args)=>added.push(args),renderWord:()=>{},
    });
    vm.runInContext(app.slice(start,end),context);
    callbacks.get('selected')(); callbacks.get('f:cell')();
    assert.deepEqual(added,[[family,'cells',expected],[family,'cell',expected]]);
  }
});
