(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HKELE_COMPOUND_TEACHING=factory();})(globalThis,function(){
  const key=expression=>'expression:'+expression.expressionId;
  function createItem(expression,order,dataVersion,source='Find words'){
    return {record_type:'compound',expression,baseword_key:key(expression),display_family:expression.displayExpression,selected_forms:[expression.displayExpression],order,depth:'Notice',teaching_focus:'',notes:'',connections:'',source_labels:[source],data_version:dataVersion,set_membership:null,overall_frequency_order:null,overall_frequency_value:null,hk_corpus_frequency_rank:null,hk_corpus_frequency_band:null};
  }
  function refresh(item,expression){
    if(!expression||key(expression)!==item.baseword_key||expression.normalizedExpression!==item.expression?.normalizedExpression)return {...item,data_review_status:'Saved compound kept — update the wordlist to check its details.'};
    return {...item,expression,data_review_status:null};
  }
  return {key,createItem,refresh};
});
