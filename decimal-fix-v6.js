// Fix DR latest-price decimal typing without rerendering the whole table.
document.addEventListener('input',event=>{
  const input=event.target.closest?.('[data-dr-price]');
  if(!input)return;

  // Stop the older handler, which rerenders the row and removes a trailing decimal point.
  event.stopImmediatePropagation();

  const symbol=input.dataset.drPrice;
  const raw=String(input.value??'').replaceAll(',','').trim();
  const value=raw===''||raw==='.'?null:Number(raw);

  if(value==null||!Number.isFinite(value)||value<0) delete S.drp[symbol];
  else S.drp[symbol]=value;
  save();

  const row=input.closest('tr');
  const resultCell=row?.children?.[3];
  const record=S.r.find(x=>x.drSymbol===symbol);
  const fairValue=record?fair(record):null;
  const pd=fairValue!=null&&value!=null&&Number.isFinite(value)&&fairValue!==0?(value/fairValue-1)*100:null;

  if(resultCell){
    resultCell.className='num '+premiumClass(pd);
    const label=pd==null?'—':`${pd>=0?'+':''}${pd.toFixed(2)}% ${pd>0?'Premium':pd<0?'Discount':'At Fair'}`;
    resultCell.innerHTML=`<b>${label}</b>`;
  }
},true);
