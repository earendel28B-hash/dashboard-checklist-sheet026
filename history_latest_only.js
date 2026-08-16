(()=>{
  function ready(fn){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }

  ready(()=>{
    if(typeof window.getRecords!=='function'||typeof window.escapeHtml!=='function'||typeof window.formatInspectionDate!=='function')return;

    const makeKey=r=>{
      const d=r?.data||{};
      return [
        d.checklist_name||'',
        d.inspection_date||'',
        d.operator_name||'',
        d.machine_location||'',
        d.smu||'',
        d.inspection_type||''
      ].map(v=>String(v).trim().toLowerCase()).join('|||');
    };

    const latestUnique=records=>{
      const sorted=records.slice().sort((a,b)=>{
        const ad=String(a?.data?.inspection_date||'');
        const bd=String(b?.data?.inspection_date||'');
        if(ad!==bd)return bd.localeCompare(ad);
        return String(b?.updated_at||b?.created_at||'').localeCompare(String(a?.updated_at||a?.created_at||''));
      });
      const seen=new Set();
      return sorted.filter(r=>{
        const key=makeKey(r);
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      });
    };

    window.renderHistory=function(){
      const q=(document.getElementById('historySearch')?.value||'').toLowerCase();
      const all=window.getRecords();
      const filtered=all.filter(r=>{
        const d=r.data||{};
        return [d.checklist_name,d.inspection_date,d.operator_name,d.machine_location,d.smu,d.inspection_type]
          .join(' ').toLowerCase().includes(q);
      });
      const records=latestUnique(filtered);

      const countEl=document.getElementById('recordCount');
      const body=document.getElementById('historyBody');
      if(countEl)countEl.textContent=`${records.length} รายการ`;
      if(!body)return;

      body.innerHTML=records.length?records.map(r=>{
        const d=r.data||{};
        const ng=typeof window.recordNGCount==='function'?window.recordNGCount(r):(r.ng_count||0);
        const fmtDate=window.formatInspectionDate(d.inspection_date);
        return `<tr>
          <td>${window.escapeHtml(d.checklist_name||'Drive Station')}</td>
          <td>${window.escapeHtml(fmtDate)}</td>
          <td>${window.escapeHtml(d.operator_name||'')}</td>
          <td>${window.escapeHtml(d.machine_location||'')}</td>
          <td>${window.escapeHtml(d.smu||'')}</td>
          <td>${window.escapeHtml(d.inspection_type||'')}</td>
          <td style="text-align:center;font-weight:700;color:${ng?'var(--ng)':'var(--ok)'}">${ng||0}</td>
          <td>${typeof window.formatDateTime==='function'?window.escapeHtml(window.formatDateTime(r.updated_at||r.created_at)):''}</td>
          <td><div class="history-actions"><button type="button" onclick="editRecord('${r.id}')">เปิด/แก้ไข</button><button type="button" onclick="duplicateRecord('${r.id}')">คัดลอก</button><button type="button" class="delete" onclick="deleteRecord('${r.id}')">ลบ</button></div></td>
        </tr>`;
      }).join(''):'<tr><td colspan="9" class="empty-history">ยังไม่มีข้อมูลที่บันทึก</td></tr>';
    };

    const search=document.getElementById('historySearch');
    if(search){
      search.removeAttribute('oninput');
      search.addEventListener('input',window.renderHistory);
    }

    window.renderHistory();
  });
})();