/* My Day — core: card registry, layout render, top strip (clock/greeting), alerts API, theme.
   Cards call MyDay.register({id,title,render(el,api),defaultOn}). Later cards push alerts via MyDay.alert(). */
(function(){
  var cards=[], alerts={};
  function el(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){if(k==='text')e.textContent=attrs[k];else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k]);}
    (kids||[]).forEach(function(c){if(c)e.appendChild(typeof c==='string'?document.createTextNode(c):c);});return e;}
  function layout(){
    var saved=MDStore.get('layout',null)||[], ids=cards.map(function(c){return c.id;});
    var out=saved.filter(function(s){return ids.indexOf(s.id)>=0;});
    cards.forEach(function(c){
      if(out.some(function(s){return s.id===c.id;}))return;
      var item={id:c.id,on:c.defaultOn!==false};
      /* Cards flagged first:true (e.g. Weather) join at the top even for existing layouts */
      /* Cards flagged after:'id' (e.g. Sun & Moon after Weather) join right after that card */
      var at=c.after?out.map(function(s){return s.id;}).indexOf(c.after):-1;
      if(c.first)out.unshift(item);else if(at>=0)out.splice(at+1,0,item);else out.push(item);
    });
    return out;
  }
  function byId(id){for(var i=0;i<cards.length;i++)if(cards[i].id===id)return cards[i];}
  function renderAll(){
    var host=document.getElementById('cards');host.innerHTML='';
    layout().forEach(function(s){if(!s.on)return;var c=byId(s.id);
      var sec=el('section',{'class':'card','aria-labelledby':'h-'+c.id}),body=el('div');
      var h=el('h2',{id:'h-'+c.id},[c.title]);sec.appendChild(h);sec.appendChild(body);host.appendChild(sec);
      var api={el:el,store:MDStore,rerender:function(){body.innerHTML='';c.render(body,api);},setCount:function(t){var x=h.querySelector('.count');if(!x){x=el('span',{'class':'count'});h.appendChild(x);}x.textContent=t;}};
      try{c.render(body,api);}catch(e){body.textContent='Card error: '+e.message;}
    });
  }
  function tick(){
    var d=new Date(),h=d.getHours();
    document.getElementById('clock').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    document.getElementById('greet').textContent=h<5?'Good night':h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    document.getElementById('date').textContent=d.toLocaleDateString([], {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }
  function drawAlerts(){var a=document.getElementById('alerts');a.innerHTML='';
    Object.keys(alerts).forEach(function(k){var x=alerts[k];a.appendChild(el('div',{'class':'alert'+(x.level==='high'?' hi':''),role:'status'},[x.text]));});}
  function applyTheme(){var t=MDStore.get('theme','auto');
    if(t==='auto')t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    document.documentElement.setAttribute('data-theme',t);}
  window.MyDay={
    el:el,register:function(c){cards.push(c);},cards:function(){return cards;},layout:layout,
    saveLayout:function(l){MDStore.set('layout',l);renderAll();},renderAll:renderAll,tick:tick,applyTheme:applyTheme,
    /* alert(key,text,level 'high'|'med') adds/replaces; clearAlert(key) removes */
    alert:function(k,t,l){alerts[k]={text:t,level:l||'med'};drawAlerts();},clearAlert:function(k){delete alerts[k];drawAlerts();}
  };
})();
