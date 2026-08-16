(()=>{
  const isGearboxItem=item=>/(?:gear\s*box|gearbox)/i.test(String(item?.item||''));
  const num=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const vibCell=n=>`<td class="gearbox-vibration-cell"><div class="gearbox-vibration-grid"><label><span>Input</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_input_${n}" placeholder="0.00" aria-label="Gearbox Input vibration item ${n} mm/s RMS"></label><label><span>Output</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_output_${n}" placeholder="0.00" aria-label="Gearbox Output vibration item ${n} mm/s RMS"></label></div></td>`;

  const style=document.createElement('style');
  style.textContent=`.gearbox-vibration-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;min-width:145px}.gearbox-vibration-grid label{display:grid;grid-template-columns:auto 1fr;gap:3px;align-items:center}.gearbox-vibration-grid span{font-size:9px;font-weight:700;color:#667784}.gearbox-vibration-grid .text-input{min-width:0;text-align:center;padding:2px 3px}@media(max-width:850px){.gearbox-vibration-grid{grid-template-columns:1fr}.gearbox-vibration-grid label{grid-template-columns:42px 1fr}}@media print{.gearbox-vibration-grid{min-width:100px;gap:2px}.gearbox-vibration-grid span{font-size:7px}}`;
  document.head.appendChild(style);

  const originalRowHtml=window.rowHtml;
  if(typeof originalRowHtml==='function'){
    window.rowHtml=function(item){
      let out=originalRowHtml(item);
      if(!isGearboxItem(item))return out;
      const n=item.no;
      const re=new RegExp(`<td><input class="text-input vibration-input"[^>]*name="vibration_${n}"[^>]*><\\/td>`);
      return out.replace(re,vibCell(n));
    };
  }

  function templateItem(no){
    const t=window.CHECKLIST_TEMPLATES?.[window.currentChecklistKey];
    return t?.items?.find(i=>Number(i.no)===Number(no));
  }

  function upgradeVisibleRows(){
    document.querySelectorAll('.item-row').forEach(row=>{
      const n=Number(row.dataset.no),item=templateItem(n);
      if(!isGearboxItem(item))return;
      const old=row.querySelector(`input[name="vibration_${n}"]`);
      if(!old)return;
      const legacy=old.value;
      const td=old.closest('td');
      if(!td)return;
      const holder=document.createElement('tbody');
      holder.innerHTML=`<tr>${vibCell(n)}</tr>`;
      const newTd=holder.querySelector('td');
      td.replaceWith(newTd);
      const legacyNum=num(legacy);
      if(legacyNum!=null)newTd.querySelector(`input[name="vibration_input_${n}"]`).value=legacyNum;
    });
  }

  const originalRenderChecklist=window.renderChecklist;
  if(typeof originalRenderChecklist==='function'){
    window.renderChecklist=function(...args){
      const r=originalRenderChecklist.apply(this,args);
      upgradeVisibleRows();
      return r;
    };
  }

  const originalApplyData=window.applyData;
  if(typeof originalApplyData==='function'){
    window.applyData=function(data){
      const d={...(data||{})};
      const key=(d&&window.CHECKLIST_TEMPLATES?.[d.checklist_type])?d.checklist_type:(window.currentChecklistKey||'drive_station');
      const t=window.CHECKLIST_TEMPLATES?.[key];
      t?.items?.filter(isGearboxItem).forEach(item=>{
        const n=item.no;
        if(d[`vibration_input_${n}`]==null && d[`vibration_output_${n}`]==null){
          const v=num(d[`vibration_${n}`]);
          if(v!=null)d[`vibration_input_${n}`]=String(v);
        }
      });
      const r=originalApplyData.call(this,d);
      upgradeVisibleRows();
      Object.entries(d).forEach(([k,v])=>{
        if(!/^vibration_(?:input|output)_\d+$/.test(k))return;
        const el=document.forms.checklistForm?.elements[k];
        if(el)el.value=v??'';
      });
      if(typeof window.updateSummary==='function')window.updateSummary();
      return r;
    };
  }

  window.updateSummary=function(){
    let done=0,ng=0;
    document.querySelectorAll('.item-row').forEach(row=>{
      const n=row.dataset.no;
      const visual=document.forms.checklistForm?.elements[`visual_${n}`]?.value||'';
      const sound=document.forms.checklistForm?.elements[`sound_${n}`]?.value||'';
      const vib=document.forms.checklistForm?.elements[`vibration_${n}`]?.value||'';
      const vin=document.forms.checklistForm?.elements[`vibration_input_${n}`]?.value||'';
      const vout=document.forms.checklistForm?.elements[`vibration_output_${n}`]?.value||'';
      const actual=document.forms.checklistForm?.elements[`actual_${n}`]?.value?.trim()||'';
      const remark=document.forms.checklistForm?.elements[`remark_${n}`]?.value?.trim()||'';
      const complete=actual||remark||visual||sound||vib||vin||vout;
      const hasNg=visual==='NG'||sound==='NG';
      row.classList.toggle('complete',!!complete);
      row.classList.toggle('has-ng',hasNg);
      if(complete)done++;
      if(visual==='NG')ng++;
      if(sound==='NG')ng++;
    });
    if(window.doneCount)doneCount.textContent=done;
    if(window.ngCount)ngCount.textContent=ng;
    if(window.totalCount)totalCount.textContent=document.querySelectorAll('.item-row').length;
  };

  window.refreshConditionPointFilters=function(records){
    const tm=new Map(),vm=new Map();
    records.forEach(r=>{
      const t=window.getTemplateForRecord(r);
      window.getTemperatureItems(t).forEach(i=>tm.set(`${i.no}|||temp|||${i.section} - ${i.item}`,`${i.section} - ${i.item}`));
      t.items.forEach(i=>{
        const label=`${i.section} - ${i.item}`;
        if(isGearboxItem(i)){
          vm.set(`${i.no}|||input|||${label}`,`${label} - Input`);
          vm.set(`${i.no}|||output|||${label}`,`${label} - Output`);
        }else{
          vm.set(`${i.no}|||single|||${label}`,label);
        }
      });
    });
    const set=(id,map,label)=>{
      const e=document.getElementById(id),p=e?.value||'',a=[...map.entries()].sort((x,y)=>x[1].localeCompare(y[1],'th'));
      if(!e)return;
      e.innerHTML=a.length?a.map(([v,l])=>`<option value="${window.escapeHtml(v)}">${window.escapeHtml(l)}</option>`).join(''):`<option value="">${label}</option>`;
      if(a.some(([v])=>v===p))e.value=p;
    };
    set('tempPoint',tm,'ไม่พบจุดวัดอุณหภูมิ');
    set('vibrationPoint',vm,'ไม่พบจุดตรวจ');
  };

  window.renderConditionTrends=function(){
    const records=window.filteredDashboardRecords().slice().sort((a,b)=>(a.data?.inspection_date||'').localeCompare(b.data?.inspection_date||''));
    window.refreshConditionPointFilters(records);
    const mode=tempDisplayMode.value,sel=tempPoint.value,by={};
    records.forEach(r=>{
      const d=r.data||{},date=d.inspection_date||'';if(!date)return;
      const t=window.getTemplateForRecord(r);let vals=[];
      if(mode==='selected'&&sel){const n=Number(sel.split('|||')[0]),v=num(d[`actual_${n}`]);if(v!=null)vals=[v]}
      else vals=window.getTemperatureItems(t).map(i=>num(d[`actual_${i.no}`])).filter(v=>v!=null);
      if(!vals.length)return;
      const v=mode==='maximum'?Math.max(...vals):mode==='average'?vals.reduce((a,b)=>a+b,0)/vals.length:vals[0];
      (by[date]??=[]).push(v);
    });
    const dates=Object.keys(by).sort(),vals=dates.map(d=>by[d].reduce((a,b)=>a+b,0)/by[d].length);
    window.drawConditionLineChart(temperatureTrendChart,dates,vals,{min:30,max:80,limits:[{value:40,color:'#d98c10'},{value:70,color:'#b42318'}]});
    tempLatest.textContent=vals.length?`${vals.at(-1).toFixed(1)} °C`:'-';tempMin.textContent=vals.length?`${Math.min(...vals).toFixed(1)} °C`:'-';tempMax.textContent=vals.length?`${Math.max(...vals).toFixed(1)} °C`:'-';tempOver.textContent=vals.filter(v=>v>70).length;

    const vm=vibrationDisplayMode.value,vs=vibrationPoint.value,vby={},all=[];
    records.forEach(r=>{
      const d=r.data||{},date=d.inspection_date||'';if(!date)return;
      const t=window.getTemplateForRecord(r);let nums=[];
      if(vm==='selected'&&vs){
        const [nStr,kind]=vs.split('|||'),n=Number(nStr);
        const key=kind==='input'?`vibration_input_${n}`:kind==='output'?`vibration_output_${n}`:`vibration_${n}`;
        const v=num(d[key]);if(v!=null)nums=[v];
      }else{
        t.items.forEach(i=>{
          if(isGearboxItem(i)){
            const a=num(d[`vibration_input_${i.no}`]),b=num(d[`vibration_output_${i.no}`]);
            if(a!=null)nums.push(a);if(b!=null)nums.push(b);
          }else{
            const v=num(d[`vibration_${i.no}`]);if(v!=null)nums.push(v);
          }
        });
      }
      if(!nums.length)return;
      all.push(...nums);
      const v=vm==='maximum'?Math.max(...nums):nums.reduce((a,b)=>a+b,0)/nums.length;
      (vby[date]??=[]).push(v);
    });
    const vd=Object.keys(vby).sort(),vv=vd.map(d=>vby[d].reduce((a,b)=>a+b,0)/vby[d].length);
    window.drawConditionLineChart(vibrationTrendChart,vd,vv,{min:0,decimals:2});
    vibLatest.textContent=vv.length?`${vv.at(-1).toFixed(2)} mm/s`:'-';vibMin.textContent=all.length?`${Math.min(...all).toFixed(2)} mm/s`:'-';vibMax.textContent=all.length?`${Math.max(...all).toFixed(2)} mm/s`:'-';vibChecked.textContent=all.length;
  };

  const originalExportAllCSV=window.exportAllCSV;
  window.exportAllCSV=function(){
    const records=window.getRecords();if(!records.length){alert('ยังไม่มีประวัติให้ส่งออก');return}
    const maxItems=Math.max(...Object.values(window.CHECKLIST_TEMPLATES).map(t=>t.items.length));
    const headers=['checklist_type','checklist_name','inspection_date','operator_name','employee_id','machine_location','smu','inspection_type','ng_count','saved_at'];
    for(let i=1;i<=maxItems;i++)headers.push(`standard_${i}`,`actual_${i}`,`visual_${i}`,`sound_${i}`,`vibration_${i}`,`vibration_input_${i}`,`vibration_output_${i}`,`remark_${i}`);
    const rows=[headers.map(window.csvCell).join(',')];
    records.forEach(r=>{const d=r.data||{},obj={...d,ng_count:window.recordNGCount(r),saved_at:r.updated_at||r.created_at};rows.push(headers.map(x=>window.csvCell(obj[x])).join(','))});
    window.downloadBlob('\ufeff'+rows.join('\n'),'text/csv;charset=utf-8','drive_station_checklist_history.csv');
  };

  upgradeVisibleRows();
  window.updateSummary();
  if(document.getElementById('dashboardPage')?.classList.contains('active'))window.renderDashboard?.();
})();