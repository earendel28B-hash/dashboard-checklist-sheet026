(()=>{
  const num=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const isGearboxRow=row=>{
    if(!row)return false;
    const itemText=(row.cells?.[1]?.textContent||'').replace(/\s+/g,' ').trim();
    return /^gear\s*box$/i.test(itemText)||/^gearbox$/i.test(itemText);
  };

  const style=document.createElement('style');
  style.textContent=`
    .gearbox-vibration-cell{
      padding:3px!important;
      vertical-align:middle!important;
      overflow:hidden!important;
      box-sizing:border-box!important;
      width:auto!important;
      min-width:0!important;
      max-width:none!important;
    }
    .gearbox-vibration-grid{
      display:grid!important;
      grid-template-columns:1fr!important;
      gap:4px!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
    }
    .gearbox-vibration-grid label{
      display:grid!important;
      grid-template-columns:34px minmax(0,1fr)!important;
      gap:3px!important;
      align-items:center!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      margin:0!important;
      padding:0!important;
      box-sizing:border-box!important;
      overflow:hidden!important;
    }
    .gearbox-vibration-grid span{
      display:block!important;
      width:34px!important;
      min-width:0!important;
      font-size:8px!important;
      font-weight:700!important;
      color:#526674!important;
      text-align:left!important;
      line-height:1!important;
      white-space:nowrap!important;
      overflow:hidden!important;
    }
    .gearbox-vibration-grid input.text-input{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      max-width:100%!important;
      height:25px!important;
      margin:0!important;
      padding:2px 1px!important;
      text-align:center!important;
      box-sizing:border-box!important;
      font-size:10px!important;
      overflow:hidden!important;
    }
    .gearbox-vibration-grid input[type=number]::-webkit-inner-spin-button,
    .gearbox-vibration-grid input[type=number]::-webkit-outer-spin-button{
      margin:0!important;
    }
    @media(max-width:850px){
      .gearbox-vibration-cell{padding:2px!important}
      .gearbox-vibration-grid{gap:3px!important}
      .gearbox-vibration-grid label{grid-template-columns:30px minmax(0,1fr)!important;gap:2px!important}
      .gearbox-vibration-grid span{width:30px!important;font-size:7px!important}
      .gearbox-vibration-grid input.text-input{height:23px!important;font-size:9px!important;padding:1px!important}
    }
    @media print{
      .gearbox-vibration-cell{padding:1px!important}
      .gearbox-vibration-grid{gap:1px!important}
      .gearbox-vibration-grid label{grid-template-columns:26px minmax(0,1fr)!important;gap:1px!important}
      .gearbox-vibration-grid span{width:26px!important;font-size:6px!important}
      .gearbox-vibration-grid input.text-input{height:19px!important;font-size:7px!important;padding:0!important}
    }
  `;
  document.head.appendChild(style);

  function makeDualCell(n,legacy='',inputValue='',outputValue=''){
    const td=document.createElement('td');
    td.className='gearbox-vibration-cell';
    td.innerHTML=`<div class="gearbox-vibration-grid">
      <label><span>Input</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_input_${n}" placeholder="0.00"></label>
      <label><span>Output</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_output_${n}" placeholder="0.00"></label>
    </div>`;
    const legacyNum=num(legacy);
    const vin=td.querySelector(`[name="vibration_input_${n}"]`);
    const vout=td.querySelector(`[name="vibration_output_${n}"]`);
    if(inputValue!==''&&inputValue!=null)vin.value=inputValue;
    else if(legacyNum!=null)vin.value=legacyNum;
    if(outputValue!==''&&outputValue!=null)vout.value=outputValue;
    return td;
  }

  function upgradeVisibleRows(data){
    document.querySelectorAll('tr.item-row').forEach(row=>{
      if(!isGearboxRow(row))return;
      const n=row.dataset.no||row.cells?.[0]?.textContent?.trim();
      if(!n)return;
      const existingIn=row.querySelector(`[name="vibration_input_${n}"]`);
      const existingOut=row.querySelector(`[name="vibration_output_${n}"]`);
      if(existingIn&&existingOut){
        if(data){
          if(data[`vibration_input_${n}`]!=null)existingIn.value=data[`vibration_input_${n}`];
          if(data[`vibration_output_${n}`]!=null)existingOut.value=data[`vibration_output_${n}`];
        }
        return;
      }
      const old=row.querySelector(`[name="vibration_${n}"]`);
      if(!old)return;
      const oldTd=old.closest('td');
      if(!oldTd)return;
      oldTd.replaceWith(makeDualCell(n,old.value,data?.[`vibration_input_${n}`]??'',data?.[`vibration_output_${n}`]??''));
    });
  }

  upgradeVisibleRows();
  const tbody=document.getElementById('checklistBody')||document.querySelector('#checklistTable tbody')||document.querySelector('table tbody');
  if(tbody)new MutationObserver(()=>upgradeVisibleRows()).observe(tbody,{childList:true,subtree:true});

  const originalApplyData=window.applyData;
  if(typeof originalApplyData==='function')window.applyData=function(d){const r=originalApplyData.call(this,d);upgradeVisibleRows(d||{});setTimeout(()=>upgradeVisibleRows(d||{}),0);return r};
  const originalRenderChecklist=window.renderChecklist;
  if(typeof originalRenderChecklist==='function')window.renderChecklist=function(...args){const r=originalRenderChecklist.apply(this,args);upgradeVisibleRows();setTimeout(()=>upgradeVisibleRows(),0);return r};
})();