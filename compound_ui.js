(function(root){
  function create({state,esc,openFamily,onChanged}){
    const records=new Map();let dialog;
    function html(expression,source='Find words'){
      records.set(expression.expressionId,expression);
      const added=state.selected.some(item=>item.baseword_key===root.HKELE_COMPOUND_TEACHING.key(expression));
      const parts=(expression.parts||[]).map(part=>part.familyKey?`<button type="button" data-compound-family="${esc(part.familyKey)}" data-compound-form="${esc(part.form)}">${esc(part.form)}</button>`:`<span>${esc(part.form)}</span>`).join('');
      return `<section class="compound-card" aria-label="${esc(expression.displayExpression)} compound"><div class="compound-title"><h3>${esc(expression.displayExpression)}</h3><span class="set-pill other">Compound</span></div>${parts?`<div class="compound-parts"><span>Recorded word parts</span>${parts}</div>`:''}<div class="compound-actions"><button type="button" class="primary" data-compound-add="${expression.expressionId}" data-compound-source="${esc(source)}" ${added?'disabled':''}>${added?'Added ✓':'Add to Teaching list'}</button><button type="button" data-feedback-kind="rating" data-feedback-word="true" data-compound-feedback="${expression.expressionId}" data-compound-source="${esc(source)}">Rate this word</button><button type="button" data-feedback-kind="report" data-feedback-word="true" data-compound-feedback="${expression.expressionId}" data-compound-source="${esc(source)}">Report a problem</button></div></section>`;
    }
    function bind(host){
      host.querySelectorAll('[data-compound-family]').forEach(button=>button.addEventListener('click',()=>{if(dialog?.open)dialog.close();void openFamily(button.dataset.compoundFamily,button.dataset.compoundForm);}));
      host.querySelectorAll('[data-compound-add]').forEach(button=>button.addEventListener('click',()=>{
        const expression=records.get(button.dataset.compoundAdd);if(!expression)return;
        const key=root.HKELE_COMPOUND_TEACHING.key(expression);
        if(!state.selected.some(item=>item.baseword_key===key))state.selected.push(root.HKELE_COMPOUND_TEACHING.createItem(expression,state.selected.length+1,root.HKELE_COMPOUND_RELEASE.dataVersion,button.dataset.compoundSource));
        onChanged();document.querySelectorAll('[data-compound-add]').forEach(node=>{if(node.dataset.compoundAdd===expression.expressionId){node.disabled=true;node.textContent='Added ✓';}});
      }));
      host.querySelectorAll('[data-compound-feedback]').forEach(button=>button.addEventListener('click',()=>{
        const expression=records.get(button.dataset.compoundFeedback);if(!expression)return;
        window.dispatchEvent(new CustomEvent('hkele-word-feedback-context',{detail:{word:expression.displayExpression,expressionId:expression.expressionId,expressionVersion:expression.sourceVersion,page:button.dataset.compoundSource}}));
      }));
    }
    function open(expression,source='Teaching list'){
      if(!expression)return;
      if(!dialog){dialog=document.createElement('dialog');dialog.className='feedback-dialog';document.body.appendChild(dialog);}
      dialog.setAttribute('aria-label',expression.displayExpression+' compound');
      dialog.innerHTML=html(expression,source)+'<button type="button" data-compound-close>Close</button>';bind(dialog);
      dialog.querySelector('[data-compound-close]').addEventListener('click',()=>dialog.close());if(!dialog.open)dialog.showModal();
    }
    return {html,bind,open};
  }
  root.HKELE_COMPOUND_UI={create};
})(globalThis);
