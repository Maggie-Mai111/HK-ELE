(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.HKELE_COMPOUNDS=factory().createLoader(root.HKELE_COMPOUND_RELEASE);
})(globalThis,function(){
  const normalize=word=>String(word||'').normalize('NFKC').trim().toLowerCase();
  function createLoader(release,options={}){
    const base=`data/compounds/${release.expressionVersion}/`;
    const read=options.read|| (async path=>{const response=await fetch(base+path,{cache:'force-cache'});if(!response.ok)throw new Error('Compound words need downloading.');return new Uint8Array(await response.arrayBuffer());});
    const hash=options.hash|| (async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''));
    const inflate=options.inflate|| (async bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    let manifestPromise;const shards=new Map();
    async function descriptor(){
      manifestPromise??=(async()=>{const bytes=await read('manifest.json'),text=new TextDecoder().decode(bytes).replace(/\r\n/g,'\n');if(await hash(new TextEncoder().encode(text))!==release.manifestSha256)throw new Error('Compound data changed.');const value=JSON.parse(text);if(value.productDataVersion!==release.dataVersion||value.expressionDataVersion!==release.expressionVersion)throw new Error('Incompatible compound data.');return value;})().catch(error=>{manifestPromise=null;throw error;});
      return manifestPromise;
    }
    async function lookup(word,dataVersion=release.dataVersion){
      const query=normalize(word);if(!/^\p{L}+$/u.test(query))return null;
      if(dataVersion!==release.dataVersion)throw new Error('Compound layer belongs to another wordlist.');
      const bucket=/^[a-z]/.test(query)?query[0]:'_other';
      if(!shards.has(bucket))shards.set(bucket,(async()=>{const info=(await descriptor()).files[bucket+'.json.gz'];const bytes=await read(bucket+'.json.gz');if(!info||bytes.length!==info.bytes||await hash(bytes)!==info.sha256)throw new Error('Compound words need downloading again.');return JSON.parse(await inflate(bytes));})().catch(error=>{shards.delete(bucket);throw error;}));
      const record=(await shards.get(bucket))[query]||null;
      if(record&&(record.kind!=='COMPOUND'||record.normalizedExpression!==query||record.sourceVersion!==release.expressionVersion))throw new Error('Inconsistent compound record.');
      return record;
    }
    return {lookup,normalize,release};
  }
  return {createLoader,normalize};
});
