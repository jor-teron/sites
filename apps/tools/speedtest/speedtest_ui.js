/* Speed Test UI — buttons, gauge needle, unit toggle (localStorage 'speedtest.unit'), connection info, history (last 10, 'speedtest.hist'), duration 5/10/15 s ('speedtest.dur', ST2). */
(function(){
  var $=function(id){return document.getElementById(id);},unit=localStorage.getItem('speedtest.unit')||'MBps',busy=false,last=0;
  /* bytes/sec -> number in chosen unit */
  function fmt(bps){return unit==='Mbps'?bps*8/1e6:bps/1048576;}
  function lbl(){return unit==='Mbps'?'Mbps':'MB/s';}
  function gauge(bps){last=bps;var v=fmt(bps),max=unit==='Mbps'?200:25,f=Math.min(1,v/max);
    $('speed').textContent=v.toFixed(1);$('unit').textContent=lbl();
    $('gNeedle').style.transform='rotate('+(-90+180*f)+'deg)';$('gArc').style.strokeDasharray=(252*f)+' 252';}
  function drawUnit(){[].forEach.call(document.querySelectorAll('#unitSeg .btn'),function(b){b.classList.toggle('on',b.dataset.u===unit);});gauge(last);drawHist();}
  function hist(){try{return JSON.parse(localStorage.getItem('speedtest.hist'))||[];}catch(e){return [];}}
  function drawHist(){var ul=$('hist');ul.innerHTML='';var h=hist();
    if(!h.length)ul.innerHTML='<li class="mut">No tests yet.</li>';
    h.forEach(function(r){var li=document.createElement('li');
      li.textContent=new Date(r.t).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+r.mode+' · ↓ '+fmt(r.bps).toFixed(1)+' '+lbl()+' · ping '+Math.round(r.ping)+' ms';ul.appendChild(li);});}
  function conn(){var c=navigator.connection;if(!c)return;
    $('conn').textContent=(c.effectiveType?c.effectiveType.toUpperCase():'?')+(c.downlink?' · ~'+c.downlink+' Mbps':'')+(c.rtt!=null?' · rtt '+c.rtt+' ms':'');}
  var dur=+localStorage.getItem('speedtest.dur')||5;
  function drawDur(){[].forEach.call(document.querySelectorAll('[data-d]'),function(b){b.classList.toggle('on',+b.dataset.d===dur);});}
  /* ST2: ping, then 4 parallel streams for dur seconds; needle orange while active (the only completion cue) */
  function run(btn){
    if(busy)return;busy=true;btn.classList.remove('jelly');void btn.offsetWidth;btn.classList.add('jelly');
    var g=document.querySelector('.gauge');g.classList.add('active');
    btn.disabled=true;$('status').textContent='Pinging…';gauge(0);var p;
    STCore.ping(5).then(function(r){p=r;
      $('pAvg').textContent=r.avg.toFixed(0)+' ms';$('pBW').textContent=r.best.toFixed(0)+' / '+r.worst.toFixed(0)+' ms';$('pJit').textContent=r.jitter.toFixed(1)+' ms';
      $('status').textContent='Downloading…';
      return STCore.timed('data/st_5mb.bin',dur,4,function(bps,u){if(bps>0)gauge(bps);$('used').textContent=(u/1048576).toFixed(1)+' MB';});
    }).then(function(d){gauge(d.bps);$('used').textContent=(d.used/1048576).toFixed(1)+' MB';$('status').textContent='';
      var h=hist();h.unshift({t:Date.now(),mode:dur+' s',bps:d.bps,ping:p.avg});localStorage.setItem('speedtest.hist',JSON.stringify(h.slice(0,10)));drawHist();})
    .catch(function(e){$('status').textContent='Failed: '+(navigator.onLine===false?'offline':e.message);})
    .then(function(){busy=false;btn.disabled=false;g.classList.remove('active');});
  }
  $('start').onclick=function(){run(this);};
  [].forEach.call(document.querySelectorAll('[data-d]'),function(b){b.onclick=function(){dur=+b.dataset.d;localStorage.setItem('speedtest.dur',dur);drawDur();};});
  drawDur();
  $('clr').onclick=function(){localStorage.removeItem('speedtest.hist');drawHist();};
  [].forEach.call(document.querySelectorAll('#unitSeg .btn'),function(b){b.onclick=function(){unit=b.dataset.u;localStorage.setItem('speedtest.unit',unit);drawUnit();};});
  conn();drawUnit();
})();
