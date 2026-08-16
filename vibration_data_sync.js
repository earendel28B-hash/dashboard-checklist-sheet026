(()=>{
  function syncSerialize(){
    const original=window.serialize;
    if(typeof original!=='function'||original.__vibSynced)return;
    const wrapped=function(){
      const data=original.apply(this,arguments)||{};
      const form=document.forms.checklistForm||document.querySelector('form');
      if(!form)return data;
      form.querySelectorAll('input[name^="vibration_input_"],input[name^="vibration_output_"],input[name^="vibration_"]').forEach(el=>{
        if(!el.name)return;
        const v=String(el.value??'').trim();
        data[el.name]=v;
      });
      return data;
    };
    wrapped.__vibSynced=true;
    window.serialize=wrapped;
    try{serialize=wrapped}catch(e){}
  }

  function restoreDual(data){
    if(!data)return;
    Object.entries(data).forEach(([k,v])=>{
      if(!/^vibration_(?:input|output)_\d+$/.test(k))return;
      const el=document.querySelector(`[name="${k}"]`);
      if(el)el.value=v??'';
    });
  }

  function syncApplyData(){
    const original=window.applyData;
    if(typeof original!=='function'||original.__vibSynced)return;
    const wrapped=function(data){
      const r=original.apply(this,arguments);
      setTimeout(()=>restoreDual(data||{}),0);
      setTimeout(()=>restoreDual(data||{}),80);
      return r;
    };
    wrapped.__vibSynced=true;
    window.applyData=wrapped;
    try{applyData=wrapped}catch(e){}
  }

  function patchSaveButtons(){
    const form=document.forms.checklistForm||document.querySelector('form');
    if(!form)return;
    form.addEventListener('input',e=>{
      if(/^vibration_(?:input|output|\d)/.test(e.target?.name||'')){
        const data=window.serialize?.();
        try{localStorage.setItem('driveStationChecklistDraft',JSON.stringify(data||{}))}catch(err){}
      }
    });
  }

  syncSerialize();
  syncApplyData();
  patchSaveButtons();
  setTimeout(()=>{syncSerialize();syncApplyData()},300);
})();