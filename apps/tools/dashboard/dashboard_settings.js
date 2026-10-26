/* My Day — Settings dialog: theme (auto/light/dark), time format 12/24 h (PD4.2), and card on/off + up/down order. */
(function(){
  var dlg,list;
  function drawTheme(){var t=MDStore.get('theme','auto');
    [].forEach.call(document.querySelectorAll('#themeSeg .btn'),function(b){b.setAttribute('role','radio');b.setAttribute('aria-checked',b.dataset.t===t?'true':'false');});}
  function drawTime(){var f=MDStore.get('timefmt','12');
    [].forEach.call(document.querySelectorAll('#timeSeg .btn'),function(b){b.setAttribute('role','radio');b.setAttribute('aria-checked',b.dataset.f===f?'true':'false');});}
  function drawList(focusId,focusDir){
    var el=MyDay.el,l=MyDay.layout();list.innerHTML='';
    l.forEach(function(s,i){var c=MyDay.cards().filter(function(x){return x.id===s.id;})[0];
      var cb=el('input',{type:'checkbox','class':'chk'});cb.checked=s.on;
      cb.addEventListener('change',function(){s.on=cb.checked;MyDay.saveLayout(l);});
      function mv(d){var j=i+d;if(j<0||j>=l.length)return;var t=l[i];l[i]=l[j];l[j]=t;MyDay.saveLayout(l);drawList(s.id,d<0?'up':'down');}
      var up=el('button',{'class':'btn small','aria-label':'Move '+c.title+' up',text:'▲',onclick:function(){mv(-1);}}),
          dn=el('button',{'class':'btn small','aria-label':'Move '+c.title+' down',text:'▼',onclick:function(){mv(1);}});
      if(i===0)up.disabled=true;if(i===l.length-1)dn.disabled=true;
      list.appendChild(el('li',null,[el('label',null,[cb,c.title]),up,dn]));
      if(focusId===s.id){var f=focusDir==='up'?(up.disabled?dn:up):(dn.disabled?up:dn);setTimeout(function(){f.focus();},0);}
    });
  }
  window.MDSettings={init:function(){
    dlg=document.getElementById('settings');list=document.getElementById('cardList');
    document.getElementById('gear').onclick=function(){drawTheme();drawTime();drawList();dlg.showModal();};
    document.getElementById('setClose').onclick=function(){dlg.close();};
    dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
    [].forEach.call(document.querySelectorAll('#themeSeg .btn'),function(b){b.onclick=function(){MDStore.set('theme',b.dataset.t);MyDay.applyTheme();drawTheme();};});
    [].forEach.call(document.querySelectorAll('#timeSeg .btn'),function(b){b.onclick=function(){MDStore.set('timefmt',b.dataset.f);drawTime();MyDay.tick();MyDay.renderAll();};});
  }};
})();
