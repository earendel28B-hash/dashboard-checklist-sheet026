/* Additive upgrade: legacy templates, record IDs and storage keys remain valid. */
(() => {
  'use strict';
  const NEW_TYPE = 'drive_station_v202611';
  const DRAFTS = 'driveStationChecklist_drafts_v4';
  const CHECKPOINT = 'driveStationChecklist_upgrade_checkpoint_v4';
  const clone = x => JSON.parse(JSON.stringify(x));
  const canonical = x => x && typeof x === 'object'
    ? Array.isArray(x) ? x.map(canonical) : Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const read = (key, fallback) => { const raw = localStorage.getItem(key); return raw === null ? clone(fallback) : JSON.parse(raw); };
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const isPreview = () => ['localhost','127.0.0.1'].includes(location.hostname) || new URLSearchParams(location.search).get('preview') === '1';
  const pulley = new Set([2,3,7,8,12,13,17,18]);
  const gearbox = new Set([22,28,34,40,46]);
  let retained = {}, dirty = new Set(), syncFlight = null, refreshFlight = null, mounted = false;
  let baseline, backupReady = Promise.resolve(), historyMode = 'all', applying = false;
  let previousNormalize, previousApi, previousRender;
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hash = value => { let h=2166136261; for (const c of JSON.stringify(canonical(value))) h=Math.imul(h^c.charCodeAt(0),16777619); return (h>>>0).toString(36); };
  const recordId = r => String(r?.record_id || r?.id || '');
  const queuedId = r => String(r?.record_id || r?.data?.record_id || '');
  const statusKeys = n => [`visual_${n}`,`sound_${n}`,`vibration_status_${n}`,`vibration_${n}`];

  function snapshot(reason) {
    const keys=[RECORDS_KEY,DRAFT_KEY,OFFLINE_QUEUE_KEY,DRAFTS,'driveStationChecklist_consumption_records_v1'];
    return {id:`${Date.now()}-${Math.random().toString(36).slice(2)}`, reason, created_at:new Date().toISOString(), storage:Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))};
  }
  function archive(value) {
    return new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('เบราว์เซอร์ไม่รองรับสำเนาสำรอง'));return;}
      const req=indexedDB.open('driveStationChecklist_safety_v1',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('snapshots',{keyPath:'id'});
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result, tx=db.transaction('snapshots','readwrite');
        tx.objectStore('snapshots').put(clone(value));
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
        tx.onabort=()=>{db.close();reject(tx.error || new Error('สำรองข้อมูลไม่สำเร็จ'));};
      };
    });
  }
  function checkpoint(reason) {
    const state=snapshot(reason);
    return archive(state).catch(error=>{
      if(!localStorage.getItem(CHECKPOINT))localStorage.setItem(CHECKPOINT,JSON.stringify(state));
      else if(reason!=='before-upgrade')throw error;
    });
  }
  function normalize(record) {
    if(!record || typeof record!=='object' || Array.isArray(record))throw new Error('รายการตรวจไม่ถูกต้อง');
    return {...record,...previousNormalize(record)};
  }
  function mergeRecords(local, remote, pending=[]) {
    const out=new Map(local.map(r=>[recordId(r),r])), pendingIds=new Set(pending.map(queuedId));
    for(const r of remote){
      const id=recordId(r), old=out.get(id);
      if(!old || (!pendingIds.has(id) && String(r.updated_at||r.created_at||'')>String(old.updated_at||old.created_at||'')))out.set(id,r);
    }
    return [...out.values()];
  }
  function mergeImport(existing,incoming) {
    const out=existing.slice(), byId=new Map(out.map(r=>[recordId(r),r])), added=[];
    for(const input of incoming){
      const r=normalize(input), originalId=recordId(r), old=byId.get(originalId);
      if(old && same(old.data,r.data))continue;
      if(old){
        const id=`${originalId}-import-${hash(r.data)}`;
        if(byId.has(id))continue;
        r.id=r.record_id=id;
        r.data={...r.data,record_id:id,imported_from_record_id:originalId};
      }
      byId.set(recordId(r),r);out.push(r);added.push(r);
    }
    return {records:out,added};
  }
  function saveDrafts() {
    const drafts=read(DRAFTS,{}), data=serialize();
    drafts[currentChecklistKey]={data,editingId,updated_at:new Date().toISOString()};
    localStorage.setItem(DRAFTS,JSON.stringify(drafts));
    localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
    updateSummary();
    if($('draftStatus'))$('draftStatus').textContent=`เก็บร่างแล้ว ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
  }
  function serializeSafe() {
    const data={...retained};
    new FormData(form).forEach((value,key)=>{
      if(/^vibration_\d+$/.test(key) && /^(OK|NG)$/.test(retained[key]||'') && value==='' && !dirty.has(key))return;
      data[key]=value;
    });
    // Radio groups absent from FormData must clear a previous selection deliberately.
    form.querySelectorAll('input[type=radio][name]').forEach(el=>{
      if(!form.querySelector(`input[name="${el.name}"]:checked`))data[el.name]='';
    });
    data.checklist_type=currentChecklistKey;
    data.checklist_name=CHECKLIST_TEMPLATES[currentChecklistKey]?.name || retained.checklist_name || '';
    if(currentChecklistKey===NEW_TYPE){data.template_version='2026-11';data.template_source_sheet='Form Check List Drive Station';}
    return data;
  }
  function applySafe(data={}) {
    applying=true;
    retained=clone(data);dirty.clear();
    const key=CHECKLIST_TEMPLATES[data.checklist_type]?data.checklist_type:'drive_station';
    renderChecklist(key);
    form.reset();$('checklistType').value=key;$('checklistDisplayName').value=CHECKLIST_TEMPLATES[key].name;
    Object.entries(data).forEach(([name,value])=>{
      const el=form.elements.namedItem(name);if(!el)return;
      if(el instanceof RadioNodeList){[...el].forEach(i=>i.checked=i.value===String(value));}
      else if(el.type==='radio')el.checked=el.value===String(value);
      else el.value=value??'';
    });
    setOperatorSelection(data.operator_name,data.employee_id);
    if(data.operator_name && $('operatorName').value!==data.operator_name){
      const opt=new Option(data.operator_name,data.operator_name,true,true);opt.dataset.id=data.employee_id||'';$('operatorName').add(opt);$('employeeId').value=data.employee_id||'';
    }
    if(key.includes('drive_station'))gearbox.forEach(n=>{
      const el=form.elements.namedItem(`vibration_input_${n}`), legacy=data[`vibration_${n}`];
      if(el && !el.value && legacy!=='' && legacy!=null && Number.isFinite(Number(legacy)))el.value=legacy;
    });
    if(!dateInput.value)dateInput.value=today();
    if($('saveFeedback'))$('saveFeedback').textContent='';
    applying=false;updateSummary();
  }
  function row(item) {
    const n=item.no, isDrive=currentChecklistKey.includes('drive_station');
    const radio=(kind,value,label)=>`<label class="check-choice"><input type="radio" name="${kind}_${n}" value="${value}" aria-label="${esc(item.section+' '+item.item+' '+label+' '+value)}"><span>${value}</span></label>`;
    let numeric='';
    if(isDrive && gearbox.has(n))numeric=`<div class="gearbox-vibration-grid"><label><span>Input</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_input_${n}" aria-label="Vibration Input ${esc(item.section)}" placeholder="mm/s"></label><label><span>Output</span><input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_output_${n}" aria-label="Vibration Output ${esc(item.section)}" placeholder="mm/s"></label></div>`;
    else if(!isDrive || pulley.has(n))numeric=`<input class="text-input vibration-input" type="number" inputmode="decimal" step="0.01" min="0" name="vibration_${n}" aria-label="Vibration ${esc(item.section+' '+item.item)} mm/s" placeholder="mm/s">`;
    const oldStatus=/^(OK|NG)$/.test(retained[`vibration_${n}`]||'')?`<small class="legacy-status">สถานะเดิม ${esc(retained[`vibration_${n}`])}</small>`:'';
    return `<tr class="item-row" data-no="${n}" data-section="${esc(item.section)}"><td class="no">${item.displayNo||n}</td><td class="inspection">${esc(item.item)}</td><td data-label="Standard"><input class="text-input standard" name="standard_${n}" value="${esc(item.standard||'')}" aria-label="Standard ${esc(item.item)}"></td><td data-label="Actual"><input class="text-input actual" name="actual_${n}" aria-label="Actual ${esc(item.item)}" placeholder="ค่าที่วัด"></td><td class="choice" data-label="Visual">${radio('visual','OK','Visual')}</td><td class="choice" data-label="Visual">${radio('visual','NG','Visual')}</td><td class="choice" data-label="Sound">${radio('sound','OK','Sound')}</td><td class="choice" data-label="Sound">${radio('sound','NG','Sound')}</td><td class="vibration-cell" data-label="Vibration"><div class="vibration-status">${radio('vibration_status','OK','Vibration')}${radio('vibration_status','NG','Vibration')}</div>${numeric}${oldStatus}</td><td data-label="หมายเหตุ"><input class="text-input remark" name="remark_${n}" aria-label="หมายเหตุ ${esc(item.item)}" placeholder="รายละเอียด / สิ่งที่พบ"></td></tr>`;
  }
  function render(key) {
    const template=CHECKLIST_TEMPLATES[key]||CHECKLIST_TEMPLATES.drive_station;
    currentChecklistKey=key;localStorage.setItem('driveStationChecklist_selected_type_v3',key);
    $('checklistType').value=key;$('checklistDisplayName').value=template.name;
    document.querySelector('#checklistPage .header h1').textContent=template.title;
    document.querySelector('#checklistPage .header .subtitle').textContent=template.subtitle;
    let section='';
    $('checklistBody').innerHTML=template.items.map(item=>{
      let heading='';if(section!==item.section){section=item.section;heading=`<tr class="section-row" data-section="${esc(section)}"><td colspan="10">${esc(section)}</td></tr>`;}
      return heading+row(item);
    }).join('');
    // Delegated listeners also support keyboard toggling of the status controls.
    if(mounted)refreshTools();updateSummary();
  }
  function update() {
    let done=0, ng=0;
    document.querySelectorAll('#checklistBody .item-row').forEach(el=>{
      const n=el.dataset.no, d=serializeRow(n), count=statusKeys(n).filter(k=>d[k]==='NG').length;
      const complete=Object.values(d).some(v=>String(v??'').trim()!=='');
      el.classList.toggle('has-ng',count>0);el.classList.toggle('complete',complete);
      if(complete)done++;ng+=count;
    });
    $('doneCount').textContent=done;$('ngCount').textContent=ng;
    const count=CHECKLIST_TEMPLATES[currentChecklistKey]?.items.length||0;$('totalCount').textContent=count;
    if($('inspectionProgress')){$('inspectionProgress').value=done;$('inspectionProgress').max=count;$('progressText').textContent=`มีข้อมูล ${done} / ${count} จุด`;}
    if(mounted)filterRows();
  }
  function serializeRow(n) {
    const d={};
    for(const k of ['actual','remark','visual','sound','vibration','vibration_status','vibration_input','vibration_output']){
      const name=`${k}_${n}`, el=form.elements.namedItem(name);
      d[name]=el?.value || (k==='vibration' && /^(OK|NG)$/.test(retained[name]||'') && !dirty.has(name)?retained[name]:'');
    }
    return d;
  }
  function refreshTools() {
    if(!$('sectionFilter'))return;
    const sections=[...new Set(CHECKLIST_TEMPLATES[currentChecklistKey].items.map(i=>i.section))];
    $('sectionFilter').innerHTML='<option value="">ทุกหมวด</option>'+sections.map(s=>`<option>${esc(s)}</option>`).join('');
    $('templateInfo').textContent=currentChecklistKey===NEW_TYPE?`แบบตรวจใหม่จาก Excel · 70 รายการ · ${sections.length} หมวด`:`แบบตรวจเดิม · ${CHECKLIST_TEMPLATES[currentChecklistKey].items.length} รายการ`;
    $('rowSearch').value='';$('rowFilter').value='all';
  }
  function filterRows() {
    const query=($('rowSearch')?.value||'').trim().toLowerCase(),section=$('sectionFilter')?.value||'',mode=$('rowFilter')?.value||'all';
    let shown=0;
    document.querySelectorAll('#checklistBody .item-row').forEach(el=>{
      const match=(!section||el.dataset.section===section)&&(!query||`${el.dataset.section} ${el.querySelector('.inspection').textContent} ${el.querySelector('.remark').value}`.toLowerCase().includes(query))&&(mode!=='ng'||el.classList.contains('has-ng'))&&(mode!=='pending'||!el.classList.contains('complete'));
      el.hidden=!match;if(match)shown++;
    });
    document.querySelectorAll('#checklistBody .section-row').forEach(el=>{el.hidden=![...document.querySelectorAll('#checklistBody .item-row')].some(r=>r.dataset.section===el.dataset.section&&!r.hidden);});
    if($('filterCount'))$('filterCount').textContent=`แสดง ${shown} รายการ`;
  }
  async function flush({silent=false}={}) {
    if(syncFlight)return syncFlight;
    syncFlight=(async()=>{
      while(true){
        const queue=readOfflineQueue(), item=queue.find(x=>x.action!=='delete');if(!item)break;
        await apiRequest(item.action,{data:item.data});
        const current=readOfflineQueue();
        // A newer save while this request was running must remain in the outbox.
        writeOfflineQueue(current.filter(x=>!same(x,item)));
      }
    })();
    try{await syncFlight;}finally{syncFlight=null;if(mounted)renderHistory();}
  }
  async function refresh(options={}) {
    if(refreshFlight)return refreshFlight;
    refreshFlight=(async()=>{
      try{
        await flushOfflineQueue({silent:true});
        const result=await apiRequest('read');
        if(!Array.isArray(result.data))throw new Error('ข้อมูลจากเซิร์ฟเวอร์ไม่ใช่รายการตรวจ');
        const current=getRecords(),merged=mergeRecords(current,result.data.map(normalizeRecord),readOfflineQueue());
        if(!same(current,merged)){await checkpoint('before-refresh');setRecords(merged);}
        setConnectionStatus('เชื่อมต่อ Google Sheets แล้ว','online');
      }catch(error){setConnectionStatus(isPreview()?'โหมดทดลอง · เก็บในเครื่อง':'เก็บในเครื่อง · รอเชื่อมต่อ','offline',error.message);}
      finally{refreshOnlineViews();}
    })();
    try{await refreshFlight;}finally{refreshFlight=null;}
  }
  async function save() {
    if(isSavingRecord||!form.reportValidity())return;
    setSavingState(true);
    try{
      await backupReady;
      const data=serialize(), now=new Date().toISOString(), id=editingId||generateRecordId(), old=getRecords().find(r=>r.id===id);
      const rec=normalizeRecord({record_id:id,created_at:old?.created_at||now,updated_at:now,data,ng_count:countNG(data)});
      // Persist the complete outbound record before any network request.
      enqueueOffline({action:old?'update':'create',data:sheetPayloadFromRecord(rec),queued_at:now,revision_id:crypto.randomUUID()});
      upsertLocalRecord(rec);editingId=id;retained=clone(data);dirty.clear();saveDraft();renderHistory();
      archive(snapshot('after-save')).catch(()=>{});
      setConnectionStatus('บันทึกในเครื่องแล้ว · กำลังส่ง','saving');
      try{await flushOfflineQueue();setConnectionStatus('บันทึกลง Google Sheets แล้ว','saved');}
      catch(error){setConnectionStatus('บันทึกในเครื่องแล้ว · รอส่ง','offline',error.message);}
      if($('saveFeedback'))$('saveFeedback').textContent=readOfflineQueue().some(x=>queuedId(x)===id)?'เก็บรายการในเครื่องแล้ว จะส่งอัตโนมัติเมื่อเชื่อมต่อได้':'บันทึกเรียบร้อยแล้ว';
    }catch(error){
      setConnectionStatus('ยังบันทึกไม่สำเร็จ','offline',error.message);
      alert(`ยังบันทึกไม่สำเร็จ: ${error.message}\nข้อมูลในแบบฟอร์มยังอยู่ กรุณาส่งออกข้อมูลปัจจุบันเพื่อสำรอง`);
    }finally{setSavingState(false);}
  }
  function history() {
    if(!$('historyBody'))return;
    const query=($('historySearch').value||'').toLowerCase(),type=$('historyType')?.value||'',mode=$('historyMode')?.value||'all';
    let records=getRecords().filter(r=>{const d=r.data||{};return (!type||d.checklist_type===type)&&[d.checklist_name,d.inspection_date,d.operator_name,d.machine_location,d.smu,d.inspection_type].join(' ').toLowerCase().includes(query);});
    records.sort((a,b)=>String(b.data.inspection_date||'').localeCompare(String(a.data.inspection_date||''))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
    if(mode==='latest'){const seen=new Set();records=records.filter(r=>{const d=r.data,key=[d.checklist_type,d.inspection_date,d.operator_name,d.machine_location,d.smu,d.inspection_type].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
    const pending=new Set(readOfflineQueue().filter(x=>x.action!=='delete').map(queuedId));
    $('recordCount').textContent=`${records.length} / ${getRecords().length} รายการ`;
    $('historyBody').innerHTML=records.length?records.map(r=>{const d=r.data||{},ng=countNG(d);return `<tr><td>${esc(d.checklist_name||'Drive Station')}${pending.has(r.id)?'<small class="pending-sync">รอส่ง Google Sheets</small>':''}</td><td>${esc(formatInspectionDate(d.inspection_date))}</td><td>${esc(d.operator_name)}</td><td>${esc(d.machine_location)}</td><td>${esc(d.smu)}</td><td>${esc(d.inspection_type)}</td><td class="history-ng">${ng}</td><td>${esc(formatDateTime(r.updated_at||r.created_at))}</td><td><div class="history-actions"><button type="button" data-record="${esc(r.id)}" data-record-action="edit">เปิด / แก้ไข</button><button type="button" data-record="${esc(r.id)}" data-record-action="copy">คัดลอก</button></div></td></tr>`;}).join(''):'<tr><td colspan="9" class="empty-history">ไม่พบรายการตามตัวกรอง</td></tr>';
  }
  function earliestCheckpoint() {
    return new Promise(resolve=>{
      if(!window.indexedDB){resolve(null);return;}
      const req=indexedDB.open('driveStationChecklist_safety_v1',1);
      req.onerror=()=>resolve(null);
      req.onsuccess=()=>{
        const db=req.result;if(!db.objectStoreNames.contains('snapshots')){db.close();resolve(null);return;}
        const cursor=db.transaction('snapshots','readonly').objectStore('snapshots').openCursor();
        cursor.onerror=()=>{db.close();resolve(null);};
        cursor.onsuccess=()=>{const row=cursor.result;if(!row){db.close();resolve(null);}else if(row.value.reason==='before-upgrade'){db.close();resolve(row.value);}else row.continue();};
      };
    });
  }
  async function exportBackup() {
    const payload={app:'Drive Station Checklist',version:4,exported_at:new Date().toISOString(),records:getRecords(),draft:serialize(),drafts:read(DRAFTS,{}),offline_queue:readOfflineQueue(),upgrade_checkpoint:(await earliestCheckpoint())||baseline};
    const cons=localStorage.getItem('driveStationChecklist_consumption_records_v1');if(cons!==null)payload.consumption_records=JSON.parse(cons);
    downloadBlob(JSON.stringify(payload,null,2),'application/json',`drive_station_backup_${today()}.json`);
  }
  async function importBackup(payload) {
    if(!Array.isArray(payload)&&(!payload||typeof payload!=='object'||!Array.isArray(payload.records)))throw new Error('ไฟล์ต้องมีรายการ records');
    const incoming=Array.isArray(payload)?payload.slice():payload.records.slice();
    if(payload.offline_queue!==undefined){
      if(!Array.isArray(payload.offline_queue))throw new Error('คิวในไฟล์ไม่ถูกต้อง');
      for(const entry of payload.offline_queue){
        if(!entry||!['create','update','delete'].includes(entry.action))throw new Error('คำสั่งในคิวไม่ถูกต้อง');
        if(entry.action!=='delete'&&entry.data)incoming.push(entry.data);
      }
    }
    incoming.forEach(r=>{if(!r||typeof r!=='object'||Array.isArray(r)||(!r.data&&!r.inspection_data))throw new Error('ข้อมูลรายการตรวจไม่ครบ');});
    const result=mergeImport(getRecords(),incoming);
    // Validate all sections before writing anything.
    let consumption=null;
    if(payload.consumption_records!==undefined){
      if(!Array.isArray(payload.consumption_records))throw new Error('ข้อมูล Consumption ไม่ถูกต้อง');
      const existing=read('driveStationChecklist_consumption_records_v1',[]),seen=new Map(existing.map(r=>[recordId(r),r]));
      consumption=existing.slice();
      for(const value of payload.consumption_records){
        if(!value||typeof value!=='object'||!recordId(value))throw new Error('ข้อมูล Consumption ไม่ครบ');
        const old=seen.get(recordId(value));if(old&&same(old,value))continue;
        const r=clone(value);if(old)r.id=r.record_id=`${recordId(r)}-import-${hash(r)}`;
        if(!seen.has(recordId(r))){seen.set(recordId(r),r);consumption.push(r);}
      }
    }
    const drafts=read(DRAFTS,{});
    for(const [key,value] of Object.entries(payload.drafts||{}))if(!drafts[key]&&value?.data)drafts[key]=value;
    await checkpoint('before-import');
    await archive({id:`import-${Date.now()}-${Math.random()}`,reason:'import-source',payload:clone(payload)});
    result.added.forEach(r=>enqueueOffline({action:'create',data:sheetPayloadFromRecord(r),queued_at:new Date().toISOString(),revision_id:crypto.randomUUID()}));
    setRecords(result.records);
    if(consumption)localStorage.setItem('driveStationChecklist_consumption_records_v1',JSON.stringify(consumption));
    localStorage.setItem(DRAFTS,JSON.stringify(drafts));
    renderHistory();return result.added.length;
  }
  function exportPoints() {
    const headers=['record_id','template_version','checklist_name','inspection_date','operator_name','machine_location','SMU','section','item_no','inspection_item','standard','actual','visual','sound','vibration_status','vibration_mm_s','vibration_input_mm_s','vibration_output_mm_s','remark'];
    const lines=[headers];
    getRecords().forEach(r=>{
      const d=r.data,t=CHECKLIST_TEMPLATES[d.checklist_type]||CHECKLIST_TEMPLATES.drive_station;
      t.items.forEach(i=>{const n=i.no;lines.push([r.id,d.template_version||'legacy',d.checklist_name,d.inspection_date,d.operator_name,d.machine_location,d.smu,i.section,i.displayNo||n,i.item,d[`standard_${n}`],d[`actual_${n}`],d[`visual_${n}`],d[`sound_${n}`],d[`vibration_status_${n}`],d[`vibration_${n}`],d[`vibration_input_${n}`],d[`vibration_output_${n}`],d[`remark_${n}`]]);});
    });
    downloadBlob('\ufeff'+lines.map(r=>r.map(v=>csvCell(/^[=+@\-\t\r]/.test(String(v??''))?`'${v}`:v)).join(',')).join('\r\n'),'text/csv;charset=utf-8',`drive_station_inspection_points_${today()}.csv`);
  }
  function install() {
    Object.assign(CHECKLIST_TEMPLATES,window.CHECKLIST_TEMPLATE_ADDITIONS);
    previousNormalize=normalizeRecord;previousApi=apiRequest;previousRender=renderChecklist;
    countNG=data=>Object.entries(data||{}).filter(([k,v])=>/^(visual|sound|vibration_status|vibration)_\d+$/.test(k)&&v==='NG').length;
    baseline=snapshot('before-upgrade');
    backupReady=localStorage.getItem('driveStationChecklist_upgrade_completed_v4')?Promise.resolve():checkpoint('before-upgrade').then(()=>localStorage.setItem('driveStationChecklist_upgrade_completed_v4','1'));
    backupReady.catch(()=>{});
    normalizeRecord=normalize;
    loadCachedRecords=function(){try{const saved=read(RECORDS_KEY,EMBEDDED_RECORDS);if(!Array.isArray(saved))throw new Error('ประวัติในเครื่องไม่ถูกต้อง');return saved.map(normalizeRecord);}catch(error){window.checklistStorageError=error;return clone(EMBEDDED_RECORDS).map(normalizeRecord);}};
    recordsCache=loadCachedRecords();
    setRecords=function(records){if(window.checklistStorageError)throw window.checklistStorageError;const normalized=records.map(normalizeRecord);localStorage.setItem(RECORDS_KEY,JSON.stringify(normalized));recordsCache=normalized;};
    readOfflineQueue=function(){const queue=read(OFFLINE_QUEUE_KEY,[]);if(!Array.isArray(queue))throw new Error('คิวข้อมูลในเครื่องไม่ถูกต้อง');return queue;};
    apiRequest=async function(action,payload={}){
      if(isPreview())throw new Error('โหมดทดลอง ไม่ส่งข้อมูลไป Google Sheets');
      if(!isApiConfigured()||navigator.onLine===false)throw new Error('ยังเชื่อมต่อ Google Sheets ไม่ได้');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
      try{
        const response=await fetch(getApiUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({api_key:API_KEY,action,...payload}),signal:controller.signal});
        const json=await response.json();if(!response.ok||!json.success)throw new Error(json.message||`HTTP ${response.status}`);return json;
      }finally{clearTimeout(timeout);}
    };
    flushOfflineQueue=flush;refreshRecords=refresh;saveRecord=save;
    serialize=serializeSafe;applyData=applySafe;renderChecklist=render;rowHtml=row;updateSummary=update;saveDraft=saveDrafts;
    countNG=data=>Object.entries(data||{}).filter(([k,v])=>/^(visual|sound|vibration_status|vibration)_\d+$/.test(k)&&v==='NG').length;
    recordNGCount=r=>countNG(r.data||{});
    collectIssues=function(records){const issues={};records.forEach(r=>{const d=r.data;getTemplateForRecord(r).items.forEach(i=>{if(statusKeys(i.no).some(k=>d[k]==='NG')||d[`remark_${i.no}`]){const key=`${i.section} - ${i.item}${d[`remark_${i.no}`]?' | '+d[`remark_${i.no}`]:''}`;issues[key]=(issues[key]||0)+1;}});});return Object.entries(issues).sort((a,b)=>b[1]-a[1]).slice(0,12);};
    initChecklistSelector=function(){
      $('checklistType').innerHTML=Object.entries(CHECKLIST_TEMPLATES).sort(([a],[b])=>a===NEW_TYPE?-1:b===NEW_TYPE?1:0).map(([key,t])=>`<option value="${key}">${esc(t.name)}${key==='drive_station'?' (แบบเดิม · 51 รายการ)':''}</option>`).join('');
      const saved=localStorage.getItem('driveStationChecklist_selected_type_v3');renderChecklist(CHECKLIST_TEMPLATES[saved]?saved:NEW_TYPE);
    };
    restoreDraft=function(){
      try{
        const drafts=read(DRAFTS,{}),draft=drafts[currentChecklistKey];
        if(draft?.data){editingId=draft.editingId||null;applyData(draft.data);return;}
        const legacy=read(DRAFT_KEY,null);
        if(legacy&&Object.keys(legacy).length){editingId=null;applyData(legacy);return;}
        applyData({checklist_type:currentChecklistKey});
      }catch(error){window.checklistStorageError=error;updateSummary();}
    };
    changeChecklist=function(key){
      if(key===currentChecklistKey)return;
      try{saveDraft();const draft=read(DRAFTS,{})[key];editingId=draft?.editingId||null;applyData(draft?.data||{checklist_type:key});saveDraft();}catch(error){alert(error.message);$('checklistType').value=currentChecklistKey;}
    };
    clearFormData=function(){if(!confirm('เริ่มรายการใหม่หรือไม่? ร่างปัจจุบันจะเก็บในสำเนาสำรอง และประวัติทั้งหมดจะยังอยู่'))return;checkpoint('before-new-form').then(()=>{editingId=null;retained={};applyData({checklist_type:currentChecklistKey});saveDraft();setConnectionStatus('พร้อมบันทึกรายการใหม่','online');}).catch(error=>alert(error.message));};
    editRecord=async function(id){
      try{saveDraft();}catch(error){alert(error.message);return;}
      let rec=getRecords().find(r=>r.id===id);
      if(!rec)return;
      editingId=id;applyData(rec.data);saveDraft();setConnectionStatus('กำลังแก้ไขรายการเดิม','online');
      $('checklistPage').classList.remove('hidden');$('dashboardPage').classList.remove('active');window.scrollTo({top:0,behavior:'smooth'});
    };
    duplicateRecord=function(id){const rec=getRecords().find(r=>r.id===id);if(!rec)return;try{saveDraft();editingId=null;const data={...rec.data,inspection_date:today()};delete data.record_id;applyData(data);saveDraft();setConnectionStatus('คัดลอกเป็นรายการใหม่','online');window.scrollTo({top:0,behavior:'smooth'});}catch(error){alert(error.message);}};
    deleteRecord=()=>alert('ระบบเก็บรักษาประวัติเดิม หากข้อมูลไม่ถูกต้องให้เปิดแก้ไขหรือคัดลอกเป็นรายการใหม่');
    renderHistory=history;exportDatabase=exportBackup;exportAllCSV=exportPoints;
    importDatabase=async function(event){const file=event.target.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());if(!confirm('นำเข้าและรวมกับประวัติเดิมหรือไม่? รายการเดิมจะคงอยู่ และข้อมูลรหัสซ้ำที่ต่างกันจะแยกเป็นสำเนา'))return;const count=await importBackup(payload);setConnectionStatus(`นำเข้าเพิ่ม ${count} รายการ · รอส่ง`,'saved');alert(`นำเข้าเพิ่ม ${count} รายการ โดยรักษาข้อมูลเดิมทั้งหมด`);}catch(error){alert(`นำเข้าไม่สำเร็จ: ${error.message}`);}finally{event.target.value='';}};
  }
  function mount() {
    if(mounted)return;mounted=true;
    const link=document.createElement('link');link.rel='stylesheet';link.href='./checklist-upgrade.css?v=20261105';document.head.appendChild(link);
    const header=document.querySelector('#checklistPage .header');
    header.insertAdjacentHTML('afterbegin','<div class="inspection-eyebrow">DAILY INSPECTION / ระบบสายพาน</div>');
    header.insertAdjacentHTML('beforeend','<div id="templateInfo" class="template-info"></div>');
    const tools=document.createElement('section');tools.className='inspection-tools';
    tools.innerHTML='<div class="inspection-progress"><span id="progressText"></span><progress id="inspectionProgress" value="0" max="70" aria-label="รายการที่มีข้อมูล"></progress><span id="draftStatus" role="status">เก็บร่างระหว่างกรอกอัตโนมัติ</span></div><div class="inspection-filters"><label>ค้นหารายการ<input id="rowSearch" type="search" placeholder="เช่น Pulley, Oil, Coupling"></label><label>หมวดตรวจ<select id="sectionFilter"></select></label><label>แสดงรายการ<select id="rowFilter"><option value="all">ทั้งหมด</option><option value="pending">ยังไม่มีข้อมูล</option><option value="ng">พบ NG</option></select></label><span id="filterCount" aria-live="polite"></span></div>';
    form.querySelector('.summary').after(tools);
    ['rowSearch','sectionFilter','rowFilter'].forEach(id=>$(id).addEventListener(id==='rowSearch'?'input':'change',filterRows));
    $('historySearch').removeAttribute('oninput');$('historySearch').addEventListener('input',renderHistory);
    document.querySelector('.history-head').insertAdjacentHTML('afterend','<div class="history-filters"><label>แบบตรวจ<select id="historyType"><option value="">ทุกแบบตรวจ</option>'+Object.entries(CHECKLIST_TEMPLATES).map(([k,t])=>`<option value="${k}">${esc(t.name)}</option>`).join('')+'</select></label><label>ประวัติ<select id="historyMode"><option value="all">ทุกรายการ</option><option value="latest">ล่าสุดในกลุ่มซ้ำ</option></select></label><span>เก็บประวัติทุกเวอร์ชันของแบบตรวจ</span></div>');
    $('historyType').addEventListener('change',renderHistory);$('historyMode').addEventListener('change',renderHistory);
    $('historyBody').addEventListener('click',event=>{const button=event.target.closest('[data-record-action]');if(!button)return;if(button.dataset.recordAction==='edit')editRecord(button.dataset.record);else duplicateRecord(button.dataset.record);});
    document.querySelector('.toolbar .danger').textContent='เริ่มรายการใหม่';
    document.querySelector('.history-head button').textContent='ส่งออก CSV รายจุด';
    $('saveButton').textContent='บันทึกผลตรวจ';
    document.querySelector('.toolbar').insertAdjacentHTML('beforeend','<span id="saveFeedback" role="status" aria-live="polite"></span>');
    document.querySelector('.signatures').innerHTML=['ผู้ตรวจ / Operator','หัวหน้างาน / FM.','วิศวกร / EN.','ผู้อนุมัติ'].map((label,i)=>`<label class="signature">${label}<input class="text-input" name="signoff_${i}" aria-label="${label}" placeholder="ชื่อผู้ลงนาม"></label>`).join('');
    document.querySelector('.footer-note').textContent='เก็บร่างในเบราว์เซอร์นี้อัตโนมัติ · ประวัติที่รอส่งจะแสดงในตาราง · ใช้สำรองข้อมูลทั้งหมดเมื่อต้องการย้ายเครื่อง';
    const saved=clone(retained);applyData(saved);
    form.addEventListener('input',event=>{if(applying||!event.target.name)return;dirty.add(event.target.name);try{saveDraft();}catch(error){$('draftStatus').textContent='เก็บร่างไม่สำเร็จ กรุณาส่งออกข้อมูลปัจจุบัน';}});
    let checkedBefore=null;
    form.addEventListener('pointerdown',event=>{checkedBefore=event.target.type==='radio'&&event.target.checked?event.target:null;});
    form.addEventListener('click',event=>{if(event.target===checkedBefore&&event.target.type==='radio'){event.target.checked=false;dirty.add(event.target.name);checkedBefore=null;saveDraft();}});
    window.addEventListener('beforeunload',()=>{try{saveDraft();}catch(error){}});
    refreshTools();updateSummary();renderHistory();
    const oldDashboard=renderDashboard;
    renderDashboard=function(...args){
      const result=oldDashboard.apply(this,args),types={Visual:0,Sound:0,Vibration:0};
      filteredDashboardRecords().forEach(r=>Object.entries(r.data||{}).forEach(([key,value])=>{
        if(value!=='NG')return;if(/^visual_\d+$/.test(key))types.Visual++;else if(/^sound_\d+$/.test(key))types.Sound++;else if(/^vibration_(?:status_)?\d+$/.test(key))types.Vibration++;
      }));
      drawDonut($('ngTypeChart'),Object.keys(types),Object.values(types));return result;
    };
    document.querySelectorAll('.kpi-note').forEach(el=>{if(el.textContent==='Visual + Sound')el.textContent='Visual + Sound + Vibration';});
    const vibrationHeader=document.querySelector('#checklistForm > .table-wrap thead tr:first-child th:nth-child(7)');
    if(vibrationHeader)vibrationHeader.innerHTML='Vibration<br><span style="font-weight:400">OK / NG · mm/s RMS</span>';
    if(isPreview()){const note=document.createElement('div');note.className='preview-note';note.textContent='โหมดทดลอง: บันทึกเฉพาะเบราว์เซอร์นี้ ไม่ส่งข้อมูลเข้า Google Sheets จริง';document.querySelector('.toolbar').after(note);}
    if(window.checklistStorageError)alert('พบข้อมูลในเครื่องที่อ่านไม่ได้ ระบบยังเก็บต้นฉบับไว้ กรุณาสำรองข้อมูลก่อนแก้ไข');
  }
  window.ChecklistUpgrade={install,mount,mergeRecords,mergeImport,importBackup,exportPoints,checkpoint,today,ready:()=>backupReady};
})();
