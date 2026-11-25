(function(root){
  "use strict";
  function selection(scope,view,release){
    if(scope!=="core"&&scope!=="core95")return null;
    const target=scope==="core95"?"95":"90";
    const mode=view==="familiar"?"familiar":"all";
    const record=release?.exports?.[`${mode}-${target}`];
    return record?{...record,view:mode,target,key:`${mode}-${target}`}:null;
  }
  function create({button,status,getView,getRelease,getDataVersion,fetchFile,digest,save}){
    let scope="full",revision=0,busy=false,current=null;
    function refresh(nextScope=scope){
      scope=nextScope;
      const next=selection(scope,getView(),getRelease());
      if(next?.key!==current?.key){revision++;busy=false;status.hidden=true;}
      current=next;button.hidden=!next;button.disabled=busy;
      if(next){button.textContent=busy?"Preparing download…":`Download ${next.target}% core list (.xlsx)`;button.setAttribute("aria-label",`Download ${next.target}% core list, ${next.view==="familiar"?"Generally familiar forms":"All word forms"}, Excel`);}
    }
    async function download(){
      const item=current;if(!item||busy)return;
      const ticket=++revision;busy=true;refresh();status.hidden=true;
      try{
        const release=getRelease();
        if(await getDataVersion()!==release.dataVersion)throw new Error("Version mismatch");
        const bytes=await fetchFile(item.assetPath+"?v="+item.sha256.slice(0,16));
        if(bytes.byteLength!==item.byteSize||await digest(bytes)!==item.sha256)throw new Error("File mismatch");
        if(ticket!==revision)return;
        save(bytes,item.filename);
      }catch{
        if(ticket===revision){status.textContent="We couldn't download this list. Please try again.";status.hidden=false;}
      }finally{
        if(ticket===revision){busy=false;refresh();}
      }
    }
    button.addEventListener("click",download);refresh();
    return {refresh,download};
  }
  root.HKELE_LIST_DOWNLOAD={selection,create};
  const button=root.document?.getElementById("download-selected-list");
  if(!button)return;
  const ui=create({button,status:document.getElementById("list-download-status"),getView:()=>root.HKELE_WORD_VIEW.get(),getRelease:()=>root.HKELE_LIST_DOWNLOADS_RELEASE,
    getDataVersion:async()=>(await root.HKELE_STATIC_API.manifest()).metadata.data_version,
    fetchFile:async url=>{const response=await fetch(url);if(!response.ok)throw new Error("Download failed");return response.arrayBuffer();},
    digest:async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join(""),
    save:(bytes,name)=>{const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  });
  root.HKELE_LIST_DOWNLOAD.refresh=ui.refresh;
})(globalThis);
