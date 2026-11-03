(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.HKELE_WORD_ORIGINS=factory().createLoader(root.HKELE_WORD_ORIGINS_RELEASE);
})(globalThis,function(){
  const normalize=w=>String(w).normalize('NFKC').trim().toLowerCase();
  function select(shard,key,word,release){
    if(shard.schema!=='hkele-word-origins/1'||shard.version!==release.version||shard.dataVersion!==release.dataVersion)throw new Error('Incompatible word origins.');
    const w=normalize(word),record=shard.records[key+'\t'+w]||null;
    if(record&&(record.familyKey!==key||record.normalizedForm!==w||!Array.isArray(record.origins)||!record.origins.length||record.origins.some(o=>![1,2].includes(o.slot)||typeof o.form!=='string'||!o.form.trim()||(o.language!==null&&typeof o.language!=='string')||(o.meaning!==null&&typeof o.meaning!=='string'))))throw new Error('Inconsistent word origins.');
    return record;
  }
  function createLoader(release,options={}){
    const read=options.read||(async path=>{const r=await fetch(`data/word-origins/${release.version}/${path}`,{cache:'force-cache'});if(!r.ok)throw new Error('Word origins could not load.');return new Uint8Array(await r.arrayBuffer());});
    const hash=options.hash||(async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''));
    const inflate=options.inflate||(async bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    const cache=new Map();
    async function lookup(key,word,dataVersion=release.dataVersion){
      if(dataVersion!==release.dataVersion)return null;
      const w=normalize(word),bucket=/^[a-z]/.test(w)?w[0]:'_other',path=bucket+'.json.gz';
      if(!cache.has(path))cache.set(path,(async()=>{const raw=await read(path),info=release.files[path];if(!info||raw.length!==info.bytes||await hash(raw)!==info.sha256)throw new Error('Word origins changed.');return JSON.parse(await inflate(raw));})().catch(e=>{cache.delete(path);throw e;}));
      return select(await cache.get(path),key,w,release);
    }
    async function mount(host,key,word,dataVersion,normalizedForm){
      if(dataVersion!==release.dataVersion||!normalizedForm)return;
      try{
        const record=await lookup(key,normalizedForm,dataVersion);
        if(!record||!host.isConnected)return;
        const details=document.createElement('details');details.className='word-origins workspace-disclosure';
        const summary=document.createElement('summary');summary.textContent='Word origins';details.append(summary);
        const body=document.createElement('div');body.className='word-origins-body';
        const intro=document.createElement('p');intro.textContent=`Explore the earlier forms behind ${word}.`;body.append(intro);
        for(const origin of record.origins){const item=document.createElement('div');item.className='word-origin-item';for(const [cls,text] of [['word-origin-language',origin.language||'Origin form'],['word-origin-form',origin.form],['word-origin-meaning',origin.meaning||'—']]){const el=document.createElement('div');el.className=cls;el.textContent=text;item.append(el);}body.append(item);}
        details.append(body);host.replaceChildren(details);
      }catch{/* Supplementary annotations never block the word card. */}
    }
    return {lookup,mount};
  }
  return {select,createLoader};
});
