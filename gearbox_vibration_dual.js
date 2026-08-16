(()=>{
  const num=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const isGearboxRow=row=>{
    if(!row)return false;
    const itemText=(row.cells?.[1]?.textContent||'').replace(/\s+/g,' ').trim();
    return /^gear\s*box$/i.test(itemText)||/^gearbox$/i.test(itemText);
  };

  const style=document.createElement('style');
  style.textContent=`
    .gearbox-vibration-cell{min-width:180px!important}
    .gearbox-vibration-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:175px}
    .gearbox-vibration-grid label{display:flex;flex-direction:column;gap:3px;align-items:stretch}
    .gearbox-vibration-grid span{font-size:10px;font-weight:700;color:#526674;text-align:center;line-height:1.1}
    .gearbox-vibration-grid .text-input{width:100%;min-width:0;text-align:center;padding:5px 4px;box-sizing:border-box}
    @media(max-width:850px){.gearbox-vibration-cell{min-width:145px!important}.gearbox-vibration-grid{grid-template-columns:1fr;min-width:135px}}
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
      const td=makeDualCell(
        n,
        old.value,
        data?.[`vibration_input_${n}`]??'',
        data?.[`vibration_output_${n}`]??''
      );
      oldTd.replaceWith(td);
    });
  }

  // Initial page
  upgradeVisibleRows();

  // Re-apply whenever checklist rows are rebuilt.
  const tbody=document.getElementById('checklistBody')||document.querySelector('#checklistTable tbody')||document.querySelector('table tbody');
  if(tbody){
    const observer=new MutationObserver(()=>upgradeVisibleRows());
    observer.observe(tbody,{childList:true,subtree:true});
  }

  // Preserve values when opening/editing saved history.
  const originalApplyData=window.applyData;
  if(typeof originalApplyData==='function'){
    window.applyData=function(d){
      const result=originalApplyData.call(this,d);
      upgradeVisibleRows(d||{});
      setTimeout(()=>upgradeVisibleRows(d||{}),0);
      return result;
    };
  }

  // Preserve dual fields if renderChecklist is called directly.
  const originalRenderChecklist=window.renderChecklist;
  if(typeof originalRenderChecklist==='function'){
    window.renderChecklist=function(...args){
      const result=originalRenderChecklist.apply(this,args);
      upgradeVisibleRows();
      setTimeout(()=>upgradeVisibleRows(),0);
      return result;
    };
  }

  // Summary: Vibration is numeric, so only Visual/Sound count as NG.
  const originalUpdateSummary=window.updateSummary;
  if(typeof originalUpdateSummary==='function'){
    window.updateSummary=function(...args){
      upgradeVisibleRows();
      return originalUpdateSummary.apply(this,args);
    };
  }
})();