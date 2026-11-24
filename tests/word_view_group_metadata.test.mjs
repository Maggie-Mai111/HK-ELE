import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../word_view_controller.js',import.meta.url),'utf8');
function setup(){
 const c={HKELE_WORD_VIEW_DATA:{counts:{all:{},familiar:{}},fields:[],families:{year:[]},members:{year:['year']}}};
 vm.runInNewContext(code,c);return c.HKELE_WORD_VIEW;
}
test('checking in familiar view then switching keeps grouped counts, concrete forms and locations',()=>{
 const view=setup();view.set('familiar');
 const raw={surface:'Year',normalized_token:'year',occurrence_id:'0',owners:[{baseword_key:'year'}]};
 const projected=view.item(raw);
 const metadata={display_word:'Year',count:2,first_order:0,occurrence_ids:['0','2'],surface_forms:['Year','year'],context_examples:['Year after year']};
 let group={...projected,...metadata};
 for(const mode of ['all','familiar','all','familiar','all']){
  view.set(mode);group=view.item(group);
  for(const [key,value] of Object.entries(metadata))assert.deepEqual(group[key],value,key+' '+mode);
  assert.equal(Number.isNaN(0+group.count),false);
 }
 assert.equal(Object.hasOwn(raw,'count'),false,'raw occurrence remains unmodified');
});
test('normalization and multiple owners survive both views with counted repetitions',()=>{
 const view=setup();view.set('familiar');
 const raw={surface:'xyzzy',owners:[],alternatives:[{baseword_key:'year'}],normalizedAnalysis:{tokens:[{familyKey:'year',form:'year',wordListMember:true}]}};
 let group={...view.item(raw),count:3,occurrence_ids:['0','1','2'],context_examples:['xyzzy xyzzy xyzzy']};
 for(const mode of ['all','familiar','all']){view.set(mode);group=view.item(group);assert.equal(group.count,3);assert.equal(group.occurrence_ids.length,3);assert.equal(group.alternatives[0].baseword_key,'year');assert.equal(group.normalizedAnalysis.tokens[0].form,'year');}
});
