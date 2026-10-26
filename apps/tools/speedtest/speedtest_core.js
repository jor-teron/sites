/* Speed Test core — ping and download timing against data/ files (same origin, cache-busted, no-store).
   STCore.ping(n) -> {avg,best,worst,jitter} ms; STCore.download(url, onProgress(bytes,secs)) -> {bytes,secs}. */
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
  function download(url,onProg){
    var t0=performance.now(),got=0;
    return fetch(bust(url),{cache:'no-store'}).then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      if(!r.body)return r.arrayBuffer().then(function(b){got=b.byteLength;});
      var rd=r.body.getReader();
      function pump(){return rd.read().then(function(x){if(x.done)return;got+=x.value.length;onProg(got,(performance.now()-t0)/1000);return pump();});}
      return pump();
    }).then(function(){return {bytes:got,secs:(performance.now()-t0)/1000};});
  }
  window.STCore={ping:ping,download:download};
})();
