/* Card: News (PD8, minimal PD8.1) — top 3 headlines (title, source, time); tap opens in a new tab.
   Places: Assam + India built in, plus user places in store 'news.places' (['Jorhat',…]); add via + (inline input), remove via ×.
   Source: Google News RSS (Assam / own place = search "<place> when:2d", India = top stories) read through feedrapp.info,
   a free RSS->JSON service with Access-Control-Allow-Origin:* (no key). Fallback: allorigins.win raw XML.
   Selected place in 'news.region' ('assam'|'india'|'p:<name>'); last lists in 'news.cache' {key:{t,items}} (kept for offline).
   Refresh: ↻ button, plus automatic once after 6 AM and once after 6 PM local time (on open, or when the boundary passes while open). */
(function(){
  var busy=false,tried={},cur=null;
  var GN='https://news.google.com/rss',TAIL='&hl=en-IN&gl=IN&ceid=IN:en';
  function feed(key){if(key==='india')return GN+'?'+TAIL.slice(1);return GN+'/search?q='+encodeURIComponent(key==='assam'?'Assam':key.slice(2))+'+when:2d'+TAIL;}
  function places(){return [['assam','Assam'],['india','India']].concat(MDStore.get('news.places',[]).map(function(n){return ['p:'+n,n];}));}
  function viaFeedr(u){return fetch('https://feedrapp.info/?num=20&q='+encodeURIComponent(u)).then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(j){if(j.responseStatus&&j.responseStatus!==200)throw 0;return ((j.responseData&&j.responseData.feed&&j.responseData.feed.entries)||[]).map(function(e){return {title:e.title,link:e.link,t:Date.parse(e.publishedDate)||0};});});}
  function viaOrigins(u){return fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(u)).then(function(r){if(!r.ok)throw 0;return r.text();})
    .then(function(x){var d=new DOMParser().parseFromString(x,'text/xml');if(!d.querySelector('channel'))throw 0;return [].map.call(d.querySelectorAll('item'),function(it){
      var g=function(n){var e=it.querySelector(n);return e?e.textContent:'';};return {title:g('title'),link:g('link'),t:Date.parse(g('pubDate'))||0,src:g('source')};});});}
  /* Google News titles end with " - Source" */
  function tidy(list){return list.filter(function(x){return x.title&&/^https?:/.test(x.link);}).map(function(x){
      var i=x.title.lastIndexOf(' - '),src=x.src||(i>0?x.title.slice(i+3):''),ti=i>0&&(!x.src||x.title.slice(i+3)===x.src)?x.title.slice(0,i):x.title;
      return {title:ti,src:src,link:x.link,t:x.t};})
    .sort(function(a,b){return b.t-a.t;}).slice(0,3);}
  function ago(t){if(!t)return '';var m=Math.round((Date.now()-t)/60000);
    var rel=m<1?'now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago';
    var d=new Date(t),today=new Date().toDateString()===d.toDateString();
    return rel+' · '+(today?'':d.toLocaleDateString([],{day:'numeric',month:'short'})+' ')+MDStore.fmtTime(d);}
  /* Most recent 6 AM / 6 PM local boundary at or before now */
  function boundary(){var d=new Date(),b=new Date(d);b.setMinutes(0,0,0);
    if(d.getHours()>=18)b.setHours(18);else if(d.getHours()>=6)b.setHours(6);else{b.setDate(b.getDate()-1);b.setHours(18);}return b.getTime();}
  function cache(){var c=MDStore.get('news.cache',{});
    if(c&&c.region){var o={};o[c.region]={t:c.t,items:c.items};c=o;MDStore.set('news.cache',c);} /* PD8 single-list shape */
    return c||{};}
  function load(key){
    if(busy||!cur)return;busy=true;tried[key]=Date.now();cur.rerender();
    var u=feed(key);
    viaFeedr(u).catch(function(){return viaOrigins(u);}).then(function(l){var c=cache();c[key]={t:Date.now(),items:tidy(l)};MDStore.set('news.cache',c);MDStore.set('news.err',0);})
    .catch(function(){MDStore.set('news.err',Date.now());})
    .then(function(){busy=false;if(cur)cur.rerender();});
  }
  function due(key){var c=cache()[key],b=boundary();return (!c||c.t<b)&&!(tried[key]>=b)&&navigator.onLine!==false;}
  /* Boundary passing while the page stays open */
  setInterval(function(){if(!cur||busy)return;var k=MDStore.get('news.region','assam');if(due(k))load(k);},60000);
  MyDay.register({id:'news',title:'News',defaultOn:true,render:function(box,api){
    cur=api;
    var el=api.el,S=api.store,P=places(),key=S.get('news.region','assam'),err=S.get('news.err',0);
    if(!P.some(function(p){return p[0]===key;}))key='assam';
    var name=P.filter(function(p){return p[0]===key;})[0][1],c=cache()[key];
    var seg=el('div',{'class':'seg nw-seg',role:'radiogroup','aria-label':'News place'});
    P.forEach(function(p){seg.appendChild(el('button',{'class':'btn small',role:'radio','aria-checked':p[0]===key?'true':'false',text:p[1],
      onclick:function(){if(p[0]===key)return;S.set('news.region',p[0]);S.set('news.err',0);api.rerender();}}));
      if(p[0]===key&&key.slice(0,2)==='p:')seg.appendChild(el('button',{'class':'btn small nw-x','aria-label':'Remove '+p[1],title:'Remove '+p[1],text:'×',onclick:function(){
        S.set('news.places',S.get('news.places',[]).filter(function(n){return n!==p[1];}));var cc=cache();delete cc[key];S.set('news.cache',cc);S.set('news.region','assam');api.rerender();}}));});
    seg.appendChild(el('button',{'class':'btn small','aria-label':'Add a place',title:'Add a place',text:'+',onclick:function(){box._add=!box._add;api.rerender();}}));
    var rb=el('button',{'class':'btn small'+(busy?' spin':''),'aria-label':'Refresh news',title:'Refresh',text:'↻',onclick:function(){load(key);}});
    box.appendChild(el('div',{'class':'nw-top'},[seg,rb]));
    if(box._add){
      var inp=el('input',{type:'text',placeholder:'Place, e.g. Jorhat','aria-label':'Place name',maxlength:'40'});
      var add=function(){var n=inp.value.trim().replace(/\s+/g,' ');if(!n)return;var l=S.get('news.places',[]);
        var hit=places().filter(function(p){return p[1].toLowerCase()===n.toLowerCase();})[0];
        if(!hit){l.push(n);S.set('news.places',l);}S.set('news.region',hit?hit[0]:'p:'+n);box._add=false;api.rerender();};
      inp.addEventListener('keydown',function(e){if(e.key==='Enter')add();if(e.key==='Escape'){box._add=false;api.rerender();}});
      box.appendChild(el('div',{'class':'nw-add'},[inp,el('button',{'class':'btn small primary',text:'Add',onclick:add}),el('button',{'class':'btn small',text:'Cancel',onclick:function(){box._add=false;api.rerender();}})]));
      setTimeout(function(){inp.focus();},0);
    }
    if(c&&c.items.length){
      var ul=el('ul',{'class':'nw-list'});
      c.items.forEach(function(it,i){ul.appendChild(el('li',{style:'animation-delay:'+(i*60)+'ms'},[el('a',{href:it.link,target:'_blank',rel:'noopener noreferrer','class':'nw-a'},[
        el('span',{'class':'nw-t',text:it.title}),el('span',{'class':'nw-m',text:(it.src?it.src+' · ':'')+ago(it.t)})])]));});
      box.appendChild(ul);
    }else box.appendChild(el('p',{'class':'wx-small',text:busy?'Loading headlines…':c?'No news for '+name+' right now.':err?'Could not load news. Check the connection and tap ↻.':'Loading headlines…'}));
    var note=c?'Updated '+MDStore.fmtTime(c.t):'';
    if(c&&(!navigator.onLine||err>c.t))note+=' · offline, showing saved';
    box.appendChild(el('div',{'class':'wx-small nw-foot',text:(note?note+' · ':'')+'via Google News'}));
    api.setCount(name);
    if(!busy&&due(key))setTimeout(function(){load(key);},0);
  }});
})();
