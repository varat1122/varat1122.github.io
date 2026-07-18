const MC={US:'USD',HK:'HKD',JP:'JPY',VN:'VND',SG:'SGD',CN:'CNY',TW:'TWD',FR:'EUR',DE:'EUR',NL:'EUR',IT:'EUR',DK:'DKK'};
const H={us:'Symbol หุ้นอ้างอิง',un:'อ้างอิงหุ้น',desc:'รายละเอียดธุรกิจ',dr:'DR Symbol',ct:'ที่ตั้งธุรกิจ',mk:'จดทะเบียนในตลาดหลักทรัพย์',ra:'อัตราแปลงสภาพ',biz:'ธุรกิจหลัก (สั้น)',sector:'Sector',theme:'Thematic Category'};
const DB_KEY='fdr-db-v10',PRICE_KEY='fdr-p',FX_KEY='fdr-fx',DR_PRICE_KEY='fdr-drp';
const S={db:null,r:[],u:[],p:{},fx:{},drp:{},selected:null};
const $=id=>document.getElementById(id);
const K=(s,m)=>String(s||'').toUpperCase()+'|'+String(m||'').toUpperCase();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numberFrom=x=>{const t=String(x??'').replaceAll(',','').trim();if(t===''||t==='.')return null;const v=Number(t);return Number.isFinite(v)&&v>=0?v:null};
const round2=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
const fmt2=x=>Number.isFinite(Number(x))?Number(x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const fxfmt=x=>Number.isFinite(Number(x))?(Number(x)<.01?Number(x).toFixed(8):Number(x)<1?Number(x).toFixed(6):Number(x).toFixed(4)).replace(/0+$/,'').replace(/\.$/,''):'—';

function ratio(v){
  const t=String(v??'').replaceAll(',','').trim();
  const m=t.match(/^([0-9.]+)\s*:\s*([0-9.]+)$/);
  if(!m||!(+m[1]>0)||!(+m[2]>0))throw Error('Ratio ไม่ถูกต้อง: '+v);
  return {raw:t,upd:+m[2]/+m[1]};
}
function parse(buf,name){
  if(!window.XLSX)throw Error('โหลดตัวอ่าน Excel ไม่สำเร็จ');
  const w=XLSX.read(buf,{type:'array',cellFormula:true,cellText:true}),sh=w.Sheets.DR;
  if(!sh)throw Error('ไม่พบชีต DR');
  const a=XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:false,blankrows:false});
  const hd=(a[0]||[]).map(x=>String(x??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim());
  const ix={};for(const[k,v]of Object.entries(H))ix[k]=hd.findIndex(x=>x===v||(k==='ra'&&x.startsWith(v)));
  for(const k of['us','un','dr','ct','mk','ra'])if(ix[k]<0)throw Error('ไม่พบคอลัมน์: '+H[k]);
  const r=[],warnings=[],seen=new Set();
  for(let i=1;i<a.length;i++){
    const row=a[i]||[],g=k=>ix[k]>=0?String(row[ix[k]]??'').trim():'',dr=g('dr').toUpperCase(),us=g('us').toUpperCase();
    if(!dr&&!us)continue;if(!dr){warnings.push('แถว '+(i+1)+': ไม่มี DR Symbol');continue}if(seen.has(dr)){warnings.push('แถว '+(i+1)+': DR ซ้ำ '+dr);continue}seen.add(dr);
    let q;try{q=ratio(g('ra'))}catch(e){warnings.push('แถว '+(i+1)+': '+e.message);continue}
    const market=g('mk').toUpperCase();
    r.push({excelRow:i+1,underlyingSymbol:us,underlyingName:g('un'),description:g('desc'),drSymbol:dr,country:g('ct'),market,currency:MC[market]||'',ratioRaw:q.raw,underlyingPerDr:q.upd,businessShort:g('biz'),sector:g('sector'),theme:g('theme')});
  }
  if(!r.length)throw Error('ไม่พบข้อมูล DR ที่ใช้งานได้');
  return {filename:name,sheet:'DR',recordCount:r.length,underlyingCount:new Set(r.map(x=>K(x.underlyingSymbol,x.market))).size,records:r,warnings};
}
function defaultDb(){
  const pack={u:window.DR_U||[],r:window.DR_R||[]};
  const records=pack.r.map((row,i)=>{const u=pack.u[row[0]]||[];return{excelRow:i+2,underlyingSymbol:u[0]||'',underlyingName:u[1]||'',description:'',drSymbol:row[1]||'',country:u[7]||'',market:u[2]||'',currency:u[3]||'',ratioRaw:row[2]||'',underlyingPerDr:Number(row[3])||0,businessShort:u[4]||'',sector:u[5]||'',theme:u[6]||''}});
  return {filename:'DR_160726_enriched.xlsx',sheet:'DR',recordCount:records.length,underlyingCount:pack.u.length,records,warnings:[]};
}
function save(){localStorage.setItem(PRICE_KEY,JSON.stringify(S.p));localStorage.setItem(FX_KEY,JSON.stringify(S.fx));localStorage.setItem(DR_PRICE_KEY,JSON.stringify(S.drp))}
function message(items){const e=$('msg');if(!items?.length){e.classList.remove('show');e.innerHTML='';return}e.classList.add('show');e.innerHTML=items.map(esc).join('<br>')}
function setEnabled(v){['getfx','psearch','dsearch','themeFilter'].forEach(id=>{if($(id))$(id).disabled=!v})}
function fair(record){
  const p=Number(S.p[K(record.underlyingSymbol,record.market)]),f=Number(S.fx[record.currency]?.rate);
  if(!Number.isFinite(p)||!Number.isFinite(f)||f<=0)return null;
  return round2(p*f*record.underlyingPerDr);
}
function apply(db,persist=true){
  S.db=db;S.r=db.records||[];
  const map=new Map();for(const x of S.r){const key=K(x.underlyingSymbol,x.market);if(!map.has(key))map.set(key,{key,symbol:x.underlyingSymbol,name:x.underlyingName,market:x.market,currency:x.currency,count:0});map.get(key).count++}
  S.u=[...map.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));if(persist)localStorage.setItem(DB_KEY,JSON.stringify(db));
  $('dbinfo').innerHTML=`<b>${esc(db.filename||'ฐานข้อมูล DR')}</b><br>${S.r.length} DR · ${S.u.length} หุ้นแม่ · มี Thematic ${new Set(S.r.map(x=>x.theme).filter(Boolean)).size} หมวด`;
  $('status').textContent='พร้อมใช้ '+S.r.length+' DR';$('mDr').textContent=S.r.length;$('mU').textContent=S.u.length;
  $('underlyingList').innerHTML=S.u.map(x=>`<option value="${esc(x.symbol)}">${esc(x.name)}</option>`).join('');
  const themes=[...new Set(S.r.map(x=>x.theme).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  $('themeFilter').innerHTML='<option value="">ทุก Thematic</option>'+themes.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  setEnabled(true);renderFxGrid();renderDirectory();selectFromSearch();message(db.warnings||[]);
}
function renderFxGrid(){
  if(!S.db)return;const currencies=[...new Set(S.u.map(x=>x.currency).filter(Boolean))].sort();
  $('fxinfo').textContent='ต้องใช้ '+currencies.join(', ')+' · พร้อม '+currencies.filter(c=>Number.isFinite(Number(S.fx[c]?.rate))).length+'/'+currencies.length;
  $('fxgrid').innerHTML=currencies.map(c=>`<div class="fxi"><label>${c} → THB</label><input class="input" data-global-fx="${c}" inputmode="decimal" autocomplete="off" value="${S.fx[c]?.rate??''}" placeholder="FX"></div>`).join('');
  document.querySelectorAll('[data-global-fx]').forEach(input=>input.addEventListener('input',()=>{
    const c=input.dataset.globalFx,v=numberFrom(input.value);if(v!=null&&v>0)S.fx[c]={rate:v,date:new Date().toISOString().slice(0,10),source:'Manual'};else delete S.fx[c];save();
    if(S.selected?.currency===c&&document.activeElement!==$('selectedFx'))$('selectedFx').value=input.value;
    updateCalculatedCells();
  }));
}
async function getfx(){
  const currencies=[...new Set(S.u.map(x=>x.currency).filter(Boolean))].sort(),errors=[];$('status').textContent='กำลังดึง FX…';$('getfx').disabled=true;
  await Promise.all(currencies.map(async c=>{try{if(c==='THB'){S.fx[c]={rate:1,date:new Date().toISOString().slice(0,10),source:'Fixed'};return}const res=await fetch('https://api.frankfurter.dev/v2/rate/'+c+'/THB',{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const j=await res.json();if(!(Number(j.rate)>0))throw Error('ข้อมูลผิดรูปแบบ');S.fx[c]={rate:Number(j.rate),date:j.date||'',source:'Frankfurter'}}catch(e){errors.push(c+': '+e.message)}}));
  save();renderFxGrid();if(S.selected)$('selectedFx').value=S.fx[S.selected.currency]?.rate??'';updateCalculatedCells();$('status').textContent=errors.length?'FX บางสกุลดึงไม่ได้':'FX พร้อมใช้';message([...(S.db?.warnings||[]),...errors]);$('getfx').disabled=false;
}
function findUnderlying(q){q=String(q||'').trim().toLowerCase();if(!q)return null;const exact=S.u.find(x=>x.symbol.toLowerCase()===q);if(exact)return exact;const matches=S.u.filter(x=>(x.symbol+' '+x.name).toLowerCase().includes(q));return matches.length===1?matches[0]:null}
function selectFromSearch(){const found=findUnderlying($('psearch').value);if(found?.key===S.selected?.key)return;S.selected=found;renderSelected()}
function renderSelected(){
  const box=$('selectedBox');if(!S.selected){box.classList.remove('show');$('ptbody').innerHTML='<tr><td colspan="8" class="empty">พิมพ์ค้นหาหุ้นแม่เพื่อแสดง Fair DR</td></tr>';$('pfoot').innerHTML='';return}
  const u=S.selected;box.classList.add('show');$('selectedSymbol').textContent=u.symbol;$('selectedName').textContent=u.name+' · '+u.market+' · '+u.currency;$('selectedPrice').value=S.p[u.key]??'';$('selectedFxLabel').textContent=u.currency+' → THB';$('selectedFx').value=S.fx[u.currency]?.rate??'';
  const rows=S.r.filter(x=>K(x.underlyingSymbol,x.market)===u.key).sort((a,b)=>a.drSymbol.localeCompare(b.drSymbol));
  $('ptbody').innerHTML=rows.map(x=>`<tr data-dr-row="${esc(x.drSymbol)}"><td class="sym">${esc(x.drSymbol)}</td><td class="num fairv" data-fair>—</td><td class="num"><input class="input price dr-price" data-dr-price="${esc(x.drSymbol)}" inputmode="decimal" autocomplete="off" value="${S.drp[x.drSymbol]??''}" placeholder="ราคา DR"></td><td class="num" data-premium>—</td><td class="num">${esc(x.ratioRaw)}</td><td class="num" data-row-fx>—</td><td>${esc(x.market)}</td><td>${esc(x.currency)}</td></tr>`).join('');
  document.querySelectorAll('[data-dr-price]').forEach(input=>input.addEventListener('input',()=>{const v=numberFrom(input.value),symbol=input.dataset.drPrice;if(v==null)delete S.drp[symbol];else S.drp[symbol]=v;save();updateRow(symbol)}));
  $('pfoot').innerHTML=`<span>${rows.length} DR อ้างอิง ${esc(u.symbol)}</span><span>Premium/Discount = ราคา DR ÷ Fair DR − 1</span>`;updateCalculatedCells();
}
function premiumLabel(pd){if(pd==null)return{cls:'',text:'—'};const clean=Math.abs(pd)<0.005?0:pd;return{cls:clean>0?'premium':clean<0?'discount':'near',text:`${clean>0?'+':''}${clean.toFixed(2)}% ${clean>0?'Premium':clean<0?'Discount':'At Fair'}`}}
function updateRow(symbol){
  const row=document.querySelector(`[data-dr-row="${CSS.escape(symbol)}"]`),record=S.r.find(x=>x.drSymbol===symbol);if(!row||!record)return;
  const fv=fair(record);row.querySelector('[data-fair]').textContent=fv==null?'—':fmt2(fv);row.querySelector('[data-row-fx]').textContent=fxfmt(S.fx[record.currency]?.rate);
  const dr=numberFrom(row.querySelector('[data-dr-price]')?.value),pd=fv!=null&&dr!=null&&fv!==0?(dr/fv-1)*100:null,info=premiumLabel(pd),cell=row.querySelector('[data-premium]');cell.className='num '+info.cls;cell.innerHTML=info.text==='—'?'—':`<b>${info.text}</b>`;
}
function updateCalculatedCells(){if(!S.selected)return;document.querySelectorAll('[data-dr-row]').forEach(row=>updateRow(row.dataset.drRow))}
function renderDirectory(){
  const q=$('dsearch').value.toLowerCase().trim(),theme=$('themeFilter').value;const list=S.r.filter(x=>{const hay=[x.drSymbol,x.underlyingSymbol,x.underlyingName,x.businessShort,x.sector,x.theme,x.country,x.market].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!theme||x.theme===theme)});
  $('dtbody').innerHTML=list.length?list.map(x=>`<tr><td class="sym">${esc(x.drSymbol)}</td><td><span class="sym">${esc(x.underlyingSymbol)}</span><span class="sub">${esc(x.underlyingName)}</span></td><td>${esc(x.businessShort||'—')}</td><td><span class="sector-pill">${esc(x.theme||'—')}</span></td><td>${esc(x.sector||'—')}</td><td>${esc(x.country)}</td><td>${esc(x.market)}</td><td class="num">${esc(x.ratioRaw)}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">ไม่พบรายการ</td></tr>';
  $('dfoot').innerHTML=`<span>แสดง ${list.length} จาก ${S.r.length} DR</span><span>${theme?esc(theme):'ทุก Thematic'}</span>`;
}
$('psearch').addEventListener('input',selectFromSearch);
$('selectedPrice').addEventListener('input',()=>{if(!S.selected)return;const v=numberFrom($('selectedPrice').value);if(v==null)delete S.p[S.selected.key];else S.p[S.selected.key]=v;save();updateCalculatedCells()});
$('selectedFx').addEventListener('input',()=>{if(!S.selected)return;const v=numberFrom($('selectedFx').value),c=S.selected.currency;if(v!=null&&v>0)S.fx[c]={rate:v,date:new Date().toISOString().slice(0,10),source:'Manual'};else delete S.fx[c];save();const global=document.querySelector(`[data-global-fx="${CSS.escape(c)}"]`);if(global&&global!==document.activeElement)global.value=$('selectedFx').value;updateCalculatedCells()});
$('dsearch').addEventListener('input',renderDirectory);$('themeFilter').addEventListener('change',renderDirectory);$('getfx').onclick=getfx;
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{apply(parse(await f.arrayBuffer(),f.name),true);$('status').textContent='อัปเดตฐานข้อมูลแล้ว'}catch(err){message([err.message,'เปิดไฟล์ใน Excel และกด Save ก่อนอัปโหลดอีกครั้ง'])}e.target.value=''};
$('resetDb').onclick=()=>{localStorage.removeItem(DB_KEY);apply(defaultDb(),false);$('status').textContent='ใช้ฐานข้อมูลเริ่มต้นแล้ว'};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.p).classList.add('active')});
(function init(){setEnabled(false);try{S.p=JSON.parse(localStorage.getItem(PRICE_KEY)||'{}');S.fx=JSON.parse(localStorage.getItem(FX_KEY)||'{}');S.drp=JSON.parse(localStorage.getItem(DR_PRICE_KEY)||'{}')}catch{}let db=null;try{db=JSON.parse(localStorage.getItem(DB_KEY)||'null')}catch{}if(!db?.records?.length)db=defaultDb();if(db?.records?.length)apply(db,false);else message(['โหลดฐานข้อมูลเริ่มต้นไม่สำเร็จ'])})();