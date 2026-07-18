// Final UI and Fair-value consistency fix.
(function(){
  function removeUnusedMetrics(){
    ['mP','mF'].forEach(id=>{
      const el=document.getElementById(id);
      const card=el?.closest('.metric');
      if(card) card.remove();
      else if(el?.parentElement) el.parentElement.remove();
    });
    const metrics=document.querySelector('.metrics');
    if(metrics) metrics.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';
  }

  // The base app renders once before the rounding override is loaded.
  // Render again now so both displayed Fair and Premium/Discount use the same 2-decimal value.
  function refreshAfterAllScripts(){
    removeUnusedMetrics();
    if(typeof renderSelected==='function') renderSelected();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAfterAllScripts,0),{once:true});
  }else{
    setTimeout(refreshAfterAllScripts,0);
  }
})();