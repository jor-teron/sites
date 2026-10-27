/* Card: Phone (PD8) — battery % + charging state (navigator.getBattery, live via events) and
   this app's storage (navigator.storage.estimate: used / quota). Parts the browser lacks are hidden;
   the whole card says so if neither is available (e.g. Firefox/Safari have no Battery API). */
(function(){
  var bat=null,batP=null,hooked=false,cur=null;
  function fmtB(n){var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<4){n/=1024;i++;}return (i?n.toFixed(n<10?1:0):n)+' '+u[i];}
  function mins(s){if(!isFinite(s)||!s)return '';var h=Math.floor(s/3600),m=Math.round(s%3600/60);return (h?h+' h ':'')+m+' min';}
  MyDay.register({id:'phone',title:'Phone',defaultOn:true,render:function(box,api){
    cur=api;var el=api.el,hasB=!!navigator.getBattery,hasS=!!(navigator.storage&&navigator.storage.estimate);
    if(!hasB&&!hasS){box.appendChild(el('p',{'class':'wx-small',text:'This browser does not share battery or storage info.'}));return;}
    if(hasB){
      var bw=el('div',{'class':'ph-bat'});box.appendChild(bw);
      if(!batP)batP=navigator.getBattery().then(function(b){bat=b;return b;}).catch(function(){bat=false;});
      if(bat===null)batP.then(function(){if(cur)cur.rerender();});
      else if(bat===false)bw.remove();
      else{
        if(!hooked){hooked=true;['levelchange','chargingchange','chargingtimechange','dischargingtimechange'].forEach(function(ev){bat.addEventListener(ev,function(){if(cur)cur.rerender();});});}
        var p=Math.round(bat.level*100),lvl=p<=15?'low':p<=40?'mid':'ok';
        var t=bat.charging?(bat.level>=1?'Full':'Charging'+(mins(bat.chargingTime)?' · full in '+mins(bat.chargingTime):'')):'On battery'+(mins(bat.dischargingTime)?' · '+mins(bat.dischargingTime)+' left':'');
        bw.className='ph-bat '+lvl+(bat.charging?' chg':'');
        bw.appendChild(el('div',{'class':'ph-cell',role:'img','aria-label':'Battery '+p+'%'},[el('div',{'class':'ph-fill',style:'width:'+p+'%'}),el('span',{'class':'ph-pct',text:(bat.charging?'⚡':'')+p+'%'})]));
        bw.appendChild(el('div',{'class':'ph-txt',text:t}));
        api.setCount(p+'%'+(bat.charging?' ⚡':''));
        if(p<=15&&!bat.charging)MyDay.alert('ph-bat','🪫 Battery low: '+p+'%','high');else MyDay.clearAlert('ph-bat');
      }
    }
    if(hasS){
      var sw=el('div',{'class':'ph-sto'},[el('div',{'class':'ph-lbl',text:"This app's storage"})]);box.appendChild(sw);
      navigator.storage.estimate().then(function(e){var u=e.usage||0,q=e.quota||0,f=q?Math.max(.5,Math.min(100,u/q*100)):0;
        sw.appendChild(el('div',{'class':'ph-bar',role:'img','aria-label':fmtB(u)+' used of '+fmtB(q)},[el('div',{style:'width:'+f+'%'})]));
        sw.appendChild(el('div',{'class':'ph-txt',text:fmtB(u)+' used'+(q?' of '+fmtB(q)+' allowed':'')}));
        sw.appendChild(el('div',{'class':'wx-small',text:'Browser space for My Day only — not your phone\'s total storage.'}));
      }).catch(function(){sw.remove();});
    }
  }});
})();
