(()=>{
  if(typeof Chart==='undefined')return;

  // Working screening bands used by this dashboard (mm/s RMS).
  // Standards are references for evaluation framework; final acceptance depends on machine/support class.
  const LIMITS={normal:2.3,watch:4.5,alert:7.1};

  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
  const isGearbox=i=>/^gear\s*box$/i.test(String(i?.item||'').trim())||/^gearbox$/i.test(String(i?.item||'').trim());
  const isPulleyPoint=i=>/^pulley\b/i.test(String(i?.section||'').trim())&&/^grease\s+[lr]$/i.test(String(i?.item||'').trim());
  const pointLabel=i=>isGearbox(i)?`${i.section} - Gear Box`:`${i.section} - ${/\bR$/i.test(i.item)?'R':'L'}`;

  function getRecordsSafe(){
    try{return typeof filteredDashboardRecords==='function'?filteredDashboardRecords():[]}catch(e){return []}
  }
  function getTemplateSafe(r){
    try{return typeof getTemplateForRecord==='function'?getTemplateForRecord(r):null}catch(e){return null}
  }

  function rebuildPointOptions(){
    const sel=document.getElementById('vibrationPoint');
    if(!sel)return;
    const previous=sel.value;
    const map=new Map();
    getRecordsSafe().forEach(r=>{
      const t=getTemplateSafe(r);if(!t?.items)return;
      t.items.forEach(i=>{
        if(isGearbox(i))map.set(`gearbox|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
        else if(isPulleyPoint(i))map.set(`pulley|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
      });
    });
    // fallback to current template when there are no records yet
    try{
      const t=CHECKLIST_TEMPLATES[currentChecklistKey];
      t?.items?.forEach(i=>{
        if(isGearbox(i))map.set(`gearbox|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
        else if(isPulleyPoint(i))map.set(`pulley|||${i.no}|||${pointLabel(i)}`,pointLabel(i));
      });
    }catch(e){}
    const arr=[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],'th'));
    sel.innerHTML=arr.length?arr.map(([v,l])=>`<option value="${v.replace(/"/g,'&quot;')}">${l}</option>`).join(''):'<option value="">ไม่พบจุดวัด Gearbox / Pulley</option>';
    if(arr.some(([v])=>v===previous))sel.value=previous;
  }

  function configureDisplayControl(){
    const display=document.getElementById('vibrationDisplayMode');
    const field=display?.closest('.field');
    if(field)field.style.display='none';
    const point=document.getElementById('vibrationPoint');
    const pfield=point?.closest('.field');
    if(pfield)pfield.style.gridColumn='1 / -1';
  }

  function configureVibrationInputs(){
    let t=null;
    try{t=CHECKLIST_TEMPLATES[currentChecklistKey]}catch(e){}
    if(!t?.items)return;
    document.querySelectorAll('tr.item-row').forEach(row=>{
      const n=Number(row.dataset.no||row.cells?.[0]?.textContent||0);
      const item=t.items.find(x=>Number(x.no)===n);if(!item)return;
      if(isGearbox(item))return; // dual Input/Output handled by gearbox_vibration_dual.js
      const old=row.querySelector(`input[name="vibration_${n}"]`);
      const td=old?.closest('td')||row.querySelector('.vibration-na');
      if(isPulleyPoint(item)){
        if(td?.classList.contains('vibration-na')){
          td.className='';
          td.innerHTML=`<input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_${n}" placeholder="0.00">`;
        }
        return;
      }
      if(old){
        const cell=old.closest('td');
        cell.className='vibration-na';
        cell.innerHTML='<span title="วัด Vibration เฉพาะ Gearbox และ Pulley L/R">—</span>';
      }
    });
  }

  function status(v){
    if(v==null)return '-';
    if(v<LIMITS.normal)return 'Normal';
    if(v<LIMITS.watch)return 'Watch';
    if(v<LIMITS.alert)return 'Alert';
    return 'Danger';
  }

  const bandPlugin={
    id:'vibrationScreeningBands',
    beforeDatasetsDraw(chart){
      if(chart.canvas?.id!=='vibrationTrendChart')return;
      const y=chart.scales?.y,a=chart.chartArea;if(!y||!a)return;
      const ctx=chart.ctx;
      const p23=y.getPixelForValue(LIMITS.normal),p45=y.getPixelForValue(LIMITS.watch),p71=y.getPixelForValue(LIMITS.alert);
      ctx.save();
      ctx.fillStyle='rgba(25,135,84,.07)';ctx.fillRect(a.left,p23,a.right-a.left,a.bottom-p23);
      ctx.fillStyle='rgba(255,193,7,.08)';ctx.fillRect(a.left,p45,a.right-a.left,p23-p45);
      ctx.fillStyle='rgba(255,126,0,.07)';ctx.fillRect(a.left,p71,a.right-a.left,p45-p71);
      ctx.fillStyle='rgba(220,53,69,.06)';ctx.fillRect(a.left,a.top,a.right-a.left,p71-a.top);
      [LIMITS.normal,LIMITS.watch,LIMITS.alert].forEach((v,idx)=>{
        const py=y.getPixelForValue(v);ctx.strokeStyle=idx===2?'rgba(190,45,55,.75)':'rgba(120,130,140,.55)';ctx.setLineDash([5,5]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.left,py);ctx.lineTo(a.right,py);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#657581';ctx.font='600 9px system-ui,sans-serif';ctx.textAlign='right';ctx.fillText(`${v.toFixed(1)} mm/s`,a.right-3,py-4);
      });
      ctx.restore();
    }
  };
  try{Chart.register(bandPlugin)}catch(e){}

  function setSummary(kind,inputVals,outputVals,singleVals){
    const summary=document.getElementById('vibChecked')?.closest('.condition-summary');if(!summary)return;
    if(kind==='gearbox'){
      const li=inputVals.length?inputVals.at(-1):null,lo=outputVals.length?outputVals.at(-1):null;
      const all=[...inputVals,...outputVals];
      summary.innerHTML=`<span>ล่าสุด Input: <b>${li==null?'-':li.toFixed(2)+' mm/s'}</b></span><span>ล่าสุด Output: <b>${lo==null?'-':lo.toFixed(2)+' mm/s'}</b></span><span>สูงสุด: <b>${all.length?Math.max(...all).toFixed(2)+' mm/s':'-'}</b></span><span>สถานะล่าสุด: <b>${status(Math.max(li??-Infinity,lo??-Infinity))}</b></span><span>จำนวนครั้ง: <b id="vibChecked">${Math.max(inputVals.length,outputVals.length)}</b></span>`;
    }else{
      const all=singleVals,latest=all.length?all.at(-1):null;
      summary.innerHTML=`<span>ล่าสุด: <b>${latest==null?'-':latest.toFixed(2)+' mm/s'}</b></span><span>ต่ำสุด: <b>${all.length?Math.min(...all).toFixed(2)+' mm/s':'-'}</b></span><span>สูงสุด: <b>${all.length?Math.max(...all).toFixed(2)+' mm/s':'-'}</b></span><span>สถานะล่าสุด: <b>${status(latest)}</b></span><span>จำนวนครั้ง: <b id="vibChecked">${all.length}</b></span>`;
    }
  }

  function ensureReferenceNote(){
    const canvas=document.getElementById('vibrationTrendChart');
    const card=canvas?.closest('.condition-card');if(!card)return;
    let note=card.querySelector('.vib-standard-reference');
    if(!note){
      note=document.createElement('div');note.className='vib-standard-reference';
      note.innerHTML='<b>Screening reference:</b> ISO 20816-3:2022 (industrial machinery / conveyors); Gearbox additionally ISO 20816-9:2020. Dashboard bands: Normal &lt;2.3, Watch 2.3–&lt;4.5, Alert 4.5–&lt;7.1, Danger ≥7.1 mm/s RMS. <span>ใช้เป็นเกณฑ์คัดกรองเบื้องต้น; เกณฑ์ยอมรับสุดท้ายต้องยืนยันตามชนิดเครื่อง/ฐานรองรับและผู้ผลิต</span>';
      const wrap=canvas.closest('.chart-wrap');wrap?.before(note);
    }
    let legend=card.querySelector('.vib-zone-legend');
    if(!legend){
      legend=document.createElement('div');legend.className='vib-zone-legend';
      legend.innerHTML='<span><i class="normal"></i>Normal &lt;2.3</span><span><i class="watch"></i>Watch 2.3–4.5</span><span><i class="alert"></i>Alert 4.5–7.1</span><span><i class="danger"></i>Danger ≥7.1 mm/s</span>';
      note.after(legend);
    }
  }

  function renderEnhancedVibration(){
    rebuildPointOptions();configureDisplayControl();configureVibrationInputs();ensureReferenceNote();
    const sel=document.getElementById('vibrationPoint'),canvas=document.getElementById('vibrationTrendChart');
    if(!sel||!canvas||!sel.value)return;
    const [kind,nStr]=sel.value.split('|||'),n=Number(nStr);
    const byDate=new Map();
    getRecordsSafe().slice().sort((a,b)=>(a.data?.inspection_date||'').localeCompare(b.data?.inspection_date||'')).forEach(r=>{
      const d=r.data||{},date=d.inspection_date||'';if(!date)return;
      const t=getTemplateSafe(r),item=t?.items?.find(i=>Number(i.no)===n);if(!item)return;
      if(kind==='gearbox'&&!isGearbox(item))return;
      if(kind==='pulley'&&!isPulleyPoint(item))return;
      if(kind==='gearbox'){
        const legacy=num(d[`vibration_${n}`]);
        const input=num(d[`vibration_input_${n}`])??legacy;
        const output=num(d[`vibration_output_${n}`]);
        if(input==null&&output==null)return;
        byDate.set(date,{input,output});
      }else{
        const value=num(d[`vibration_${n}`]);if(value==null)return;byDate.set(date,{value});
      }
    });
    const dates=[...byDate.keys()].sort();
    const old=Chart.getChart?Chart.getChart(canvas):null;if(old)old.destroy();
    let datasets,inputVals=[],outputVals=[],singleVals=[];
    if(kind==='gearbox'){
      const inputs=dates.map(d=>byDate.get(d)?.input??null),outputs=dates.map(d=>byDate.get(d)?.output??null);
      inputVals=inputs.filter(v=>v!=null);outputVals=outputs.filter(v=>v!=null);
      datasets=[
        {label:'Input',data:inputs,borderColor:'#236c93',backgroundColor:'#236c93',pointRadius:4,pointHoverRadius:6,tension:.2,spanGaps:true},
        {label:'Output',data:outputs,borderColor:'#d47a23',backgroundColor:'#d47a23',pointRadius:4,pointHoverRadius:6,tension:.2,spanGaps:true}
      ];
    }else{
      const vals=dates.map(d=>byDate.get(d)?.value??null);singleVals=vals.filter(v=>v!=null);
      datasets=[{label:'Vibration',data:vals,borderColor:'#236c93',backgroundColor:'#236c93',pointRadius:4,pointHoverRadius:6,tension:.2,spanGaps:true}];
    }
    const all=[...inputVals,...outputVals,...singleVals];
    const ymax=Math.max(8,all.length?Math.ceil((Math.max(...all)+1)*2)/2:8);
    new Chart(canvas,{type:'line',data:{labels:dates,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,position:'top',labels:{usePointStyle:true,boxWidth:8}},tooltip:{callbacks:{label(ctx){const v=Number(ctx.raw);return `${ctx.dataset.label}: ${Number.isFinite(v)?v.toFixed(2):'-'} mm/s RMS`},afterBody(items){const vals=items.map(x=>Number(x.raw)).filter(Number.isFinite);return vals.length?`Screening: ${status(Math.max(...vals))}`:''}}}},scales:{x:{grid:{display:false},ticks:{maxRotation:0,minRotation:0,autoSkip:true,maxTicksLimit:8,callback:function(v,i){const s=dates[i]||'';const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}`:s}}},y:{beginAtZero:true,suggestedMax:ymax,max:ymax,title:{display:true,text:'mm/s RMS'},ticks:{callback:v=>Number(v).toFixed(1)}}}}});
    setSummary(kind,inputVals,outputVals,singleVals);
    const note=canvas.closest('.condition-card')?.querySelector('.condition-note');
    if(note)note.textContent=kind==='gearbox'?'Trend Gearbox: แสดง Input และ Output พร้อมกัน':'Trend Pulley: วัดที่ Bearing L/R ตามจุดที่เลือก';
  }

  const style=document.createElement('style');
  style.textContent=`.vibration-na{text-align:center!important;color:#9aa8b2!important;font-weight:700}.vib-standard-reference{margin:7px 0 3px;padding:7px 9px;border:1px solid #d6e0e6;border-radius:8px;background:#f7fafc;font-size:10px;line-height:1.4;color:#526674}.vib-standard-reference span{color:#7a5b16}.vib-zone-legend{display:flex;gap:11px;flex-wrap:wrap;margin:5px 0 2px;font-size:10px;color:#60717e}.vib-zone-legend span{display:flex;align-items:center;gap:4px}.vib-zone-legend i{width:12px;height:8px;border-radius:2px}.vib-zone-legend .normal{background:rgba(25,135,84,.30)}.vib-zone-legend .watch{background:rgba(255,193,7,.38)}.vib-zone-legend .alert{background:rgba(255,126,0,.30)}.vib-zone-legend .danger{background:rgba(220,53,69,.27)}#vibrationTrendChart{min-height:285px}`;
  document.head.appendChild(style);

  const original=window.renderConditionTrends;
  if(typeof original==='function')window.renderConditionTrends=function(...args){const r=original.apply(this,args);setTimeout(renderEnhancedVibration,0);return r};
  document.addEventListener('change',e=>{if(['vibrationPoint','dashChecklistFilter','dashMachineFilter','dashDateFrom','dashDateTo'].includes(e.target?.id))setTimeout(renderEnhancedVibration,30)});
  const tbody=document.getElementById('checklistBody')||document.querySelector('#checklistTable tbody');
  if(tbody)new MutationObserver(()=>setTimeout(configureVibrationInputs,0)).observe(tbody,{childList:true,subtree:true});
  setTimeout(renderEnhancedVibration,500);setTimeout(renderEnhancedVibration,1400);
})();