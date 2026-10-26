/* Speed Test UI — buttons, gauge needle, unit toggle (localStorage 'speedtest.unit'), connection info, history (last 10, 'speedtest.hist'). */
(function(){
  var $=function(id){return document.getElementById(id);},unit=localStorage.getItem('speedtest.unit')||'MBps',busy=false,last=0;
  /* bytes/sec -> number in chosen unit */
  function fmt(bps){return unit==='Mbps'?bps*8/1e6:bps/1048576;}
  function lbl(){return unit==='Mbps'?'Mbps':'MB/s';}
  function gauge(bps){last=bps;var v=fmt(bps),max=unit==='Mbps'?200:25,f=Math.min(1,v/max);
    $('speed').textContent=v.toFixed(1);$('unit').textContent=lbl();
    $('gNeedle').style.transform='rotate('+(-90+180*f)+'deg)';$('gArc').style.strokeDasharray=(252*f)+' 252';}
  function drawUnit(){[].forEach.call(document.querySelectorAll('.seg .btn'),function(b){b.classList.toggle('on',b.dataset.u===unit);});gauge(last);drawHist();}
  function hist(){try{return JSON.parse(localStorage.getItem('speedtest.hist'))||[];}catch(e){return [];}}
  function drawHist(){var ul=$('hist');ul.innerHTML='';var h=hist();
    if(!h.length)ul.innerHTML='<li class="mut">No tests yet.</li>';
    h.forEach(function(r){var li=document.createElement('li');
      li.textContent=new Date(r.t).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+r.mode+' · ↓ '+fmt(r.bps).toFixed(1)+' '+lbl()+' · ping '+Math.round(r.ping)+' ms';ul.appendChild(li);});}
  function conn(){var c=navigator.connection;if(!c)return;
    $('conn').textContent=(c.effectiveType?c.effectiveType.toUpperCase():'?')+(c.downlink?' · ~'+c.downlink+' Mbps':'')+(c.rtt!=null?' · rtt '+c.rtt+' ms':'');}
  function run(files,mode,btn){
    if(busy)return;busy=true;btn.classList.remove('jelly');void btn.offsetWidth;btn.classList.add('jelly');
    $('quick').disabled=$('full').disabled=true;$('status').textContent='Pinging…';gauge(0);
    var used=0,tot=0,secs=0,p;
    STCore.ping(5).then(function(r){p=r;
      $('pAvg').textContent=r.avg.toFixed(0)+' ms';$('pBW').textContent=r.best.toFixed(0)+' / '+r.worst.toFixed(0)+' ms';$('pJit').textContent=r.jitter.toFixed(1)+' ms';
      var i=0;function next(){if(i>=files.length)return;$('status').textContent='Downloading '+(i+1)+'/'+files.length+'…';
        return STCore.download(files[i++],function(b,s){if(s>0.05)gauge(b/s);$('used').textContent=((used+b)/1048576).toFixed(1)+' MB';})
          .then(function(d){used+=d.bytes;tot+=d.bytes;secs+=d.secs;}).then(next);}
      return next();
    }).then(function(){var bps=tot/secs;gauge(bps);$('status').textContent='Done';
      var h=hist();h.unshift({t:Date.now(),mode:mode,bps:bps,ping:p.avg});localStorage.setItem('speedtest.hist',JSON.stringify(h.slice(0,10)));drawHist();})
    .catch(function(e){$('status').textContent='Failed: '+(navigator.onLine===false?'offline':e.message);})
    .then(function(){busy=false;$('quick').disabled=$('full').disabled=false;});
  }
  $('quick').onclick=function(){run(['data/st_1mb.bin'],'Quick',this);};
  $('full').onclick=function(){run(['data/st_5mb.bin','data/st_5mb.bin'],'Full',this);};
  $('clr').onclick=function(){localStorage.removeItem('speedtest.hist');drawHist();};
  [].forEach.call(document.querySelectorAll('.seg .btn'),function(b){b.onclick=function(){unit=b.dataset.u;localStorage.setItem('speedtest.unit',unit);drawUnit();};});
  conn();drawUnit();
})();
