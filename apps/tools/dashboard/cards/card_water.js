/* Card: Water (PD4) — glass fills with a jelly wobble; +1 glass / undo; ring "5/8 · 1.25 L".
   Store 'water.log' = {'YYYY-MM-DD':glasses} (last 7 days kept); 'water.size' ml (250), 'water.goal' (8) set in Settings. */
(function(){
  function key(d){var p=function(n){return (n<10?'0':'')+n;};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function back(n){var d=new Date();d.setDate(d.getDate()-n);return key(d);}
  MyDay.register({id:'water',title:'Water',defaultOn:true,render:function(box,api){
    var el=api.el,S=api.store,log=S.get('water.log',{}),t=back(0),n=log[t]||0;
    var size=S.get('water.size',250),goal=S.get('water.goal',8),pct=Math.min(1,n/goal);
    function set(v){log[t]=Math.max(0,v);Object.keys(log).forEach(function(k){if(k<back(6))delete log[k];});S.set('water.log',log);box._wob=1;api.rerender();}
    var NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 200 140');svg.setAttribute('class','wt-svg'+(box._wob?' wobble':''));
    var C=2*Math.PI*52,fillY=118-90*pct;
    svg.innerHTML='<circle cx="70" cy="70" r="52" class="wt-ring-bg"/><circle cx="70" cy="70" r="52" class="wt-ring" stroke-dasharray="'+(C*pct)+' '+C+'" transform="rotate(-90 70 70)"/>'+
      '<text x="70" y="68" class="wt-big" text-anchor="middle">'+n+'/'+goal+'</text><text x="70" y="90" class="wt-sm" text-anchor="middle">'+(n*size/1000).toFixed(2).replace(/0$/,'')+' L</text>'+
      '<clipPath id="wtc"><path d="M140 28 L190 28 L184 118 L146 118 Z"/></clipPath>'+
      '<g clip-path="url(#wtc)"><path class="wt-water" d="M130 '+fillY+' q15 -6 30 0 t30 0 t30 0 V130 H130 Z"/></g>'+
      '<path d="M140 28 L190 28 L184 118 L146 118 Z" class="wt-glass"/>';
    box._wob=0;box.appendChild(svg);
    box.appendChild(el('div',{'class':'addrow'},[el('button',{'class':'btn primary',text:'+1 glass ('+size+' ml)',onclick:function(){set(n+1);}}),
      el('button',{'class':'btn',text:'↶ Undo','aria-label':'Undo one glass',onclick:function(){set(n-1);}})]));
    var wk=el('div',{'class':'hb-dots wt-week','aria-label':'Last 7 days'});
    for(var i=6;i>=0;i--){var k=back(i),v=log[k]||0;wk.appendChild(el('span',{'class':'hb-dot'+(v>=goal?' on':v?' half':'')+(i===0?' today':''),title:k+': '+v}));}
    box.appendChild(wk);
    api.setCount(n>=goal?'🎉 goal':Math.max(0,goal-n)+' to go');
  }});
  /* Settings inputs (static in dashboard.html) */
  document.addEventListener('DOMContentLoaded',function(){
    [['wtSize','water.size',250],['wtGoal','water.goal',8]].forEach(function(a){var i=document.getElementById(a[0]);if(!i)return;
      i.value=MDStore.get(a[1],a[2]);i.addEventListener('change',function(){var v=Math.max(1,parseInt(i.value,10)||a[2]);i.value=v;MDStore.set(a[1],v);MyDay.renderAll();});});
  });
})();
