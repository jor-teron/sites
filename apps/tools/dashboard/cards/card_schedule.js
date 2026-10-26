/* Card: Today's Schedule — time + label timeline, sorted; past dimmed, current/next highlighted. Re-renders every minute. */
(function(){
  function mins(t){var p=t.split(':');return +p[0]*60+ +p[1];}
  MyDay.register({id:'schedule',title:"Today's Schedule",defaultOn:true,render:function(box,api){
    var el=api.el,items=api.store.get('schedule',[]);
    function save(){api.store.set('schedule',items);api.rerender();}
    items.sort(function(a,b){return mins(a.time)-mins(b.time);});
    var d=new Date(),now=d.getHours()*60+d.getMinutes(),cur=-1,nxt=-1;
    items.forEach(function(it,i){var s=mins(it.time),e=i+1<items.length?mins(items[i+1].time):s+60;
      if(s<=now&&now<e)cur=i;else if(s>now&&nxt<0)nxt=i;});
    if(cur>=0)nxt=-1;
    var ul=el('ul',{'class':'list tl'});
    if(!items.length)box.appendChild(el('div',{'class':'empty',text:'Nothing planned. Add a time below.'}));
    items.forEach(function(it,i){
      var cls=i===cur?'now':i===nxt?'next':mins(it.time)<now?'past':'';
      ul.appendChild(el('li',{'class':cls},[el('span',{'class':'t',text:MDStore.fmtTime(it.time)}),el('span',{'class':'grow',text:it.label}),
        cls==='now'?el('span',{'class':'tag',text:'NOW'}):cls==='next'?el('span',{'class':'tag',text:'NEXT'}):null,
        el('button',{'class':'btn small danger','aria-label':'Delete '+it.label,text:'✕',onclick:function(){items=items.filter(function(x){return x!==it;});save();}})]));
    });
    box.appendChild(ul);
    var tm=el('input',{type:'time','aria-label':'Time',value:'09:00'}),lb=el('input',{type:'text',placeholder:'What…','aria-label':'Event'});
    function add(){var l=lb.value.trim();if(!l||!tm.value)return;items.push({id:api.store.uid(),time:tm.value,label:l});save();}
    lb.addEventListener('keydown',function(e){if(e.key==='Enter')add();});
    box.appendChild(el('div',{'class':'addrow'},[tm,lb,el('button',{'class':'btn primary',text:'Add',onclick:add})]));
    if(!box._t){box._t=setInterval(function(){if(document.activeElement&&box.contains(document.activeElement))return;if(document.body.contains(box))api.rerender();else clearInterval(box._t);},60000);}
  }});
})();
