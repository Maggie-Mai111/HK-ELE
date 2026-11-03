import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=name=>readFileSync(new URL('../'+name,import.meta.url));
function product(){
 const context=vm.createContext({URL,crypto:globalThis.crypto,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,location:{href:'https://fixture.invalid/'},fetch:async file=>new Response(new Uint8Array(read(file)))});
 context.window=context;
 for(const name of ['compound_release.js','compound_data.js','static_api.js','tokenizer.js','text_workspace.js'])vm.runInContext(read(name).toString(),context);
 return context;
}
test('copied punctuation and emoji never stop the surrounding English words',()=>{
 const p=product(),text='👩‍🏫 • ‘cells’，help teachers。\n【stress】！';
 const words=p.HKELE_TOKENIZER.tokenizeTeacherText(text);
 assert.deepEqual(Array.from(words,item=>item.surface),['cells','help','teachers','stress']);
 for(const item of words)assert.equal(text.slice(item.start_offset,item.end_offset),item.surface);
 assert.equal(p.HKELE_TEXT_WORKSPACE.segments(text,words).map(part=>part.text).join(''),text);
 assert.throws(()=>p.HKELE_TOKENIZER.scan('cell🙂'));
});
test('real Web resolution retains all text and separates unclear forms from valid words and compounds',async()=>{
 const p=product(),text="• Cells，use reusable bottles 🙂 classroom. com\u200bputer can't've café 中文 stress.";
 const occurrences=p.HKELE_TOKENIZER.tokenizeTeacherText(text);
 const result=await p.HKELE_STATIC_API.request('/occurrences/resolve',{body:JSON.stringify({occurrences})});
 assert.equal(result.occurrences.find(x=>x.surface==='Cells').status,'RESOLVED');
 assert.equal(result.occurrences.find(x=>x.surface==='reusable').owners[0].baseword_key,'use');
 assert.equal(result.occurrences.find(x=>x.surface==='classroom').status,'REGISTERED_EXPRESSION');
 for(const surface of ['com\u200bputer',"can't've",'café','中文']){
  const item=result.occurrences.find(x=>x.surface===surface);assert.equal(item.status,'UNSUPPORTED');assert.equal(item.owners.length,0);
 }
 assert.equal(result.occurrences.find(x=>x.surface==='stress').status,'RESOLVED');
 assert.equal(p.HKELE_TEXT_WORKSPACE.segments(text,result.occurrences).map(part=>part.text).join(''),text);
});
test('ordinary English keeps the existing matching units and the original input limit',()=>{
 const p=product(),text="I’m here — don't move. The ‘teachers’ report’ describes reusable bottles.";
 assert.equal(JSON.stringify(p.HKELE_TOKENIZER.tokenizeTeacherText(text)),JSON.stringify(p.HKELE_TOKENIZER.tokenize(text)));
 assert.equal(p.HKELE_TOKENIZER.tokenizeTeacherText('•🙂，123\u200b').length,0);
 assert.throws(()=>p.HKELE_TOKENIZER.tokenizeTeacherText('cell '.repeat(501)),/500/);
});
test('the actual Web Check text handler uses the tolerant entry, keeping OCR and word search separate',()=>{
 const app=read('app.js').toString();assert.match(app,/HKELE_TOKENIZER\.tokenizeTeacherText\(source, 500\)/);
 assert.doesNotMatch(read('text_workspace.js').toString(),/Try the English spelling of this word/);
});
