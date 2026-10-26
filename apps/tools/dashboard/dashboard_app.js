/* My Day — boot: theme, clock, cards, settings, arrow-key focus moves, service worker. */
(function(){
  MyDay.applyTheme();
  if(window.matchMedia)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',MyDay.applyTheme);
  MyDay.tick();setInterval(MyDay.tick,1000*15);
  MyDay.renderAll();MDSettings.init();
  /* Arrow keys move focus through controls in DOM order (TV remotes). Skipped while typing. */
  document.addEventListener('keydown',function(e){
    var k=e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(k)<0)return;
    var a=document.activeElement,tag=a&&a.tagName;
    if(tag==='TEXTAREA'||tag==='SELECT'||(tag==='INPUT'&&a.type!=='checkbox'))return;
    var scope=document.querySelector('dialog[open]')||document;
    var f=[].filter.call(scope.querySelectorAll('a[href],button:not([disabled]),input,select,textarea'),function(x){return x.offsetParent!==null;});
    var i=f.indexOf(a),n=(k==='ArrowUp'||k==='ArrowLeft')?i-1:i+1;
    if(n>=0&&n<f.length){f[n].focus();e.preventDefault();}
  });
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('dashboard_sw.js').catch(function(){});
})();
