const MC={US:'USD',HK:'HKD',JP:'JPY',VN:'VND',SG:'SGD',CN:'CNY',TW:'TWD',FR:'EUR',DE:'EUR',NL:'EUR',IT:'EUR',DK:'DKK'};
const H={us:'Symbol หุ้นอ้างอิง',un:'อ้างอิงหุ้น',desc:'รายละเอียดธุรกิจ',dr:'DR Symbol',ct:'ที่ตั้งธุรกิจ',mk:'จดทะเบียนในตลาดหลักทรัพย์',ra:'อัตราแปลงสภาพ',biz:'ธุรกิจหลัก (สั้น)',sector:'Sector',theme:'Thematic Category'};
const DB_KEY='fdr-db-v4';
const S={db:null,r:[],u:[],p:{},fx:{},selected:null};
const $=id=>document.getElementById(id);
const K=(s,m)=>String(s||'').toUpperCase()+'|'+String(m||'').toUpperCase();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>{const v=Number(String(x??'').replaceAll(',','').trim());return Number.isFinite(v)&&v>=0?v:null};
const fmt=(x,d=4)=>Number.isFinite(Number(x))?new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(Number(x)):'—';
const fxfmt=x=>Number.isFinite(Number(x))?(Number(x)<.01?Number(x).toFixed(8):Number(x)<1?Number(x).toFixed(6):Number(x).toFixed(4)).replace(/0+$/,'').replace(/\.$/,''):'—';

function ratio(v){
  const t=String(v??'').replaceAll(',','').trim();
  const m=t.match(/^([0-9.]+)\s*:\s*([0-9.]+)$/);
  if(!m||!(+m[1]>0)||!(+m[2]>0)) throw Error('Ratio ไม่ถูกต้อง: '+v);
  return {raw:t,upd:+m[2]/+m[1]};
}

