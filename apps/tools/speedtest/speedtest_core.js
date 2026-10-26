/* Speed Test core — ping and download timing against data/ files (same origin, cache-busted, no-store).
   STCore.ping(n) -> {avg,best,worst,jitter} ms; STCore.timed(url,secs,streams,onProg) -> {bps,used} (ST2). */
(function(){
  function bust(u){return u+'?t='+Date.now()+Math.random().toString(36).slice(2,6);}
  function ping(n){
    var times=[],i=0;
    function one(){var t=performance.now();
      return fetch(bust('data/ping.txt'),{cache:'no-store'}).then(function(r){return r.text();}).then(function(){times.push(performance.now()-t);});}
    function loop(){return i++<n?one().then(loop):Promise.resolve();}
    return loop().then(function(){
      var s=times.reduce(function(a,b){return a+b;},0),j=0;
      for(var k=1;k<times.length;k++)j+=Math.abs(times[k]-times[k-1]);
      return {avg:s/times.length,best:Math.min.apply(0,times),worst:Math.max.apply(0,times),jitter:times.length>1?j/(times.length-1):0};
    });
  }
  /* ST2: timed download — N parallel streams loop-fetching url until secs are up; first WARM s ignored.
     onProg(steadyBps, usedBytes). Resolves {bps (steady, after warm-up), used}. In-flight fetches aborted at the end. */
  var WARM=1;
  function timed(url,secs,streams,onProg){
    var ac=new AbortController(),t0=performance.now(),used=0,warmBytes=null,stop=false;
    function el(){return (performance.now()-t0)/1000;}
    function steady(){var t=el()-WARM;return warmBytes==null||t<=0?0:(used-warmBytes)/t;}
    function count(n){used+=n;if(warmBytes==null&&el()>=WARM)warmBytes=used;onProg(steady(),used);}
    function stream(){if(stop)return Promise.resolve();
      return fetch(bust(url),{cache:'no-store',signal:ac.signal}).then(function(r){
        if(!r.ok)throw new Error('HTTP '+r.status);var rd=r.body.getReader();
        function pump(){return rd.read().then(function(x){if(x.done)return;count(x.value.length);return pump();});}
        return pump();}).then(stream);}
    var timer=new Promise(function(res){setTimeout(function(){stop=true;var b=steady();ac.abort();res(b);},secs*1000);});
    var all=[];for(var i=0;i<streams;i++)all.push(stream().catch(function(e){if(e.name!=='AbortError'&&!stop)throw e;}));
    return Promise.race([timer,Promise.all(all).then(function(){if(!stop)throw new Error('stopped early');})])
      .then(function(bps){return {bps:bps,used:used};},function(e){stop=true;ac.abort();throw e;});
  }
  window.STCore={ping:ping,timed:timed};
})();
