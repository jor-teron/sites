/* MINE-1 controller: active-time clock, versioned saves and records. */
(()=>{
  'use strict';const R=MineRules,$=id=>document.getElementById(id);
  function read(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback;}catch(_){return fallback;}}
  function write(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_){/* storage blocked/quota: memory only */}}
  const saved=read('minesweeper.save',null),prefs=read('minesweeper.options',{});
  let game=saved&&saved.version===1?R.restore(saved.game):null;
  let elapsed=game&&Number.isFinite(saved.elapsed)?Math.max(0,Math.min(31536000000,saved.elapsed)):0;
  const resumed=!!game;game=game||R.create();
  let tickAt=performance.now(),flagMode=false,muted=prefs?.muted===true,questions=prefs?.questions===true;
  let clockActive=!document.hidden;
  const records=read('minesweeper.best',{}),best=records&&typeof records==='object'&&!Array.isArray(records)?records:{};
  const format=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
  function tick(){
    const now=performance.now();if(game.status==='playing'&&clockActive)elapsed+=now-tickAt;
    tickAt=now;clockActive=!document.hidden&&!$('help').open;$('timer').textContent=format(elapsed);
  }
  function save(){write('minesweeper.save',{version:1,game,elapsed});}
  function options(){write('minesweeper.options',{muted,questions});$('mute').textContent=muted?'Unmute':'Mute';$('mute').setAttribute('aria-pressed',muted);$('questions').checked=questions;}
  function draw(message){
    MineView.draw(game);const value=best[R.bestKey(game)];$('best').textContent='Best: '+(Number.isFinite(value)&&value>=0?format(value):'—');
    $('status').textContent=message||({ready:'Choose a cell. Your first opening is safe.',playing:flagMode?'Flag mode: tap covered cells to mark them.':'Clear every safe cell. Click numbers to chord.',won:'Field cleared! You win. Smiley starts a new game.',lost:'Mine hit! × shows wrong flags. Try again.'}[game.status]);
  }
  function act(i,flag){
    tick();const before=game.status;
    const changed=flag||(flagMode&&!game.cells[i].open)?R.flag(game,i,questions):R.reveal(game,i);if(!changed)return;
    if(game.status==='won'&&before!=='won'){
      const key=R.bestKey(game);if(!Number.isFinite(best[key])||elapsed<best[key]){best[key]=elapsed;write('minesweeper.best',best);}
    }
    MineSound(game.status==='won'?'won':game.status==='lost'?'lost':flag||flagMode?'flag':'reveal',muted);draw();save();
  }
  function syncFields(){
    $('difficulty').value=game.level;$('custom').hidden=game.level!=='custom';
    if(game.level==='custom'){$('width').value=game.width;$('height').value=game.height;$('mines').value=game.mines;}
  }
  function start(level){
    game=R.create(level,$('width').value,$('height').value,$('mines').value);elapsed=0;tickAt=performance.now();tick();syncFields();draw();save();$('boardWrap').scrollTo(0,0);
  }
  $('reset').addEventListener('click',()=>start(game.level));
  $('difficulty').addEventListener('change',()=>{const level=$('difficulty').value;$('custom').hidden=level!=='custom';if(level!=='custom')start(level);else{$('width').focus();MineView.fit();}});
  $('custom').noValidate=true; // Reflect clamped values instead of rejecting typed out-of-range values.
  $('custom').addEventListener('submit',e=>{e.preventDefault();start('custom');});
  $('flagMode').addEventListener('click',()=>{flagMode=!flagMode;$('flagMode').setAttribute('aria-pressed',flagMode);draw();});
  $('mute').addEventListener('click',()=>{muted=!muted;options();});$('questions').addEventListener('change',()=>{questions=$('questions').checked;options();});
  $('helpBtn').addEventListener('click',()=>{tick();$('help').showModal();clockActive=false;});
  $('helpClose').addEventListener('click',()=>$('help').close());$('help').addEventListener('close',()=>{tickAt=performance.now();clockActive=!document.hidden;});
  addEventListener('pageshow',()=>{tickAt=performance.now();clockActive=!document.hidden&&!$('help').open;});
  document.addEventListener('visibilitychange',()=>{tick();save();});addEventListener('pagehide',()=>{tick();save();});
  addEventListener('storage',e=>{if(e.key===null||(e.key==='minesweeper.save'&&e.newValue===null)){Object.keys(best).forEach(k=>delete best[k]);start('easy');}});
  MineInput(MineView.board,act,()=>game);options();syncFields();draw(resumed?'Saved game resumed. Good luck!':'');tick();
  setInterval(()=>{tick();if(game.status==='playing')save();},1000);
})();
