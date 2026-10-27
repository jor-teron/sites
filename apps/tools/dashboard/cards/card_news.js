/* Card: News (PD8) — top 5 headlines (title, source, time); tap opens in a new tab.
   Source: Google News RSS (Assam search "when:2d", or India top stories) read through feedrapp.info,
   a free RSS->JSON service with Access-Control-Allow-Origin:* (no key). Fallback: allorigins.win raw XML.
   Region in store 'news.region' ('assam'|'india'); last good list cached in 'news.cache' {t,region,items} for offline.
   Auto-refresh on open if older than 30 min; ↻ button forces. */
(function(){
  var MAX_AGE=30*60*1000,busy=false,lastTry=0;
  var FEEDS={
    assam:'https://news.google.com/rss/search?q=Assam+when:2d&hl=en-IN&gl=IN&ceid=IN:en',
    india:'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en'
  };
  function viaFeedr(u){return fetch('https://feedrapp.info/?num=20&q='+encodeURIComponent(u)).then(function(r){if(!r.ok)throw 0;return r.json();})
    .then(function(j){return ((j.responseData&&j.responseData.feed&&j.responseData.feed.entries)||[]).map(function(e){return {title:e.title,link:e.link,t:Date.parse(e.publishedDate)||0};});});}
  function viaOrigins(u){return fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(u)).then(function(r){if(!r.ok)throw 0;return r.text();})
    .then(function(x){var d=new DOMParser().parseFromString(x,'text/xml');return [].map.call(d.querySelectorAll('item'),function(it){
      var g=function(n){var e=it.querySelector(n);return e?e.textContent:'';};return {title:g('title'),link:g('link'),t:Date.parse(g('pubDate'))||0,src:g('source')};});});}
  /* Google News titles end with " - Source" */
  function tidy(list){return list.filter(function(x){return x.title&&/^https?:/.test(x.link);}).map(function(x){
      var i=x.title.lastIndexOf(' - '),src=x.src||(i>0?x.title.slice(i+3):''),ti=i>0&&(!x.src||x.title.slice(i+3)===x.src)?x.title.slice(0,i):x.title;
      return {title:ti,src:src,link:x.link,t:x.t};})
    .sort(function(a,b){return b.t-a.t;}).slice(0,5);}
  function ago(t){if(!t)return '';var m=Math.round((Date.now()-t)/60000);
    var rel=m<1?'now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago';
    var d=new Date(t),today=new Date().toDateString()===d.toDateString();
    return rel+' · '+(today?'':d.toLocaleDateString([],{day:'numeric',month:'short'})+' ')+MDStore.fmtTime(d);}
  function load(api,region){
    if(busy)return;busy=true;lastTry=Date.now();api.rerender();
    var u=FEEDS[region];
    viaFeedr(u).catch(function(){return viaOrigins(u);}).then(function(l){var items=tidy(l);if(!items.length)throw 0;
      api.store.set('news.cache',{t:Date.now(),region:region,items:items});api.store.set('news.err',0);})
    .catch(function(){api.store.set('news.err',Date.now());})
    .then(function(){busy=false;api.rerender();});
  }
  MyDay.register({id:'news',title:'News',defaultOn:true,render:function(box,api){
    var el=api.el,S=api.store,region=S.get('news.region','assam'),c=S.get('news.cache',null),err=S.get('news.err',0);
    if(c&&c.region!==region)c=null;
    var seg=el('div',{'class':'seg nw-seg',role:'radiogroup','aria-label':'News region'});
    [['assam','Assam'],['india','India']].forEach(function(r){seg.appendChild(el('button',{'class':'btn small',role:'radio','aria-checked':r[0]===region?'true':'false',text:r[1],
      onclick:function(){if(r[0]===region)return;S.set('news.region',r[0]);S.set('news.err',0);api.rerender();}}));});
    var rb=el('button',{'class':'btn small'+(busy?' spin':''),'aria-label':'Refresh news',title:'Refresh',text:'↻',onclick:function(){load(api,region);}});
    box.appendChild(el('div',{'class':'nw-top'},[seg,rb]));
    if(c&&c.items.length){
      var ul=el('ul',{'class':'nw-list'});
      c.items.forEach(function(it,i){ul.appendChild(el('li',{style:'animation-delay:'+(i*60)+'ms'},[el('a',{href:it.link,target:'_blank',rel:'noopener noreferrer','class':'nw-a'},[
        el('span',{'class':'nw-t',text:it.title}),el('span',{'class':'nw-m',text:(it.src?it.src+' · ':'')+ago(it.t)})])]));});
      box.appendChild(ul);
    }else box.appendChild(el('p',{'class':'wx-small',text:busy?'Loading headlines…':err?'Could not load news. Check the connection and tap ↻.':'Loading headlines…'}));
    var note=c?'Updated '+MDStore.fmtTime(c.t):'';
    if(c&&(!navigator.onLine||err>c.t))note+=' · offline, showing saved';
    box.appendChild(el('div',{'class':'wx-small nw-foot',text:(note?note+' · ':'')+'via Google News'}));
    api.setCount(region==='assam'?'Assam':'India');
    if(!busy&&(!c||Date.now()-c.t>MAX_AGE)&&navigator.onLine!==false&&Date.now()-lastTry>60000)setTimeout(function(){load(api,region);},0);
  }});
})();
