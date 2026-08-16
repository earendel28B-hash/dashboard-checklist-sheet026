(()=>{
  const PULLEY=[2,3,7,8,12,13,17,18];
  const GEARBOX=[22,28,34,40,46];

  function getRecord(id){
    try{return (typeof getRecords==='function'?getRecords():[]).find(r=>String(r.id||r.record_id)===String(id))||null}catch(e){return null}
  }

  function put(name,value){
    const el=document.querySelector(`[name="${name}"]`);
    if(!el)return false;
    el.value=value==null?'':String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return true;
  }

  function restore(data){
    if(!data)return;
    // Pulley single-value vibration fields
    PULLEY.forEach(n=>{
      if(Object.prototype.hasOwnProperty.call(data,`vibration_${n}`)) put(`vibration_${n}`,data[`vibration_${n}`]);
    });
    // Gearbox dual vibration fields. Legacy vibration_n is used as Input fallback only.
    GEARBOX.forEach(n=>{
      const vin=data[`vibration_input_${n}`];
      const vout=data[`vibration_output_${n}`];
      const legacy=data[`vibration_${n}`];
      if(vin!=null&&vin!=='') put(`vibration_input_${n}`,vin);
      else if(legacy!=null&&legacy!==''&&!/^(OK|NG)$/i.test(String(legacy))) put(`vibration_input_${n}`,legacy);
      if(vout!=null&&vout!=='') put(`vibration_output_${n}`,vout);
    });
    try{if(typeof updateSummary==='function')updateSummary()}catch(e){}
  }

  function restoreRecord(id){
    const rec=getRecord(id);
    if(!rec)return;
    const d=rec.data||{};
    // Dynamic Gearbox/Pulley cells can be rebuilt after applyData, so retry after each render stage.
    [0,40,120,300,700].forEach(ms=>setTimeout(()=>restore(d),ms));
  }

  // Capture history edit clicks without replacing the app's original editRecord flow.
  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('button');
    if(!btn)return;
    const code=btn.getAttribute('onclick')||'';
    const m=code.match(/editRecord\(['"]([^'"]+)['"]\)/);
    if(m) setTimeout(()=>restoreRecord(m[1]),20);
  },true);

  // Also wrap editRecord when accessible, covering calls from other UI paths.
  try{
    const original=window.editRecord;
    if(typeof original==='function'&&!original.__vibRestore){
      const wrapped=async function(id){
        const result=await original.apply(this,arguments);
        restoreRecord(id);
        return result;
      };
      wrapped.__vibRestore=true;
      window.editRecord=wrapped;
      try{editRecord=wrapped}catch(e){}
    }
  }catch(e){}
})();