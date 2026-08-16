(()=>{
  if(typeof Chart==='undefined')return;

  const plugin={
    id:'temperatureTrendReadability',
    beforeDatasetsDraw(chart){
      if(chart.canvas?.id!=='temperatureTrendChart')return;
      const y=chart.scales?.y,area=chart.chartArea;
      if(!y||!area)return;
      const ctx=chart.ctx;
      const y40=y.getPixelForValue(40),y70=y.getPixelForValue(70);
      ctx.save();
      // High zone >70
      ctx.fillStyle='rgba(220,53,69,.07)';
      ctx.fillRect(area.left,area.top,area.right-area.left,Math.max(0,y70-area.top));
      // Normal operating zone 40-70
      ctx.fillStyle='rgba(25,135,84,.08)';
      ctx.fillRect(area.left,y70,area.right-area.left,Math.max(0,y40-y70));
      // Low zone <40
      ctx.fillStyle='rgba(255,193,7,.07)';
      ctx.fillRect(area.left,y40,area.right-area.left,Math.max(0,area.bottom-y40));
      ctx.restore();
    },
    afterDatasetsDraw(chart){
      if(chart.canvas?.id!=='temperatureTrendChart')return;
      const ds=chart.data?.datasets?.[0];
      const meta=chart.getDatasetMeta(0);
      const values=(ds?.data||[]).map(Number).filter(Number.isFinite);
      if(!values.length||!meta?.data?.length)return;
      const ctx=chart.ctx,area=chart.chartArea,y=chart.scales?.y;
      const avg=values.reduce((a,b)=>a+b,0)/values.length;
      ctx.save();
      // Average line
      if(y){
        const py=y.getPixelForValue(avg);
        ctx.strokeStyle='rgba(90,105,120,.65)';
        ctx.setLineDash([5,5]);
        ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(area.left,py);ctx.lineTo(area.right,py);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='rgba(70,85,100,.9)';
        ctx.font='600 10px system-ui, sans-serif';
        ctx.textAlign='right';
        ctx.fillText(`Avg ${avg.toFixed(1)}°C`,area.right-4,Math.max(area.top+11,py-5));
      }
      // Values on each point
      meta.data.forEach((pt,i)=>{
        const v=Number(ds.data[i]);if(!Number.isFinite(v))return;
        const text=`${v.toFixed(1)}°`;
        ctx.font='700 10px system-ui, sans-serif';
        const w=ctx.measureText(text).width+8;
        const x=pt.x,yPos=Math.max(area.top+9,pt.y-15);
        ctx.fillStyle='rgba(255,255,255,.92)';
        ctx.strokeStyle='rgba(86,105,121,.20)';
        ctx.lineWidth=1;
        const rx=x-w/2,ry=yPos-10,rh=16,r=5;
        ctx.beginPath();
        ctx.roundRect?ctx.roundRect(rx,ry,w,rh,r):ctx.rect(rx,ry,w,rh);
        ctx.fill();ctx.stroke();
        ctx.fillStyle='#24465f';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(text,x,ry+rh/2+.5);
      });
      ctx.restore();
    }
  };
  try{Chart.register(plugin)}catch(e){}

  function shortDateLabel(value){
    const s=String(value||'');
    const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return s;
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${m[3]} ${months[Number(m[2])-1]}`;
  }

  function getTempChart(){
    const canvas=document.getElementById('temperatureTrendChart');
    if(!canvas)return null;
    try{return Chart.getChart?Chart.getChart(canvas):null}catch(e){return null}
  }

  function ensureSummaryChips(values){
    const latest=document.getElementById('tempLatest');
    const summary=latest?.closest('.condition-summary');
    if(!summary)return;
    let avgEl=document.getElementById('tempAvgReadable');
    let trendEl=document.getElementById('tempTrendReadable');
    if(!avgEl){
      const sp=document.createElement('span');
      sp.innerHTML='เฉลี่ย: <b id="tempAvgReadable">-</b>';
      summary.appendChild(sp);avgEl=sp.querySelector('b');
    }
    if(!trendEl){
      const sp=document.createElement('span');
      sp.innerHTML='Trend: <b id="tempTrendReadable">-</b>';
      summary.appendChild(sp);trendEl=sp.querySelector('b');
    }
    if(values.length){
      const avg=values.reduce((a,b)=>a+b,0)/values.length;
      avgEl.textContent=`${avg.toFixed(1)} °C`;
      if(values.length>1){
        const diff=values.at(-1)-values.at(-2);
        const arrow=Math.abs(diff)<0.05?'→':diff>0?'↑':'↓';
        const word=Math.abs(diff)<0.05?'คงที่':diff>0?'สูงขึ้น':'ลดลง';
        trendEl.textContent=`${arrow} ${word} ${Math.abs(diff).toFixed(1)} °C`;
      }else trendEl.textContent='→ ยังไม่มีค่าก่อนหน้า';
    }else{avgEl.textContent='-';trendEl.textContent='-'}
  }

  function addLegend(){
    const canvas=document.getElementById('temperatureTrendChart');
    const wrap=canvas?.closest('.chart-wrap');
    if(!wrap||wrap.parentElement.querySelector('.temp-zone-legend'))return;
    const legend=document.createElement('div');
    legend.className='temp-zone-legend';
    legend.innerHTML='<span><i class="low"></i>&lt;40°C ต่ำ</span><span><i class="normal"></i>40–70°C ปกติ</span><span><i class="high"></i>&gt;70°C สูง</span>';
    wrap.before(legend);
  }

  function enhance(){
    const chart=getTempChart();if(!chart)return;
    const ds=chart.data?.datasets?.[0];
    const values=(ds?.data||[]).map(Number).filter(Number.isFinite);
    chart.options.plugins=chart.options.plugins||{};
    chart.options.plugins.legend={...(chart.options.plugins.legend||{}),display:false};
    chart.options.plugins.tooltip={...(chart.options.plugins.tooltip||{}),callbacks:{
      title(items){return items?.[0]?`วันที่ ${shortDateLabel(items[0].label)}`:''},
      label(ctx){const v=Number(ctx.raw);return `อุณหภูมิ: ${Number.isFinite(v)?v.toFixed(1):ctx.raw} °C`},
      afterLabel(ctx){const v=Number(ctx.raw);if(!Number.isFinite(v))return '';return v>70?'สถานะ: สูง':v<40?'สถานะ: ต่ำ':'สถานะ: ปกติ'}
    }};
    if(chart.options.scales?.x?.ticks){
      chart.options.scales.x.ticks.maxRotation=0;
      chart.options.scales.x.ticks.minRotation=0;
      chart.options.scales.x.ticks.autoSkip=true;
      chart.options.scales.x.ticks.maxTicksLimit=7;
      chart.options.scales.x.ticks.callback=function(value,index){return shortDateLabel(chart.data.labels?.[index]??this.getLabelForValue(value))};
    }
    if(ds){
      ds.tension=.22;
      ds.pointRadius=4;
      ds.pointHoverRadius=6;
      ds.pointBorderWidth=2;
      ds.fill=false;
      ds.segment={borderColor:ctx=>{
        const v=Number(ctx.p1.parsed.y);return v>70?'#c0392b':v<40?'#c58a00':'#246c92';
      }};
    }
    ensureSummaryChips(values);
    addLegend();
    chart.update('none');
  }

  const style=document.createElement('style');
  style.textContent=`.temp-zone-legend{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:6px 0 2px;font-size:11px;color:#5c6d79}.temp-zone-legend span{display:flex;align-items:center;gap:5px}.temp-zone-legend i{width:12px;height:8px;border-radius:2px;display:inline-block}.temp-zone-legend i.low{background:rgba(255,193,7,.35)}.temp-zone-legend i.normal{background:rgba(25,135,84,.30)}.temp-zone-legend i.high{background:rgba(220,53,69,.28)}#temperatureTrendChart{min-height:270px}`;
  document.head.appendChild(style);

  const original=window.renderConditionTrends;
  if(typeof original==='function'){
    window.renderConditionTrends=function(...args){const r=original.apply(this,args);setTimeout(enhance,0);return r};
  }
  document.addEventListener('change',e=>{if(['tempPoint','tempDisplayMode','dashChecklistFilter','dashMachineFilter','dashDateFrom','dashDateTo'].includes(e.target?.id))setTimeout(enhance,50)});
  setTimeout(enhance,400);
  setTimeout(enhance,1200);
})();