function parse(buf,name){
  if(!window.XLSX) throw Error('โหลดตัวอ่าน Excel ไม่สำเร็จ');
  const w=XLSX.read(buf,{type:'array',cellFormula:true,cellText:true});
  const sh=w.Sheets.DR;
  if(!sh) throw Error('ไม่พบชีต DR');
  const a=XLSX.utils.sheet_to_json(sh,{header:1,defval:'',raw:false,blankrows:false});
  const hd=(a[0]||[]).map(x=>String(x??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim());
  const ix={};
  for(const [k,v] of Object.entries(H)){
    let i=hd.findIndex(x=>x===v||(k==='ra'&&x.startsWith(v)));
    ix[k]=i;
  }
  for(const k of ['us','un','dr','ct','mk','ra']) if(ix[k]<0) throw Error('ไม่พบคอลัมน์: '+H[k]);
  const r=[],warnings=[],seen=new Set();
  for(let i=1;i<a.length;i++){
    const row=a[i]||[];
    const g=k=>ix[k]>=0?String(row[ix[k]]??'').trim():'';
    const dr=g('dr').toUpperCase(),us=g('us').toUpperCase();
    if(!dr&&!us) continue;
    if(!dr){warnings.push('แถว '+(i+1)+': ไม่มี DR Symbol');continue}
    if(seen.has(dr)){warnings.push('แถว '+(i+1)+': DR ซ้ำ '+dr);continue}
    seen.add(dr);
    let q; try{q=ratio(g('ra'))}catch(e){warnings.push('แถว '+(i+1)+': '+e.message);continue}
    const market=g('mk').toUpperCase();
    r.push({
      excelRow:i+1,underlyingSymbol:us,underlyingName:g('un'),description:g('desc'),drSymbol:dr,
      country:g('ct'),market,currency:MC[market]||'',ratioRaw:q.raw,underlyingPerDr:q.upd,
      businessShort:g('biz'),sector:g('sector'),theme:g('theme')
    });
  }
  if(!r.length) throw Error('ไม่พบข้อมูล DR ที่ใช้งานได้');
  return {filename:name,sheet:'DR',recordCount:r.length,underlyingCount:new Set(r.map(x=>K(x.underlyingSymbol,x.market))).size,records:r,warnings};
}

function save(){
  localStorage.setItem('fdr-p',JSON.stringify(S.p));
  localStorage.setItem('fdr-fx',JSON.stringify(S.fx));
}
function message(items){
  const e=$('msg');
  if(!items||!items.length){e.classList.remove('show');e.innerHTML='';return}
  e.classList.add('show');e.innerHTML=items.map(esc).join('<br>');
}
function enabled(v){['getfx','psearch','dsearch','sectorFilter'].forEach(id=>$(id).disabled=!v)}

function apply(db,persist=true){
  S.db=db;S.r=db.records||[];
  const m=new Map();
  for(const x of S.r){
    const key=K(x.underlyingSymbol,x.market);
    if(!m.has(key)) m.set(key,{key,symbol:x.underlyingSymbol,name:x.underlyingName,market:x.market,currency:x.currency,count:0});
    m.get(key).count++;
  }
  S.u=[...m.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));
  if(persist) localStorage.setItem(DB_KEY,JSON.stringify(db));
  $('dbinfo').innerHTML=`<b>${esc(db.filename||'ฐานข้อมูล DR')}</b><br>${S.r.length} DR · ${S.u.length} หุ้นแม่ · มี Sector ${new Set(S.r.map(x=>x.sector).filter(Boolean)).size} หมวด`;
  $('status').textContent='พร้อมใช้ '+S.r.length+' DR';
  $('underlyingList').innerHTML=S.u.map(x=>`<option value="${esc(x.symbol)}">${esc(x.name)}</option>`).join('');
  const sectors=[...new Set(S.r.map(x=>x.sector).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  $('sectorFilter').innerHTML='<option value="">ทุก Sector</option>'+sectors.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  enabled(true);fxui();metrics();renderDirectory();selectFromSearch();message(db.warnings||[]);
}

function fair(x){
  const p=Number(S.p[K(x.underlyingSymbol,x.market)]),f=Number(S.fx[x.currency]?.rate);
  return Number.isFinite(p)&&Number.isFinite(f)&&f>0?p*f*x.underlyingPerDr:null;
}

function fxui(){
  if(!S.db) return;
  const cs=[...new Set(S.u.map(x=>x.currency).filter(Boolean))].sort();
  $('fxinfo').textContent='ต้องใช้ '+cs.join(', ')+' · พร้อม '+cs.filter(c=>Number.isFinite(Number(S.fx[c]?.rate))).length+'/'+cs.length;
  $('fxgrid').innerHTML=cs.map(c=>`<div class="fxi"><label>${c} → THB</label><input class="input" data-fx="${c}" inputmode="decimal" value="${S.fx[c]?.rate??''}" placeholder="FX"></div>`).join('');
  document.querySelectorAll('[data-fx]').forEach(e=>e.onchange=()=>{
    const v=num(e.value),c=e.dataset.fx;
    if(v&&v>0) S.fx[c]={rate:v,date:new Date().toISOString().slice(0,10),source:'Manual'}; else delete S.fx[c];
    save();fxui();metrics();renderSelected();
  });
}

async function getfx(){
  const cs=[...new Set(S.u.map(x=>x.currency).filter(Boolean))].sort(),errors=[];
  $('status').textContent='กำลังดึง FX…';$('getfx').disabled=true;
  await Promise.all(cs.map(async c=>{
    try{
      if(c==='THB'){S.fx[c]={rate:1,date:new Date().toISOString().slice(0,10),source:'Fixed'};return}
      const z=await fetch('https://api.frankfurter.dev/v2/rate/'+c+'/THB',{cache:'no-store'});
      if(!z.ok) throw Error('HTTP '+z.status);
      const j=await z.json();if(!(Number(j.rate)>0)) throw Error('ข้อมูลผิดรูปแบบ');
      S.fx[c]={rate:Number(j.rate),date:j.date||'',source:'Frankfurter'};
    }catch(e){errors.push(c+': '+e.message)}
  }));
  save();fxui();metrics();renderSelected();
  $('status').textContent=errors.length?'FX บางสกุลดึงไม่ได้':'FX พร้อมใช้';
  message([...(S.db?.warnings||[]),...errors]);$('getfx').disabled=false;
}

function metrics(){
  $('mDr').textContent=S.r.length||'—';$('mU').textContent=S.u.length||'—';
  $('mP').textContent=S.db?S.u.filter(x=>Number.isFinite(Number(S.p[x.key]))).length+'/'+S.u.length:'—';
  $('mF').textContent=S.db?S.r.filter(x=>fair(x)!=null).length+'/'+S.r.length:'—';
}

function findUnderlying(q){
  q=String(q||'').trim().toLowerCase();
  if(!q) return null;
  const exact=S.u.find(x=>x.symbol.toLowerCase()===q);
  if(exact) return exact;
  const matches=S.u.filter(x=>(x.symbol+' '+x.name).toLowerCase().includes(q));
  return matches.length===1?matches[0]:null;
}

function selectFromSearch(){
  const u=findUnderlying($('psearch').value);
  S.selected=u;
  renderSelected();
}

function renderSelected(){
  const box=$('selectedBox');
  if(!S.selected){
    box.classList.remove('show');
    $('ptbody').innerHTML='<tr><td colspan="9" class="empty">พิมพ์ค้นหาหุ้นแม่เพื่อแสดง Fair DR</td></tr>';
    $('pfoot').innerHTML='';return;
  }
  const u=S.selected;box.classList.add('show');
  $('selectedSymbol').textContent=u.symbol;$('selectedName').textContent=u.name+' · '+u.market+' · '+u.currency;
  $('selectedPrice').value=S.p[u.key]??'';$('selectedFxLabel').textContent=u.currency+' → THB';$('selectedFx').value=S.fx[u.currency]?.rate??'';
  const rows=S.r.filter(x=>K(x.underlyingSymbol,x.market)===u.key).sort((a,b)=>a.drSymbol.localeCompare(b.drSymbol));
  $('ptbody').innerHTML=rows.map(x=>{
    const v=fair(x),p=S.p[u.key],f=S.fx[u.currency]?.rate,status=v!=null?'<span class="ok">พร้อม</span>':'<span class="warn">ขาดราคา/FX</span>';
    return `<tr><td class="sym">${esc(x.drSymbol)}</td><td class="num fairv">${v==null?'—':fmt(v,6)}</td><td><span class="sym">${esc(x.underlyingSymbol)}</span><span class="sub">${esc(x.underlyingName)}</span></td><td>${esc(x.market)}</td><td>${esc(x.currency)}</td><td class="num">${fmt(p)}</td><td class="num">${fxfmt(f)}</td><td class="num">${esc(x.ratioRaw)}</td><td>${status}</td></tr>`;
  }).join('');
  $('pfoot').innerHTML=`<span>${rows.length} DR อ้างอิง ${esc(u.symbol)}</span><span>Fair DR เป็นบาทต่อ 1 DR</span>`;
}

function renderDirectory(){
  const q=$('dsearch').value.toLowerCase().trim(),sector=$('sectorFilter').value;
  const list=S.r.filter(x=>{
    const hay=[x.drSymbol,x.underlyingSymbol,x.underlyingName,x.businessShort,x.sector,x.theme,x.country,x.market].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!sector||x.sector===sector);
  });
  $('dtbody').innerHTML=list.length?list.map(x=>`<tr><td class="sym">${esc(x.drSymbol)}</td><td><span class="sym">${esc(x.underlyingSymbol)}</span><span class="sub">${esc(x.underlyingName)}</span></td><td>${esc(x.businessShort||'—')}</td><td><span class="sector-pill">${esc(x.sector||'—')}</span></td><td>${esc(x.theme||'—')}</td><td>${esc(x.country)}</td><td>${esc(x.market)}</td><td class="num">${esc(x.ratioRaw)}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">ไม่พบรายการ</td></tr>';
  $('dfoot').innerHTML=`<span>แสดง ${list.length} จาก ${S.r.length} DR</span><span>${sector?esc(sector):'ทุก Sector'}</span>`;
}

$('psearch').addEventListener('input',selectFromSearch);
$('selectedPrice').addEventListener('input',()=>{
  if(!S.selected) return;const v=num($('selectedPrice').value);
  if(v==null) delete S.p[S.selected.key];else S.p[S.selected.key]=v;
  save();metrics();renderSelected();
});
$('selectedFx').addEventListener('input',()=>{
  if(!S.selected) return;const v=num($('selectedFx').value),c=S.selected.currency;
  if(v&&v>0) S.fx[c]={rate:v,date:new Date().toISOString().slice(0,10),source:'Manual'};else delete S.fx[c];
  save();fxui();metrics();renderSelected();
});
$('dsearch').addEventListener('input',renderDirectory);
$('sectorFilter').addEventListener('change',renderDirectory);
$('getfx').onclick=getfx;
$('file').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{apply(parse(await f.arrayBuffer(),f.name),true);$('status').textContent='อัปเดตฐานข้อมูลแล้ว'}catch(z){message([z.message,'เปิดไฟล์ใน Excel และกด Save ก่อนอัปโหลดอีกครั้ง'])}
  e.target.value='';
};
$('resetDb').onclick=()=>{localStorage.removeItem(DB_KEY);apply(defaultDb(),false);$('status').textContent='ใช้ฐานข้อมูลเริ่มต้นแล้ว'};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');$(b.dataset.p).classList.add('active');
});

function defaultDb(){
  const pack={u:window.DR_U||[],r:window.DR_R||[]};
  const recs=pack.r.map((row,i)=>{
    const u=pack.u[row[0]]||[];
    return {excelRow:i+2,underlyingSymbol:u[0]||'',underlyingName:u[1]||'',description:'',drSymbol:row[1]||'',country:u[7]||'',market:u[2]||'',currency:u[3]||'',ratioRaw:row[2]||'',underlyingPerDr:Number(row[3])||0,businessShort:u[4]||'',sector:u[5]||'',theme:u[6]||''};
  });
  return {filename:'DR_160726_enriched.xlsx',sheet:'DR',recordCount:recs.length,underlyingCount:pack.u.length,records:recs,warnings:[]};
}

(function init(){
  enabled(false);
  try{S.p=JSON.parse(localStorage.getItem('fdr-p')||'{}');S.fx=JSON.parse(localStorage.getItem('fdr-fx')||'{}')}catch{}
  let db=null;try{db=JSON.parse(localStorage.getItem(DB_KEY)||'null')}catch{}
  if(!db?.records?.length) db=defaultDb();
  if(db?.records?.length) apply(db,false);else message(['โหลดฐานข้อมูลเริ่มต้นไม่สำเร็จ']);
})();