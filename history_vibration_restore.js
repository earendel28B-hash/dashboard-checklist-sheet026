(()=>{
  const PULLEY=[2,3,7,8,12,13,17,18];
  const GEARBOX=[22,28,34,40,46];

  const byName=name=>document.querySelector(`[name="${name}"]`);
  function rowFor(n){return document.querySelector(`tr.item-row[data-no="${n}"]`)||[...document.querySelectorAll('tr.item-row')].find(r=>Number(r.cells?.[0]?.textContent||0)===Number(n))}

  function ensurePulley(n){
    let el=byName(`vibration_${n}`);if(el)return el;
    const row=rowFor(n);if(!row)return null;
    let td=row.querySelector('.vibration-na');
    if(!td){
      const candidate=[...row.querySelectorAll('td')].find(x=>x.querySelector('[name^="vibration_"]'));
      td=candidate||row.cells?.[8]||null;
    }
    if(!td)return null;
    td.className='';
    td.innerHTML=`<input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_${n}" placeholder="0.00">`;
    return byName(`vibration_${n}`);
  }

  function ensureGearbox(n){
    let vin=byName(`vibration_input_${n}`),vout=byName(`vibration_output_${n}`);
    if(vin&&vout)return {vin,vout};
    const row=rowFor(n);if(!row)return {vin:null,vout:null};
    const single=byName(`vibration_${n}`);
    let td=single?.closest('td')||[...row.querySelectorAll('td')].find(x=>x.querySelector('[name^="vibration_"]'))||row.cells?.[8]||null;
    if(!td)return {vin:null,vout:null};
    td.className='gearbox-vibration-cell';
    td.innerHTML=`<div class="gearbox-vibration-grid">
      <label><span>Input</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_input_${n}" placeholder="0.00"></label>
      <label><span>Output</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_output_${n}" placeholder="0.00"></label>
    </div>`;
    return {vin:byName(`vibration_input_${n}`),vout:byName(`vibration_output_${n}`)};
  }

  function setValue(el,value){if(!el)return;el.value=value==null?'':String(value)}

  function restore(data){
    if(!data||typeof data!=='object')return;
    PULLEY.forEach(n=>{
      const el=ensurePulley(n);
      if(Object.prototype.hasOwnProperty.call(data,`vibration_${n}`))setValue(el,data[`vibration_${n}`]);
    });
    GEARBOX.forEach(n=>{
      const {vin,vout}=ensureGearbox(n);
      const legacy=data[`vibration_${n}`];
      const input=data[`vibration_input_${n}`];
      const output=data[`vibration_output_${n}`];
      if(input!==undefined&&input!==null&&input!=='')setValue(vin,input);
      else if(legacy!==undefined&&legacy!==null&&legacy!==''&&!/^(OK|NG)$/i.test(String(legacy)))setValue(vin,legacy);
      else setValue(vin,'');
      setValue(vout,output??'');
    });
    try{if(typeof updateSummary==='function')updateSummary()}catch(e){}
  }

  function localRecord(id){
    try{return (typeof getRecords==='function'?getRecords():[]).find(r=>String(r.id||r.record_id)===String(id))||null}catch(e){return null}
  }

  async function loadLatestData(id){
    // First show cached data immediately, then overwrite with the authoritative Google Sheet record.
    const local=localRecord(id);if(local?.data)restore(local.data);
    try{
      if(typeof apiRequest==='function'){
        const result=await apiRequest('getById',{record_id:id});
        let rec=result?.data||null;
        if(rec&&typeof normalizeRecord==='function')rec=normalizeRecord(rec);
        const data=rec?.data||rec?.inspection_data||null;
        if(data){
          // Let the original edit flow finish its reset/render, then restore remote vibration values.
          [0,50,150,350,800].forEach(ms=>setTimeout(()=>restore(data),ms));
          return;
        }
      }
    }catch(err){console.warn('history vibration remote restore',err)}
    if(local?.data)[50,150,350,800].forEach(ms=>setTimeout(()=>restore(local.data),ms));
  }

  document.addEventListener('click',e=>{
    const btn=e.target?.closest?.('button');if(!btn)return;
    const code=btn.getAttribute('onclick')||'';
    const m=code.match(/editRecord\(['"]([^'"]+)['"]\)/);
    if(m)setTimeout(()=>loadLatestData(m[1]),10);
  },true);

  // Expose for diagnostics/manual retry from console if needed.
  window.restoreHistoryVibration=function(id){return loadLatestData(id)};
})();