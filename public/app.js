
// ── Utility ──────────────────────────────────────────────────────────────────
function itemSlug(name){
  if(!name)return '';
  return name.toLowerCase().replace(/'/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function itemIcon(item, cls, lbl){
  const db=d2db.find(d=>d.name===item.name&&d.cat===item.cat);
  if(db&&db.imgUrl){
    const img=document.createElement('img');
    img.src=db.imgUrl;
    img.className='item-img-icon';
    img.loading='lazy';
    img.onerror=function(){this.style.display='none';};
    return img.outerHTML;
  }
  return '<div class="item-icon-placeholder '+cls+'">'+lbl+'</div>';
}

function dbStats(item){
  // Returns stats to display — own rolls if present, else db ranges
  const db=d2db.find(d=>d.name===item.name&&d.cat===item.cat);
  const owned=item.stats&&item.stats.length>0;
  if(owned){
    return {stats:item.stats, owned:true};
  }
  if(db&&db.stats){
    return {stats:db.stats, owned:false, db:true};
  }
  return {stats:[], owned:false};
}

// ── State ────────────────────────────────────────────────────────────────────
let items=[],chars=[],d2db=[];
let editId=null,acFocusIdx=-1;
let activeCat='', activeStatus='', viewMode='all';

const STATUS_LABEL={stored:'Sparad',equipped:'Utrustad',seeking:'Sökes',complete:'Komplett'};
const STATUS_ORDER=['stored','equipped','seeking','complete'];

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method,path,body){
  const r=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  return r.json();
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function loadAll(){
  try{
    [items,chars,d2db]=await Promise.all([
      api('GET','/api/items'),
      api('GET','/api/characters'),
      fetch('/d2db.json').then(r=>r.json())
    ]);
  }catch(e){
    console.error('loadAll error',e);
    items=items||[];chars=chars||[];d2db=d2db||[];
  }
  populateCharSelects();
  updateSidebarCounts();
  renderItems();
  renderSets();
  renderCharGrid();
  const ncn=document.getElementById('new-char-name');
  if(ncn) ncn.addEventListener('keydown',e=>{if(e.key==='Enter')addChar();});
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function filterCat(cat,el){
  activeCat=cat; activeStatus='';
  document.querySelectorAll('.sidebar-item').forEach(s=>s.classList.remove('active'));
  if(el) el.classList.add('active');
  const titles={'':`Alla Items`,'Unique':'Unique Items','Set':'Set Items','Runeword':'Runewords','Socketed':'Socketed Bases'};
  document.getElementById('page-title-text').textContent=titles[cat]||'Alla Items';
  showPage('stash');
  renderItems();
}

function filterStatus(status,el){
  activeCat=''; activeStatus=status;
  document.querySelectorAll('.sidebar-item').forEach(s=>s.classList.remove('active'));
  if(el) el.classList.add('active');
  const titles={seeking:'Sökes',equipped:'Utrustad',complete:'Komplett'};
  document.getElementById('page-title-text').textContent=titles[status]||status;
  showPage('stash');
  renderItems();
}

function updateSidebarCounts(){
  const counts={
    all: items.length,
    unique: items.filter(i=>i.cat==='Unique').length,
    set: items.filter(i=>i.cat==='Set').length,
    rune: items.filter(i=>i.cat==='Runeword').length,
    sock: items.filter(i=>i.cat==='Socketed').length,
    seeking: items.filter(i=>i.status==='seeking').length,
    equipped: items.filter(i=>i.status==='equipped').length,
    complete: items.filter(i=>i.status==='complete').length,
  };
  Object.entries(counts).forEach(([k,v])=>{
    const el=document.getElementById('sc-'+k);
    if(el) el.textContent=v;
  });

  const cards=document.getElementById('stat-cards');
  if(cards) cards.innerHTML=`
    <div class="stat-card"><div class="stat-card-label">Totalt</div><div class="stat-card-val">${counts.all}</div></div>
    <div class="stat-card"><div class="stat-card-label">Unika</div><div class="stat-card-val c-unique">${counts.unique}</div></div>
    <div class="stat-card"><div class="stat-card-label">Set-delar</div><div class="stat-card-val c-set">${counts.set}</div></div>
    <div class="stat-card"><div class="stat-card-label">Runewords</div><div class="stat-card-val c-sock">${counts.rune}</div></div>
  `;
}

// ── View mode ────────────────────────────────────────────────────────────────
function setViewMode(mode, btn){
  viewMode=mode;
  document.querySelectorAll('.vtbtn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderItems();
}

// ── Char selects ─────────────────────────────────────────────────────────────
function populateCharSelects(){
  const fs=document.getElementById('filter-char'),fc=document.getElementById('f-char');
  const cur=fs?fs.value:'';
  if(fs){fs.innerHTML='<option value="">Alla karaktärer</option>';}
  if(fc) fc.innerHTML='';
  const sorted=[...chars].sort((a,b)=>(a.order||0)-(b.order||0));
  sorted.forEach(c=>{
    const label=c.cls?`${c.name} (${c.cls})`:c.name;
    if(fs) fs.appendChild(new Option(label,c.name));
    if(fc) fc.appendChild(new Option(label,c.name));
  });
  if(fs) fs.value=cur||'';
  if(fc&&!fc.value&&sorted.length) fc.value=sorted[0].name;
}

// ── Render items ─────────────────────────────────────────────────────────────
function clsCode(cat){
  if(cat==='Unique')return 'u';
  if(cat==='Set')return 's';
  if(cat==='Runeword')return 'r';
  return 'k';
}
function clsLabel(cat){
  if(cat==='Unique')return 'U';
  if(cat==='Set')return 'S';
  if(cat==='Runeword')return 'R';
  return '⬡';
}

function charClsTag(charName){
  const c=chars.find(x=>x.name===charName);
  if(!c||!c.cls)return '';
  const cn='cls-'+c.cls.toLowerCase();
  return `<span class="cls-tag ${cn}">${c.cls}</span>`;
}

// Roll quality helper: returns css class based on where val falls in min-max range
function rollQuality(val, min, max){
  if(min===undefined||max===undefined||min===max)return 'roll-fixed';
  const v=parseFloat(val), lo=parseFloat(min), hi=parseFloat(max);
  if(isNaN(v)||isNaN(lo)||isNaN(hi))return 'roll-fixed';
  const pct=(v-lo)/(hi-lo);
  if(pct>=0.8)return 'roll-high';
  if(pct>=0.4)return 'roll-mid';
  return 'roll-low';
}

function renderStatLines(dbRef, ownedStats){
  const lines=[];
  if(!dbRef||!dbRef.stats) return lines;
  const savedMap={};
  if(ownedStats) ownedStats.filter(s=>s.name&&s.value&&s.name!=='Sockets').forEach(s=>savedMap[s.name]=s);

  dbRef.stats.slice(0,6).forEach((s,idx)=>{
    if(s.fixed){
      // Fixed stat — white, no roll
      const myRoll=savedMap[s.name];
      lines.push(`<div class="stat-line fixed">${s.name}${myRoll?`<span class="roll-fixed"> ✓</span>`:''}</div>`);
    } else if(s.variable===false){
      const label=(s.name||'').replace('%d',s.min||'').replace('%d%%',(s.min||'')+'%');
      const myRoll=Object.values(savedMap).find(r=>(s.name||'').includes(r.name.split(' ')[0]));
      lines.push(`<div class="stat-line">${label}${myRoll?`<span class="roll-fixed"> ${myRoll.value}</span>`:''}</div>`);
    } else {
      // Variable stat — show range, then roll quality if owned
      const base=(s.name||'').replace(/%d%?%?/g,'').trim();
      const range=s.min!==undefined&&s.max!==undefined&&s.min!==s.max?`${s.min}–${s.max}`:(s.min??s.max??'?');
      // Find matching saved roll by partial name match
      const rollKey=Object.keys(savedMap).find(k=>k.includes(base.slice(0,8))||base.includes(k.slice(0,8)));
      const myRoll=rollKey?savedMap[rollKey]:null;
      let rollHtml='';
      if(myRoll&&myRoll.value){
        const qcls=rollQuality(myRoll.value,s.min,s.max);
        rollHtml=`<span class="${qcls}">${myRoll.value}</span>`;
      }
      lines.push(`<div class="stat-line">${base} <span class="stat-range">(${range})</span>${rollHtml}</div>`);
    }
  });
  return lines;
}

function renderItems(){
  const charFilter=document.getElementById('filter-char')?.value||'';

  // Build db item list — unique by name+cat from d2db, filtered by active cat
  let dbItems=d2db.filter(d=>{
    if(activeCat&&d.cat!==activeCat)return false;
    if(activeStatus)return false; // status filter only applies to owned
    return true;
  });

  // Deduplicate db items by name+cat (some items appear multiple times)
  const seen=new Set();
  dbItems=dbItems.filter(d=>{
    const key=d.name+'|'+d.cat;
    if(seen.has(key))return false;
    seen.add(key);return true;
  });

  // For each db item, find owned instances
  const getOwned=(name,cat)=>items.filter(i=>i.name===name&&i.cat===cat&&(!charFilter||i.char===charFilter));

  // Apply view mode + status filter
  let displayItems=dbItems;
  if(activeStatus){
    // Status filter: only show owned items with that status
    displayItems=dbItems.filter(d=>{
      const owned=getOwned(d.name,d.cat);
      return owned.some(o=>o.status===activeStatus);
    });
  } else if(viewMode==='mine'){
    displayItems=dbItems.filter(d=>getOwned(d.name,d.cat).length>0);
  } else if(viewMode==='missing'){
    displayItems=dbItems.filter(d=>getOwned(d.name,d.cat).length===0);
  }

  updateSidebarCounts();

  const list=document.getElementById('item-list');
  if(!displayItems.length){
    list.innerHTML=`<tr><td colspan="6"><div class="empty-state">Inga items matchar filtret</div></td></tr>`;
    return;
  }

  list.innerHTML=displayItems.map(dbItem=>{
    // Use dbItem for display, owned instances for char/status info
    const isOwnedItem='id' in dbItem; // came from items[] via status filter
    const d=isOwnedItem?d2db.find(x=>x.name===dbItem.name&&x.cat===dbItem.cat)||dbItem:dbItem;
    const ownedList=isOwnedItem?[dbItem]:getOwned(d.name,d.cat);
    const isOwned=ownedList.length>0;

    const cls=clsCode(d.cat);
    const lbl=clsLabel(d.cat);
    const rlvl=d.rlvl||'—';

    let sublabel='';
    if(d.cat==='Set'&&d.setname) sublabel=d.setname;
    else if(d.cat==='Runeword'&&d.runes) sublabel=(d.runes||[]).join(' + ');

    // Stats with roll quality
    const firstOwned=ownedList[0];
    const ownedStats=firstOwned?.stats||[];
    const statLines=renderStatLines(d, isOwned?ownedStats:[]);

    // Sockets
    const sockStat=firstOwned?.stats?.find(s=>s.name==='Sockets'&&s.value);

    // Char/owner display
    let charCell='<span class="unowned-badge">—</span>';
    if(isOwned){
      charCell=ownedList.map(oi=>{
        const c=chars.find(x=>x.name===oi.char);
        const clsTag=c&&c.cls?`<span class="char-badge-cls">${c.cls}</span>`:'';
        return `<div class="owned-badge">📍 ${oi.char||'?'}${clsTag}</div>`;
      }).join('<br>');
    }

    // Row class based on view mode
    let rowCls='';
    if(viewMode==='all'){
      rowCls=isOwned?'owned-highlight':'unowned';
    } else if(viewMode==='missing'){
      rowCls='missing-highlight';
    }

    // For status pill — use first owned item if exists
    const statusCell=isOwned&&firstOwned?
      `<button class="status-pill ${firstOwned.status}" onclick="cycleStatus('${firstOwned.id}')">${STATUS_LABEL[firstOwned.status]||firstOwned.status}</button>`:
      `<span class="unowned-badge">Ej i stash</span>`;

    // Click — edit if owned, add if not
    const safeName=d.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const nameClick=isOwned?`openEdit('${firstOwned.id}')`:`openAddFromDB(d2db.find(x=>x.name==='${safeName}'))`;
    const delCell=isOwned&&firstOwned?`<button class="del-btn" onclick="deleteItem('${firstOwned.id}')">×</button>`:'';

    return `<tr class="${rowCls}" ${isOwned?`data-id="${firstOwned.id}"`:''}>
      <td class="td-name">
        <div class="item-name-wrap">
          ${itemIcon(d,cls,lbl)}
          <div class="item-name-info">
            <span class="item-name-main ${cls}"
              onclick="${nameClick}"
              onmouseenter="showTooltipDB(event,this.dataset.name,this.dataset.cat)"
              data-name="${d.name}" data-cat="${d.cat}"
              onmouseleave="hideTooltip()">${d.name}</span>
            ${sublabel?`<div class="item-name-sub">${sublabel}</div>`:''}
            ${sockStat?`<div class="item-name-sub">⬡ ${sockStat.value} sockets</div>`:''}
          </div>
        </div>
      </td>
      <td class="td-lvl"><span class="rlvl-val">${rlvl}</span></td>
      <td class="td-stats">${statLines.join('')||'<span style="color:var(--text3);font-size:12px">—</span>'}</td>
      <td class="td-char">${charCell}</td>
      <td class="td-status">${statusCell}</td>
      <td class="td-act">${delCell}</td>
    </tr>`;
  }).join('');
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
function showTooltipDB(e, name, cat){
  if(!name||!d2db||!d2db.length)return;
  const dbRef=d2db.find(d=>d.name===name&&d.cat===cat);
  const ownedList=items.filter(i=>i.name===name&&i.cat===cat);
  const item=ownedList[0]||{name,cat,stats:[],char:null};
  _renderTooltip(e, item, dbRef, ownedList);
}

function showTooltip(e,id){
  const item=items.find(i=>i.id===id);
  if(!item)return;
  const dbRef=d2db.find(d=>d.name===item.name&&d.cat===item.cat);
  _renderTooltip(e, item, dbRef, [item]);
}

function _renderTooltip(e, item, dbRef, ownedList){
  const cls=clsCode(item.cat);
  const tt=document.getElementById('item-tooltip');

  let html='<div class="tt-inner">';

  // Item image if available
  if(dbRef&&dbRef.imgUrl){
    html+=`<div style="text-align:center;margin-bottom:8px"><img src="${dbRef.imgUrl}" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated" onerror="this.style.display='none'"></div>`;
  }

  // Item name — colored by type
  html+=`<div class="tt-name ${cls}">${item.name}</div>`;

  // Base type or set name
  if(item.setname) html+=`<div class="tt-base">${item.setname}</div>`;
  else if(item.cat==='Runeword'&&dbRef&&dbRef.base) html+=`<div class="tt-base">${(dbRef.base||[]).join('/')}</div>`;

  html+='<div class="tt-divider"></div>';

  // Base stats (white) — rlvl, req str, etc from DB
  if(dbRef&&dbRef.rlvl) html+=`<div class="tt-prop white center">Required Level: ${dbRef.rlvl}</div>`;

  // Runeword recipe
  if(item.cat==='Runeword'&&dbRef&&dbRef.runes){
    html+=`<div class="tt-divider"></div>`;
    html+=`<div class="tt-prop gold center">${dbRef.runes.join(' + ')}</div>`;
    html+=`<div class="tt-prop gray center">${dbRef.sockets} Sockets</div>`;
    html+=`<div class="tt-divider"></div>`;
  }

  // Stats — saved rolls take priority, gold colored
  // DB stats as fallback, blue colored like D2
  if(item.stats&&item.stats.length){
    const sockStat=item.stats.find(s=>s.name==='Sockets'&&s.value);
    item.stats.filter(s=>s.name!=='Sockets'&&s.value).forEach(s=>{
      const raw=s.name||'';
      const val=s.value||'';
      const label=raw.replace('%d',val).replace('%d%%',val+'%').replace(/X$/,val);
      const display=label.includes(val)?label:`${label}: ${val}`;
      html+=`<div class="tt-prop blue">${display}</div>`;
    });
    if(sockStat) html+=`<div class="tt-divider"></div><div class="tt-prop sockets gray center">Socketed (${sockStat.value})</div>`;
  } else if(dbRef&&dbRef.stats){
    // Show DB stats with D2 coloring
    dbRef.stats.slice(0,8).forEach(s=>{
      if(s.fixed){
        html+=`<div class="tt-prop white">${s.name}</div>`;
      } else if(s.variable===false){
        const label=(s.name||'').replace('%d',s.min||'').replace('%d%%',(s.min||'')+'%');
        html+=`<div class="tt-prop blue">${label}</div>`;
      } else {
        // Variable stat — show range in gold
        const base=(s.name||'').replace(/%d%?%?/g,'').trim();
        const range=s.min!==undefined&&s.max!==undefined&&s.min!==s.max?`${s.min}–${s.max}`:s.min||s.max||'';
        html+=`<div class="tt-prop blue">${base} <span style="color:#c8952a">(${range})</span></div>`;
      }
    });
    if(dbRef.sockets) html+=`<div class="tt-divider"></div><div class="tt-prop gray center">Can be socketed (${dbRef.sockets.min}–${dbRef.sockets.max})</div>`;
  }

  if(item.notes){
    html+=`<div class="tt-divider"></div><div class="tt-prop gray">${item.notes}</div>`;
  }

function positionTooltip(e,tt){
  tt.style.display='block';
  const x=e.clientX+16, y=e.clientY-10;
  const tw=tt.offsetWidth, th=tt.offsetHeight;
  const wx=window.innerWidth, wy=window.innerHeight;
  tt.style.left=(x+tw>wx?x-tw-32:x)+'px';
  tt.style.top=(y+th>wy?y-th+20:y)+'px';
}

function hideTooltip(){
  document.getElementById('item-tooltip').classList.remove('visible');
}

// ── Universal Search ──────────────────────────────────────────────────────────
function handleUniSearch(){
  const q=document.getElementById('unisearch').value.trim().toLowerCase();
  const ac=document.getElementById('autocomplete');
  acFocusIdx=-1;
  if(q.length<2){ac.style.display='none';return;}
  if(!d2db||!d2db.length){ac.style.display='none';return;}

  const stashMatches=items.filter(i=>
    i.name.toLowerCase().includes(q)||
    (i.setname||'').toLowerCase().includes(q)||
    (i.char||'').toLowerCase().includes(q)
  );
  const stashNames=new Set(stashMatches.map(i=>i.name));
  const dbNew=d2db.filter(d=>d.name.toLowerCase().includes(q)&&!stashNames.has(d.name)).slice(0,8);

  let html='';

  if(stashMatches.length){
    html+=`<div class="ac-section-hdr">I din stash (${stashMatches.length})</div>`;
    // Group by name for sets
    const byName={};
    stashMatches.forEach(i=>{if(!byName[i.name])byName[i.name]=[];byName[i.name].push(i);});
    Object.entries(byName).forEach(([name,list])=>{
      const first=list[0];
      const cls=clsCode(first.cat);
      const sub=first.setname?`<div class="ac-sub">${first.setname}</div>`:'';
      const isSet=first.cat==='Set'&&first.setname;
      const locs=list.map(i=>`<span class="ac-loc">${i.char||'—'}</span>`).join(' ');
      html+=`<div class="ac-row" data-action="${isSet?'viewset':'edit'}" data-id="${first.id}" data-setname="${first.setname||''}">
        <div class="item-icon-placeholder ${cls}" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${clsLabel(first.cat)}</div>
        <div style="flex:1;min-width:0">
          <div class="ac-name ${cls}">${name}</div>${sub}
        </div>
        <div class="ac-right">${locs}<button class="ac-btn ${isSet?'viewset':'edit'}">${isSet?'Visa set':'Redigera'}</button></div>
      </div>`;
    });
  }

  if(dbNew.length){
    html+=`<div class="ac-section-hdr">Lägg till</div>`;
    dbNew.forEach(db=>{
      const cls=clsCode(db.cat);
      const sub=db.setname?`<div class="ac-sub">${db.setname}</div>`:
        db.cat==='Runeword'&&db.runes?`<div class="ac-sub rw">${db.runes.join(' + ')} · ${db.sockets}os · ${(db.base||[]).join(', ')}</div>`:'';
      const isSet=db.cat==='Set'&&db.setname;
      html+=`<div class="ac-row" data-action="${isSet?'addset':'adddb'}" data-name="${encodeURIComponent(db.name)}" data-setname="${db.setname||''}">
        <div class="item-icon-placeholder ${cls}" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${clsLabel(db.cat)}</div>
        <div style="flex:1;min-width:0">
          <div class="ac-name ${cls}">${db.name}</div>${sub}
        </div>
        <div class="ac-right"><button class="ac-btn add">${isSet?'Lägg till set':'+ Lägg till'}</button></div>
      </div>`;
    });
  }

  const rawQ=document.getElementById('unisearch').value.trim();
  html+=`<div class="ac-new-row" id="ac-new-custom">
    <span>Lägg till "<strong>${rawQ}</strong>" manuellt</span>
  </div>`;

  ac.innerHTML=html;
  ac.style.display='block';

  ac.querySelectorAll('.ac-row[data-action="edit"]').forEach(el=>{
    el.addEventListener('click',()=>{openEdit(el.dataset.id);closeAC();});
  });
  ac.querySelectorAll('.ac-row[data-action="viewset"]').forEach(el=>{
    el.addEventListener('click',()=>{openSetModal(el.dataset.setname);closeAC();});
  });
  ac.querySelectorAll('.ac-row[data-action="adddb"]').forEach(el=>{
    el.addEventListener('click',()=>{
      const db=d2db.find(d=>d.name===decodeURIComponent(el.dataset.name));
      if(db){openAddFromDB(db);closeAC();}
    });
  });
  ac.querySelectorAll('.ac-row[data-action="addset"]').forEach(el=>{
    el.addEventListener('click',()=>{openSetModal(el.dataset.setname,true);closeAC();});
  });
  document.getElementById('ac-new-custom')?.addEventListener('click',()=>{
    openAddCustom(document.getElementById('unisearch').value.trim());closeAC();
  });
}

function handleUniKey(e){
  const ac=document.getElementById('autocomplete');
  if(ac.style.display==='none')return;
  const rows=ac.querySelectorAll('.ac-row,.ac-new-row');
  if(e.key==='ArrowDown'){acFocusIdx=Math.min(acFocusIdx+1,rows.length-1);updateACFocus(rows);e.preventDefault();}
  else if(e.key==='ArrowUp'){acFocusIdx=Math.max(acFocusIdx-1,0);updateACFocus(rows);e.preventDefault();}
  else if(e.key==='Enter'&&acFocusIdx>=0){rows[acFocusIdx].click();e.preventDefault();}
  else if(e.key==='Escape'){closeAC();}
}
function updateACFocus(rows){
  rows.forEach((r,i)=>r.classList.toggle('focused',i===acFocusIdx));
  if(rows[acFocusIdx])rows[acFocusIdx].scrollIntoView({block:'nearest'});
}
function closeAC(){document.getElementById('autocomplete').style.display='none';acFocusIdx=-1;}
document.addEventListener('click',e=>{
  if(!document.getElementById('unisearch').contains(e.target)&&
     !document.getElementById('autocomplete').contains(e.target))closeAC();
});

// ── Modal helpers ─────────────────────────────────────────────────────────────
function showFromDB(dbItem){
  const cls=clsCode(dbItem.cat);
  document.getElementById('mic-name').textContent=dbItem.name;
  document.getElementById('mic-name').className='mic-name '+cls;
  let sub=dbItem.setname||'';
  if(dbItem.cat==='Runeword'&&dbItem.runes)
    sub=(dbItem.runes.join(' + '))+' · '+(dbItem.sockets||'?')+'os · '+((dbItem.base||[]).join(', '))+' · Rlvl '+(dbItem.rlvl||'?');
  document.getElementById('mic-sub').textContent=sub;
  document.getElementById('modal-item-card').style.display='block';
  document.getElementById('f-name-row').style.display='none';
  document.getElementById('f-cat-row').style.display='none';
  document.getElementById('f-setname-row').style.display='none';
  document.getElementById('f-cat').value=dbItem.cat;
  document.getElementById('f-name').value=dbItem.name;
  document.getElementById('f-setname').value=dbItem.setname||'';
}

function showManual(){
  document.getElementById('modal-item-card').style.display='none';
  document.getElementById('f-name-row').style.display='block';
  document.getElementById('f-cat-row').style.display='block';
  toggleSetName();
}

function openAddFromDB(dbItem){
  editId=null; clearModal();
  document.getElementById('modal-hdr').textContent='Lägg till item';
  showFromDB(dbItem);
  document.getElementById('f-char').value=chars[0]?.name||'';
  document.getElementById('f-status').value='stored';
  renderStructuredStats(dbItem);
  document.getElementById('modal').classList.add('open');
  document.getElementById('unisearch').value='';
}

function openAddCustom(name){
  editId=null; clearModal();
  document.getElementById('modal-hdr').textContent='Lägg till item';
  showManual();
  document.getElementById('f-name').value=name||'';
  document.getElementById('f-cat').value='Unique';
  document.getElementById('f-setname').value='';
  document.getElementById('f-char').value=chars[0]?.name||'';
  document.getElementById('f-status').value='stored';
  document.getElementById('modal').classList.add('open');
  document.getElementById('unisearch').value='';
}

function openEdit(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  editId=id; clearModal();
  document.getElementById('modal-hdr').textContent='Redigera item';
  const dbRef=d2db.find(d=>d.name===item.name&&d.cat===item.cat);
  if(dbRef){showFromDB(dbRef);}else{
    showFromDB({name:item.name,cat:item.cat,setname:item.setname||'',runes:null});
  }
  document.getElementById('f-char').value=item.char||'';
  document.getElementById('f-status').value=item.status||'stored';
  document.getElementById('f-notes').value=item.notes||'';
  renderStructuredStats(dbRef||null);
  if(item.stats&&item.stats.length){
    item.stats.forEach(sv=>{
      if(sv.name==='Sockets'){
        const si=document.querySelector('[data-stat="sockets"]');
        if(si)si.value=sv.value;return;
      }
      const inp=document.querySelector(`#stats-rows input[data-stat]:not([data-stat="sockets"])[data-statname="${sv.name.replace(/"/g,'')}"]`);
      if(inp)inp.value=sv.value;
      else addCustomStatRow(sv.name,sv.value);
    });
  }
  document.getElementById('modal').classList.add('open');
  hideTooltip();
}

function closeModal(){document.getElementById('modal').classList.remove('open');}
function clearModal(){
  document.getElementById('stats-rows').innerHTML='';
  document.getElementById('stats-custom').innerHTML='';
  document.getElementById('f-notes').value='';
}
function toggleSetName(){
  document.getElementById('f-setname-row').style.display=
    document.getElementById('f-cat').value==='Set'?'block':'none';
}

// ── Structured stats (Traderie pill style) ────────────────────────────────────
function renderStructuredStats(dbItem){
  const container=document.getElementById('stats-rows');
  container.innerHTML='';
  if(!dbItem||!dbItem.stats) return;

  if(dbItem.sockets){
    const {min,max}=dbItem.sockets;
    const range=min===max?`${min}`:`${min}–${max}`;
    const row=document.createElement('div');
    row.className='stat-pill-sockets';
    row.innerHTML=`<span class="stat-pill-label">Sockets</span><span class="stat-range-hint">(${range})</span><input type="number" class="stat-pill-input sock-input" min="${min}" max="${max}" placeholder="" data-stat="sockets" style="width:60px">`;
    container.appendChild(row);
  }

  dbItem.stats.forEach((s,i)=>{
    const row=document.createElement('div');
    row.className='stat-pill-row';
    if(s.fixed||(s.variable===false&&!s.variable)){
      const label=s.fixed?s.name:(s.name||'').replace('%d',s.min).replace('%d%%',s.min+'%');
      row.innerHTML=`<span class="stat-pill-label fixed">${label}</span>`;
    } else {
      const label=(s.name||'').replace(/%d%?%?/g,'').trim().replace(/\s+/g,' ');
      const range=s.min!==undefined&&s.max!==undefined&&s.min!==s.max?`${s.min}–${s.max}`:`${s.min??s.max??''}`;
      row.innerHTML=`<span class="stat-pill-label">${label}</span><span class="stat-range-hint">(${range})</span><input type="text" class="stat-pill-input" placeholder="" data-stat="${i}" data-statname="${(s.name||'').replace(/"/g,'')}">`;
    }
    container.appendChild(row);
  });
}

function addCustomStatRow(name='',value=''){
  const c=document.getElementById('stats-custom');
  const row=document.createElement('div');row.className='custom-stat-row';
  row.innerHTML=`<input type="text" placeholder="Stat..." value="${name}"><input type="text" style="width:90px" placeholder="Värde" value="${value}"><button class="remove-stat" onclick="this.parentElement.remove()">×</button>`;
  c.appendChild(row);
}
function addStatRow(n='',v=''){addCustomStatRow(n,v);}

function getStats(){
  const stats=[];
  const si=document.querySelector('[data-stat="sockets"]');
  if(si&&si.value)stats.push({name:'Sockets',value:si.value});
  document.querySelectorAll('#stats-rows input[data-stat]:not([data-stat="sockets"])').forEach(inp=>{
    if(inp.value.trim())stats.push({name:inp.dataset.statname||inp.dataset.stat,value:inp.value.trim()});
  });
  document.querySelectorAll('#stats-custom .custom-stat-row').forEach(row=>{
    const inputs=row.querySelectorAll('input');
    const n=inputs[0]?.value.trim(),v=inputs[1]?.value.trim();
    if(n)stats.push({name:n,value:v});
  });
  return stats;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function saveItem(){
  const fromDB=document.getElementById('modal-item-card').style.display!=='none';
  const name=fromDB?document.getElementById('mic-name').textContent.trim():document.getElementById('f-name').value.trim();
  if(!name)return;
  const cat=document.getElementById('f-cat').value;
  const setname=fromDB?document.getElementById('mic-sub').textContent.split('·')[0].trim():document.getElementById('f-setname').value.trim();
  const payload={name,cat,setname,
    char:document.getElementById('f-char').value,
    status:document.getElementById('f-status').value,
    stats:getStats(),
    notes:document.getElementById('f-notes').value.trim()
  };
  if(editId){
    const updated=await api('PUT',`/api/items/${editId}`,payload);
    items[items.findIndex(i=>i.id===editId)]=updated;
    toast('Item uppdaterat');
  } else {
    items.unshift(await api('POST','/api/items',payload));
    toast('Item tillagt');
  }
  closeModal();updateSidebarCounts();renderItems();renderSets();
}

async function deleteItem(id){
  if(!confirm('Ta bort item?'))return;
  await api('DELETE',`/api/items/${id}`);
  items=items.filter(i=>i.id!==id);
  updateSidebarCounts();renderItems();renderSets();toast('Borttaget');
}

async function cycleStatus(id){
  const item=items.find(i=>i.id===id);if(!item)return;
  item.status=STATUS_ORDER[(STATUS_ORDER.indexOf(item.status)+1)%STATUS_ORDER.length];
  await api('PUT',`/api/items/${id}`,item);
  renderItems();renderSets();updateSidebarCounts();toast('Status uppdaterad');
}

// ── Sets ──────────────────────────────────────────────────────────────────────
function renderSets(){
  const setItems=items.filter(i=>i.cat==='Set'&&i.setname);
  const groups={};
  setItems.forEach(i=>{if(!groups[i.setname])groups[i.setname]=[];groups[i.setname].push(i);});
  const content=document.getElementById('sets-content');
  if(!Object.keys(groups).length){content.innerHTML='<div class="empty-state">Inga set-delar registrerade än</div>';return;}
  content.innerHTML=Object.entries(groups).map(([setname,parts])=>{
    const hasAll=parts.every(p=>p.status!=='seeking');
    return `<div class="set-group">
      <div class="set-group-header">
        <span class="set-group-name">${setname}</span>
        <span class="set-group-meta">${parts.length} delar${hasAll?' · KOMPLETT':''}</span>
      </div>
      <div class="set-group-body">
        ${parts.map(p=>`<div class="set-row">
          <div>
            <div class="set-row-name">${p.name}</div>
            ${p.stats&&p.stats.length?`<div class="set-row-stats">${p.stats.slice(0,2).map(s=>`${s.name}: ${s.value}`).join(' · ')}</div>`:''}
          </div>
          <div class="set-row-right">
            <span class="set-row-char">${p.char||'—'}</span>
            <button class="status-pill ${p.status}" onclick="cycleStatus('${p.id}')">${STATUS_LABEL[p.status]}</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ── Set modal ─────────────────────────────────────────────────────────────────
function openSetModal(setname,addMode=false){
  if(!setname)return;
  const dbParts=d2db.filter(d=>d.cat==='Set'&&d.setname===setname);
  const stashParts=items.filter(i=>i.cat==='Set'&&i.setname===setname);
  document.getElementById('set-modal-hdr').textContent=setname;
  let html='';
  if(addMode) html+=`<p style="font-size:13px;color:var(--text3);margin-bottom:1rem;font-style:italic">${dbParts.length} delar i detta set. Lägg till de du har:</p>`;
  else{
    const have=stashParts.length,total=dbParts.length;
    html+=`<p style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--text3);margin-bottom:1rem">${have}/${total} DELAR HITTADE</p>`;
  }
  dbParts.forEach(db=>{
    const stash=stashParts.find(s=>s.name===db.name);
    html+=`<div class="set-part">
      <div class="set-part-icon">S</div>
      <div class="set-part-info">
        <div class="set-part-name">${db.name}</div>
        ${(db.stats||[]).filter(s=>s.fixed).slice(0,2).map(s=>`<div class="set-part-stats">${s.name}</div>`).join('')}
        <div class="set-part-loc ${stash?'found':'missing'}">
          ${stash?`📍 ${stash.char} · ${STATUS_LABEL[stash.status]}`:'⚠ Ej i stash'}
        </div>
      </div>
      <div style="flex-shrink:0">
        ${stash
          ?`<button class="btn" onclick="openEdit('${stash.id}');closeSetModal()">Redigera</button>`
          :`<button class="btn primary" onclick="openAddFromDB(d2db.find(d=>d.name==='${db.name.replace(/'/g,"\\'")}'));closeSetModal()">+ Lägg till</button>`
        }
      </div>
    </div>`;
  });
  document.getElementById('set-modal-body').innerHTML=html;
  document.getElementById('set-modal').classList.add('open');
}
function closeSetModal(){document.getElementById('set-modal').classList.remove('open');}

// ── Char management ───────────────────────────────────────────────────────────
function renderCharGrid(){
  const list=document.getElementById('char-list');
  const sorted=[...chars].sort((a,b)=>(a.order||0)-(b.order||0));
  list.innerHTML=sorted.map(c=>{
    const cn=c.cls?'cls-'+c.cls.toLowerCase():'cls-bank';
    const badge=`<span class="cls-tag ${cn}">${c.cls||'Bank'}</span>`;
    return `<div class="char-list-item" draggable="true" data-char-id="${c.id}">
      <span class="drag-handle">⠿</span>
      ${badge}
      <input type="text" class="char-name-input" value="${c.name}" data-char-id="${c.id}">
      <select class="char-cls-select" data-char-id="${c.id}">
        <option value="">Klass...</option>
        ${['Amazon','Barbarian','Druid','Necromancer','Paladin','Sorceress','Assassin','Warlock','Bank'].map(cl=>`<option value="${cl}"${c.cls===cl?' selected':''}>${cl}</option>`).join('')}
      </select>
      <button class="btn danger" onclick="removeChar(${c.id})" style="height:28px;padding:0 8px;font-size:9px">Ta bort</button>
    </div>`;
  }).join('');

  let dragSrc=null;
  list.querySelectorAll('.char-list-item').forEach(el=>{
    el.addEventListener('dragstart',e=>{dragSrc=el;e.dataTransfer.effectAllowed='move';el.style.opacity='.4';});
    el.addEventListener('dragend',()=>{el.style.opacity='1';list.querySelectorAll('.char-list-item').forEach(r=>r.classList.remove('drag-over'));});
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');});
    el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
    el.addEventListener('drop',e=>{
      e.preventDefault();el.classList.remove('drag-over');
      if(dragSrc===el)return;
      const all=[...list.querySelectorAll('.char-list-item')];
      if(all.indexOf(dragSrc)<all.indexOf(el))el.after(dragSrc);else el.before(dragSrc);
      const newOrder=[...list.querySelectorAll('.char-list-item')].map(r=>r.dataset.charId);
      chars=[...chars].sort((a,b)=>newOrder.indexOf(String(a.id))-newOrder.indexOf(String(b.id)));
      chars=chars.map((c,i)=>({...c,order:i+1}));
      populateCharSelects();
    });
  });

  list.querySelectorAll('.char-cls-select').forEach(sel=>{
    sel.addEventListener('change',()=>{
      const c=chars.find(x=>x.id==sel.dataset.charId);
      if(c){c.cls=sel.value;renderCharGrid();}
    });
  });
}

function addChar(){
  const nameEl=document.getElementById('new-char-name');
  const name=nameEl.value.trim();if(!name)return;
  const cls=document.getElementById('new-char-cls').value;
  const newId=Math.max(0,...chars.map(c=>c.id))+1;
  chars.push({id:newId,name,cls,type:cls==='Bank'?'bank':'active',order:chars.length+1});
  nameEl.value='';document.getElementById('new-char-cls').value='';
  populateCharSelects();renderCharGrid();
}

function removeChar(id){
  if(!confirm('Ta bort karaktär?'))return;
  chars=chars.filter(c=>c.id!==id);
  chars=chars.map((c,i)=>({...c,order:i+1}));
  populateCharSelects();renderCharGrid();
}

async function saveChars(){
  document.querySelectorAll('#char-list input[data-char-id]').forEach(inp=>{
    const c=chars.find(x=>x.id==inp.dataset.charId);
    if(c&&inp.value.trim())c.name=inp.value.trim();
  });
  const ordered=chars.map((c,i)=>({...c,order:i+1}));
  await api('PUT','/api/characters',ordered);
  chars=ordered;populateCharSelects();renderItems();renderCharGrid();
  toast('Karaktärer sparade');
}

async function resetChars(){
  if(!confirm('Återställ?'))return;
  await api('PUT','/api/characters',null);await loadAll();toast('Återställt');
}

// ── Data export/import ────────────────────────────────────────────────────────
function exportData(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify({items,chars},null,2)],{type:'application/json'}));
  a.download=`d2r-stash-${new Date().toISOString().slice(0,10)}.json`;a.click();
}
function importData(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(data.items)for(const item of data.items)await api('POST','/api/items',item);
      if(data.chars)await api('PUT','/api/characters',data.chars);
      await loadAll();toast('Import klar');
    }catch{toast('Fel vid import');}
  };
  reader.readAsText(file);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+name);
  if(pg) pg.classList.add('active');
  if(name==='sets') renderSets();
  if(name==='settings') renderCharGrid();
}

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal'))closeModal();});
document.getElementById('set-modal').addEventListener('click',e=>{if(e.target===document.getElementById('set-modal'))closeSetModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeSetModal();closeAC();hideTooltip();}});

loadAll();

}