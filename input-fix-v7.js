// Preserve focus and mobile keyboard while typing decimals in all price fields.
(function(){
  function parseDraft(raw){
    const text=String(raw??'').replaceAll(',','').trim();
    if(text===''||text==='.'||text.endsWith('.')) return {draft:true,value:text===''?null:Number(text.slice(0,-1)||0)};
    const value=Number(text);
    return {draft:false,value:Number.isFinite(value)&&value>=0?value:null};
  }

  function updateSelectedRows(){
    if(!S.selected) return;
    const u=S.selected;
    const records=S.r.filter(x=>K(x.underlyingSymbol,x.market)===u.key);
    const bySymbol=new Map(records.map(x=>[x.drSymbol,x]));

    document.querySelectorAll('#ptbody tr').forEach(row=>{
      const symbol=row.children?.[0]?.textContent?.trim();
      const record=bySymbol.get(symbol);
      if(!record) return;

      const fairValue=fair(record);
      if(row.children[1]) row.children[1].textContent=fairValue==null?'—':fmt(fairValue,2);

      const drInput=row.querySelector('[data-dr-price]');
      const drDraft=parseDraft(drInput?.value??'');
      const drValue=drDraft.value;
      const pd=fairValue!=null&&drValue!=null&&fairValue!==0?(drValue/fairValue-1)*100:null;
      const result=row.children[3];
      if(result){
        result.className='num '+premiumClass(pd);
        const label=pd==null?'—':`${pd>=0?'+':''}${pd.toFixed(2)}% ${pd>0?'Premium':pd<0?'Discount':'At Fair'}`;
        result.innerHTML=`<b>${label}</b>`;
      }
      if(row.children[5]) row.children[5].textContent=fxfmt(S.fx[u.currency]?.rate);
    });
  }

  // Capture before older per-element handlers. This prevents renderSelected()/fxui()
  // from rebuilding the DOM and closing the Android keyboard.
  document.addEventListener('input',event=>{
    const target=event.target;

    if(target?.id==='selectedPrice'){
      event.stopImmediatePropagation();
      if(!S.selected) return;
      const parsed=parseDraft(target.value);
      if(parsed.value==null) delete S.p[S.selected.key]; else S.p[S.selected.key]=parsed.value;
      save();metrics();updateSelectedRows();
      return;
    }

    if(target?.id==='selectedFx'){
      event.stopImmediatePropagation();
      if(!S.selected) return;
      const parsed=parseDraft(target.value),currency=S.selected.currency;
      if(parsed.value!=null&&parsed.value>0) S.fx[currency]={rate:parsed.value,date:new Date().toISOString().slice(0,10),source:'Manual'};
      else delete S.fx[currency];
      save();metrics();
      document.querySelectorAll(`[data-fx="${CSS.escape(currency)}"]`).forEach(input=>{if(input!==target)input.value=target.value});
      updateSelectedRows();
      return;
    }

    const drInput=target?.closest?.('[data-dr-price]');
    if(drInput){
      event.stopImmediatePropagation();
      const symbol=drInput.dataset.drPrice;
      const parsed=parseDraft(drInput.value);
      if(parsed.value==null) delete S.drp[symbol]; else S.drp[symbol]=parsed.value;
      save();updateSelectedRows();
    }
  },true);
})();