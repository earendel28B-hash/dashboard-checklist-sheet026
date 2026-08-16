(()=>{
  const LIMITS={normal:2.3,watch:4.5,alert:7.1};
  const DRIVE_PULLEY_POINTS=new Map([
    [2,'Pulley Primary - L'],[3,'Pulley Primary - R'],
    [7,'Pulley Secondery - L'],[8,'Pulley Secondery - R'],
    [12,'Pulley Take-up - L'],[13,'Pulley Take-up - R'],
    [17,'Pulley Tail - L'],[18,'Pulley Tail - R']
  ]);
  const num=v=>{const s=String(v??'').trim().replace(',','.');if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null};
  const isGearbox=i=>/^gear\s*box$/i.test(String(i?.item||'').trim())||/^gearbox$/i.test(String(i?.item||'').trim());
  const isPulleyPoint=i=>DRIVE_PULLEY_POINTS.has(Number(i?.no))||(/^pulley\b/i.test(String(i?.section||'').trim())&&/^(?:grease\s+)?[lr]$/i.test(String(i?.item||'').trim()));
  const pointLabel=i=>isGearbox(i)?`${i.section} - Gear Box`:(DRIVE_PULLEY_POINTS.get(Number(i?.no))||`${i.section} - ${/\bR$/i.test(i.item)?'R':'L'}`);

  function records(){try{return typeof filteredDashboardRecords==='function'?filteredDashboardRecords():[]}catch(e){console.warn('vibration records',e);return []}}
  function templateFor(r){try{return typeof getTemplateForRecord==='function'?getTemplateForRecord(r):CHECKLIST_TEMPLATES?.drive_station}catch(e){return null}}
  function currentTemplate(){try{return CHECKLIST_TEMPLATES[currentChecklistKey]||CHECKLIST_TEMPLATES.drive_station}catch(e){return null}}
  function isDriveStationRecord(r){const d=r?.data||{};return !d.checklist_type||d.checklist_type==='drive_station'||/drive station/i.test(String(d.checklist_name||''))}

  function pointMap(){
    const map=new Map();
    const add=t=>t?.items?.forEach(i=>{
      if(isGearbox(i))map.set(`gearbox|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
      else if(isPulleyPoint(i))map.set(`pulley|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
    });
    records().forEach(r=>add(templateFor(r)));add(currentTemplate());
    DRIVE_PULLEY_POINTS.forEach((label,n)=>map.set(`pulley|||${n}|||${label}`,label));
    return map;
  }

  function rebuildPointOptions(preferred){
    const sel=document.getElementById('vibrationPoint');if(!sel)return;
    const previous=preferred||sel.dataset.vibSelected||sel.value;
    const arr=[...pointMap().entries()].sort((a,b)=>a[1].localeCompare(b[1],'th'));
    sel.innerHTML=arr.length?arr.map(([v,l])=>`<option value="${v.replace(/"/g,'&quot;')}">${l}</option>`).join(''):'<option value="">ไม่พบจุดวัด Gearbox / Pulley</option>';
    if(arr.some(([v])=>v===previous))sel.value=previous;else if(arr.length)sel.value=arr[0][0];
    sel.dataset.vibSelected=sel.value;
  }

  function configureDisplay(){const display=document.getElementById('vibrationDisplayMode');if(display){display.innerHTML='<option value="selected">จุดที่เลือก</option>';display.value='selected';display.onchange=null;display.removeAttribute('onchange')}}
  function configureSelector(){
    const sel=document.getElementById('vibrationPoint');if(!sel||sel.dataset.vibBound==='1')return;
    sel.onchange=null;sel.removeAttribute('onchange');
    sel.addEventListener('change',function(e){this.dataset.vibSelected=this.value;e.stopImmediatePropagation();draw(this.value,false)});
    sel.dataset.vibBound='1';
  }

  function configureInputs(){
    const t=currentTemplate();if(!t?.items)return;
    document.querySelectorAll('tr.item-row').forEach(row=>{
      const n=Number(row.dataset.no||row.cells?.[0]?.textContent||0),item=t.items.find(x=>Number(x.no)===n);if(!item)return;
      if(isGearbox(item))return;
      const input=row.querySelector(`input[name="vibration_${n}"]`),na=row.querySelector('.vibration-na');
      if(isPulleyPoint(item)){
        if(!input&&na){na.className='';na.innerHTML=`<input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_${n}" placeholder="0.00">`}
      }else if(input){const td=input.closest('td');if(td){td.className='vibration-na';td.innerHTML='<span title="วัด Vibration เฉพาะ Gearbox และ Pulley">—</span>'}}
    });
  }

  function status(v){if(v==null)return '-';if(v<LIMITS.normal)return 'Normal';if(v<LIMITS.watch)return 'Watch';if(v<LIMITS.alert)return 'Alert';return 'Danger'}
  const shortDate=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}`:String(s||'')};

  function latestByDate(kind,n){
    const map=new Map();
    records().forEach(r=>{
      const d=r.data||{},date=d.inspection_date||'';if(!date)return;
      let value;
      if(kind==='gearbox'){
        const t=templateFor(r),item=t?.items?.find(i=>Number(i.no)===n);if(!item||!isGearbox(item))return;
        const legacy=num(d[`vibration_${n}`]);
        value={input:num(d[`vibration_input_${n}`])??legacy,output:num(d[`vibration_output_${n}`])};
        if(value.input==null&&value.output==null)return;
      }else{
        // Drive Station pulley mapping is direct by checklist row number.
        if(!DRIVE_PULLEY_POINTS.has(n)||!isDriveStationRecord(r))return;
        const v=num(d[`vibration_${n}`]);if(v==null)return;value={single:v};
      }
      const stamp=String(r.updated_at||r.created_at||'');const old=map.get(date);
      if(!old||stamp>old.stamp)map.set(date,{stamp,...value});
    });
    return map;
  }

  function draw(preferred,rebuild=true){
    if(rebuild)rebuildPointOptions(preferred);configureDisplay();configureSelector();configureInputs();ensureReference();
    const sel=document.getElementById('vibrationPoint'),canvas=document.getElementById('vibrationTrendChart');if(!sel||!canvas||!sel.value)return;
    if(preferred&&[...sel.options].some(o=>o.value===preferred))sel.value=preferred;sel.dataset.vibSelected=sel.value;
    const [kind,nStr]=sel.value.split('|||'),n=Number(nStr),byDate=latestByDate(kind,n),dates=[...byDate.keys()].sort();
    const inputs=kind==='gearbox'?dates.map(d=>byDate.get(d).input):[],outputs=kind==='gearbox'?dates.map(d=>byDate.get(d).output):[],singles=kind==='pulley'?dates.map(d=>byDate.get(d).single):[];
    drawCanvas(canvas,dates,kind,inputs,outputs,singles);updateSummary(kind,inputs,outputs,singles);
    const note=canvas.closest('.condition-card')?.querySelector('.condition-note');if(note)note.textContent=kind==='gearbox'?'Trend Gearbox — Input และ Output จากข้อมูลที่บันทึกใน Checklist':`Trend Pulley — ${DRIVE_PULLEY_POINTS.get(n)||'จุดที่เลือก'} อ่านตรงจากข้อมูล Checklist`;
  }

  function drawCanvas(canvas,dates,kind,inputs,outputs,singles){
    const ctx=canvas.getContext('2d'),rect=canvas.getBoundingClientRect(),q=window.devicePixelRatio||1,w=Math.max(360,rect.width||700),h=Math.max(285,rect.height||285);
    canvas.width=w*q;canvas.height=h*q;ctx.setTransform(q,0,0,q,0,0);ctx.clearRect(0,0,w,h);
    const series=kind==='gearbox'?[{name:'Input',vals:inputs,color:'#236c93'},{name:'Output',vals:outputs,color:'#d47a23'}]:[{name:'Vibration',vals:singles,color:'#236c93'}],all=series.flatMap(s=>s.vals).filter(v=>Number.isFinite(v));
    if(!dates.length||!all.length){ctx.fillStyle='#667784';ctx.font='13px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('ยังไม่มีข้อมูล Vibration ที่บันทึกสำหรับจุดนี้',w/2,h/2);return}
    const p={l:55,r:24,t:35,b:48},plotW=w-p.l-p.r,plotH=h-p.t-p.b,max=Math.max(8,Math.ceil((Math.max(...all,LIMITS.alert)+.5)*2)/2),min=0,y=v=>p.t+plotH*(1-(v-min)/(max-min)),x=i=>dates.length>1?p.l+plotW*i/(dates.length-1):p.l+plotW/2;
    [[0,LIMITS.normal,'rgba(25,135,84,.07)'],[LIMITS.normal,LIMITS.watch,'rgba(255,193,7,.08)'],[LIMITS.watch,LIMITS.alert,'rgba(255,126,0,.07)'],[LIMITS.alert,max,'rgba(220,53,69,.06)']].forEach(([a,b,c])=>{ctx.fillStyle=c;ctx.fillRect(p.l,y(b),plotW,y(a)-y(b))});
    ctx.font='10px system-ui,sans-serif';for(let i=0;i<=4;i++){const v=max-(max-min)*i/4,py=y(v);ctx.strokeStyle='#d7e0e6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(w-p.r,py);ctx.stroke();ctx.fillStyle='#667784';ctx.textAlign='right';ctx.fillText(v.toFixed(1),p.l-7,py+3)}
    [LIMITS.normal,LIMITS.watch,LIMITS.alert].forEach(v=>{const py=y(v);ctx.strokeStyle='#9aa8b2';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(w-p.r,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#657581';ctx.textAlign='right';ctx.fillText(v.toFixed(1),w-p.r-2,py-4)});
    series.forEach(s=>{ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=2.4;ctx.beginPath();let started=false;s.vals.forEach((v,i)=>{if(!Number.isFinite(v))return;const px=x(i),py=y(v);if(!started){ctx.moveTo(px,py);started=true}else ctx.lineTo(px,py)});ctx.stroke();s.vals.forEach((v,i)=>{if(!Number.isFinite(v))return;const px=x(i),py=y(v);ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.font='700 10px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(v.toFixed(2),px,Math.max(p.t+9,py-9))})});
    ctx.fillStyle='#667784';ctx.font='10px system-ui,sans-serif';ctx.textAlign='center';const every=Math.max(1,Math.ceil(dates.length/8));dates.forEach((d,i)=>{if(i%every===0||i===dates.length-1)ctx.fillText(shortDate(d),x(i),h-p.b+20)});
    if(kind==='gearbox'){ctx.font='600 11px system-ui,sans-serif';ctx.textAlign='left';ctx.fillStyle='#236c93';ctx.fillText('● Input',p.l,p.t-15);ctx.fillStyle='#d47a23';ctx.fillText('● Output',p.l+70,p.t-15)}
  }

  function updateSummary(kind,inputs,outputs,singles){
    const anchor=document.getElementById('vibChecked'),summary=anchor?.closest('.condition-summary');if(!summary)return;const valid=a=>a.filter(Number.isFinite);
    if(kind==='gearbox'){const iv=valid(inputs),ov=valid(outputs),li=[...inputs].reverse().find(Number.isFinite),lo=[...outputs].reverse().find(Number.isFinite),all=[...iv,...ov];summary.innerHTML=`<span>ล่าสุด Input: <b>${li==null?'-':li.toFixed(2)+' mm/s'}</b></span><span>ล่าสุด Output: <b>${lo==null?'-':lo.toFixed(2)+' mm/s'}</b></span><span>สูงสุด: <b>${all.length?Math.max(...all).toFixed(2)+' mm/s':'-'}</b></span><span>สถานะ: <b>${status(all.length?Math.max(li??-Infinity,lo??-Infinity):null)}</b></span><span>จำนวนวันที่มีข้อมูล: <b id="vibChecked">${new Set([...inputs.map((v,i)=>Number.isFinite(v)?i:null),...outputs.map((v,i)=>Number.isFinite(v)?i:null)].filter(v=>v!=null)).size}</b></span>`}
    else{const sv=valid(singles),latest=[...singles].reverse().find(Number.isFinite);summary.innerHTML=`<span>ล่าสุด: <b>${latest==null?'-':latest.toFixed(2)+' mm/s'}</b></span><span>ต่ำสุด: <b>${sv.length?Math.min(...sv).toFixed(2)+' mm/s':'-'}</b></span><span>สูงสุด: <b>${sv.length?Math.max(...sv).toFixed(2)+' mm/s':'-'}</b></span><span>สถานะ: <b>${status(latest)}</b></span><span>จำนวนครั้ง: <b id="vibChecked">${sv.length}</b></span>`}
  }

  function ensureReference(){const canvas=document.getElementById('vibrationTrendChart'),card=canvas?.closest('.condition-card');if(!card)return;let note=card.querySelector('.vib-standard-reference');if(!note){note=document.createElement('div');note.className='vib-standard-reference';note.innerHTML='<b>Screening reference:</b> ISO 20816-3 / ISO 20816-9. Normal &lt;2.3, Watch 2.3–&lt;4.5, Alert 4.5–&lt;7.1, Danger ≥7.1 mm/s RMS <span>(ใช้เป็นเกณฑ์คัดกรองเบื้องต้น)</span>';canvas.closest('.chart-wrap')?.before(note)}}
  const style=document.createElement('style');style.textContent=`.vibration-na{text-align:center!important;color:#9aa8b2!important;font-weight:700}.vib-standard-reference{margin:7px 0 4px;padding:7px 9px;border:1px solid #d6e0e6;border-radius:8px;background:#f7fafc;font-size:10px;line-height:1.4;color:#526674}.vib-standard-reference span{color:#7a5b16}#vibrationTrendChart{min-height:285px}`;document.head.appendChild(style);

  const original=window.renderConditionTrends;if(typeof original==='function'){const wrapped=function(...args){const selected=document.getElementById('vibrationPoint')?.dataset.vibSelected||document.getElementById('vibrationPoint')?.value||'',r=original.apply(this,args);setTimeout(()=>draw(selected,true),0);return r};window.renderConditionTrends=wrapped;try{renderConditionTrends=wrapped}catch(e){}}
  document.addEventListener('change',e=>{if(['dashChecklist','dashMachine','dashOperator','dashDateFrom','dashDateTo'].includes(e.target?.id)){const selected=document.getElementById('vibrationPoint')?.dataset.vibSelected||'';setTimeout(()=>draw(selected,true),20)}});
  const tbody=document.getElementById('checklistBody')||document.querySelector('#checklistTable tbody');if(tbody)new MutationObserver(()=>setTimeout(configureInputs,0)).observe(tbody,{childList:true,subtree:true});
  setTimeout(()=>draw('',true),350);setTimeout(()=>draw(document.getElementById('vibrationPoint')?.dataset.vibSelected||'',true),1000);
})();