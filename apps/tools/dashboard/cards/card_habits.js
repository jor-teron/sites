/* Card: Habits (PD4) — user habits as tap pills; tick for today (local date key), 🔥 streak, 7-day dot strip.
   Store 'habits' = [{id,name,days:{'YYYY-MM-DD':1}}]. Day keys are local dates, so it "resets" at midnight. */
(function(){
  function key(d){var p=function(n){return (n<10?'0':'')+n;};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function back(n){var d=new Date();d.setDate(d.getDate()-n);return key(d);}
  /* Streak: consecutive ticked days ending today (or yesterday if today not yet ticked) */
  function streak(h){var i=h.days[back(0)]?0:1,n=0;while(h.days[back(i)]){n++;i++;}return n;}
  MyDay.register({id:'habits',title:'Habits',defaultOn:true,render:function(box,api){
    var el=api.el,items=api.store.get('habits',[]),today=back(0);
    function save(){api.store.set('habits',items);api.rerender();}
    if(!items.length)box.appendChild(el('div',{'class':'empty',text:'No habits yet. Add one, e.g. Walk.'}));
    var wrap=el('div',{'class':'hb-list'});
    items.forEach(function(h){
      var on=!!h.days[today],s=streak(h);
      var pill=el('button',{'class':'hb-pill'+(on?' on':''),'aria-pressed':on?'true':'false',onclick:function(){
        if(h.days[today])delete h.days[today];else h.days[today]=1;
        /* keep ~60 days */ Object.keys(h.days).forEach(function(k){if(k<back(60))delete h.days[k];});
        box._pop=h.id;save();}},[el('span',{text:(on?'✔ ':'○ ')+h.name}),s?el('span',{'class':'hb-streak',text:'🔥 '+s}):null]);
      if(box._pop===h.id)pill.classList.add('jelly');
      var dots=el('div',{'class':'hb-dots','aria-label':'Last 7 days'});
      for(var i=6;i>=0;i--){var k=back(i);dots.appendChild(el('span',{'class':'hb-dot'+(h.days[k]?' on':'')+(i===0?' today':''),title:k}));}
      wrap.appendChild(el('div',{'class':'hb-row'},[el('div',{'class':'hb-top'},[pill,
        el('button',{'class':'btn small danger','aria-label':'Remove '+h.name,text:'✕',onclick:function(){if(confirm('Remove habit "'+h.name+'"?')){items=items.filter(function(x){return x!==h;});save();}}})]),dots]));
    });
    box._pop=null;box.appendChild(wrap);
    var inp=el('input',{type:'text',placeholder:'New habit…','aria-label':'New habit'});
    function add(){var t=inp.value.trim();if(!t)return;items.push({id:api.store.uid(),name:t,days:{}});save();}
    inp.addEventListener('keydown',function(e){if(e.key==='Enter')add();});
    box.appendChild(el('div',{'class':'addrow'},[inp,el('button',{'class':'btn primary',text:'Add',onclick:add})]));
    api.setCount(items.filter(function(h){return h.days[today];}).length+'/'+items.length+' today');
  }});
})();
