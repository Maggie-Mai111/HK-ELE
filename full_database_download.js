(function(){
  const button=document.getElementById('download-full-database');
  button.addEventListener('click',async()=>{
    const release=globalThis.HKELE_WORD_VIEW?.get()==='familiar'?globalThis.HKELE_FAMILIAR_DATABASE:globalThis.HKELE_FULL_DATABASE;
    button.disabled=true;button.textContent='Preparing download…';
    try{
      if((await globalThis.HKELE_STATIC_API.manifest()).metadata.data_version!==release.dataVersion)throw new Error('Generation mismatch');
      const a=document.createElement('a');a.href=release.assetPath+'?v='+release.sha256.slice(0,16);a.download=release.filename;a.click();
      button.textContent=globalThis.HKELE_WORD_VIEW?.get()==='familiar'?'Download familiar words (.xlsx)':'Download full database (.xlsx)';
    }catch{button.textContent='Download failed · Try again';}finally{button.disabled=false;}
  });
})();
