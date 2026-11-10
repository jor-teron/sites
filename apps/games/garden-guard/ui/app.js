/* DOM controller: fixed 60 Hz combat, capped drawing, explicit resume after reload / hide. */
(function (G) {
  'use strict';
  const $=id=>document.getElementById(id), stored=G.load();
  let game=stored.game || new G.Engine(), unlocked=stored.unlocked, paused=!!stored.game, selected=null;
  let preview=null, screen='', last=0, bank=0, drawn=0, savedAt=0, oldFocus=null;
  const test=new URLSearchParams(location.search).has('test'), renderer=new G.Renderer($('board'),$('field'));
  const say=text=>$('message').textContent=text;
  const persist=()=>{ if(!G.save(game,unlocked)) say('Saving unavailable in this browser. Keep this tab open.'); };
  function dialog(title,body,actions) {
    if($('overlay').hidden) oldFocus=document.activeElement;
    $('overlay').hidden=false; $('card-title').textContent=title; $('card-body').innerHTML=body; $('card-actions').replaceChildren();
    for(const [label,fn] of actions) { const b=document.createElement('button'); b.textContent=label; b.onclick=fn; $('card-actions').append(b); }
    $('card-actions').firstChild.focus();
  }
  function close() { $('overlay').hidden=true; screen=''; (oldFocus || $('board')).focus(); last=0; bank=0; }
  function resume() { paused=false; close(); }
  function pause() {
    if(game.status!=='playing') return; paused=true; screen='pause'; persist();
    dialog('Garden paused',`<p>Level ${game.level+1} · ${Math.floor(game.time)} seconds · ${game.sun} sun</p><p>Your garden is saved. No time passes while paused.</p>`,[['Resume',resume],['How to play',help],['Restart level',()=>confirmStart(game.level)]]);
  }
  function help() {
    paused=true; screen='help'; persist();
    dialog('How to play', '<p>Choose a seed then tap a free lawn tile. Start with <b>Sun Flower</b> and tap glowing suns to collect 25 sun each. Plant shooters in threatened lanes.</p><p><b>Bark Guard</b> blocks invaders. <b>Berry Burst</b> explodes after 1.2 seconds across its 3×3 neighbourhood. <b>Frost Shooter</b> slows enemies. Each seed has a cost and a refill cooldown.</p><p>A mower saves each lane once. The next invader past that lane loses the level. Defeat every wave to unlock the next garden.</p><p><b>P / Esc</b> pauses. Seeds: <b>1–5</b>. Lawn: arrows then <b>Enter</b>. <b>C</b> collects all suns. Progress saves automatically; reloads start paused.</p>',[['Got it',()=>game.status==='playing'?pause():finish()]]);
  }
  function start(level) {
    game=new G.Engine(level); paused=false; selected=null; preview=null; savedAt=0;
    close(); updateLevels(); persist(); update();
  }
  function confirmStart(level) {
    paused=true; screen='confirm';
    dialog('Restart this garden?', '<p>This replaces the current run. Unlocked levels stay available.</p>',[['Restart',()=>start(level)],['Keep garden',pause]]);
  }
  function finish() {
    paused=true; screen='end';
    if(game.status==='won') unlocked=Math.min(5,Math.max(unlocked,game.level+2));
    persist(); updateLevels();
    const won=game.status==='won', final=game.level===4;
    dialog(won?'Garden saved!':'The invaders got through',won?`<p>${G.LEVELS[game.level].name} cleared.${final?' All five gardens defended!':' The next level is unlocked.'}</p>`:'<p>A lane had already used its mower. Try sun makers early and cover every lane.</p>',
      won&&!final ? [['Next level',()=>start(game.level+1)],['Play again',()=>start(game.level)],['How to play',help]] : [[won?'Play again':'Retry',()=>start(game.level)],['How to play',help]]);
  }
  function updateLevels() {
    $('level').replaceChildren(); G.LEVELS.forEach((l,i)=>{const o=new Option(`Level ${i+1}${i>=unlocked?' 🔒':''}`,i); o.disabled=i>=unlocked; $('level').add(o);}); $('level').value=game.level;
    $('flags').replaceChildren(); const l=G.LEVELS[game.level];
    l.flags.forEach(t=>{const s=document.createElement('span'); s.textContent='⚑'; s.style.left=(t/l.end*96)+'%'; $('flags').append(s);});
  }
  for(const [kind,d] of Object.entries(G.PLANTS)) {
    const b=document.createElement('button'); b.className='seed'; b.dataset.kind=kind;
    b.title=`${d.name}: ${d.cost} sun · ${d.cooldown}s refill`; b.ariaLabel=b.title;
    b.innerHTML=`<span class="seed-top"><canvas aria-hidden="true"></canvas><b>${d.cost}</b></span><span class="seed-name">${d.name}</span><i class="cool"></i>`;
    b.onclick=()=>choose(kind); $('seeds').append(b); G.drawSeed(b.querySelector('canvas'),kind);
  }
  function choose(kind) {
    if(paused || game.status!=='playing') return;
    selected=selected===kind?null:kind;
    if(selected) say(`${G.PLANTS[kind].name}: tap a free tile · ${G.PLANTS[kind].cost} sun`);
    update();
  }
  function place() {
    if(!selected || !preview || paused) return;
    if(game.plant(selected,preview.row,preview.col)) { say(`${G.PLANTS[selected].name} planted.`); persist(); }
    else say('Cannot plant: tile occupied or outside lawn / not enough sun / seed refilling.');
    update();
  }
  function update() {
    $('sun').textContent=game.sun;
    for(const b of $('seeds').children) {
      const k=b.dataset.kind,d=G.PLANTS[k],cd=game.cooldowns[k];
      b.classList.toggle('selected',selected===k); b.setAttribute('aria-pressed',selected===k);
      b.setAttribute('aria-disabled',game.sun<d.cost || cd>0 || paused);
      b.querySelector('.cool').style.width=(cd/d.cooldown*100)+'%';
      b.title=`${d.name}: ${d.cost} sun${cd>0?' · ready in '+Math.ceil(cd)+'s':''}`;
    }
    const l=G.LEVELS[game.level], progress=Math.min(100,game.time/l.end*100);
    $('wave-fill').style.width=progress+'%'; $('waves').setAttribute('aria-valuenow',Math.floor(progress));
    $('wave-label').textContent=`Wave ${Math.max(1,l.flags.filter(t=>t<=game.time).length)}/${l.flags.length} · ${game.next}/${l.events.length} arrived`;
    renderer.draw(game,selected,preview);
    if(game.status!=='playing' && screen!=='end' && screen!=='help') finish();
  }
  $('board').onpointermove=e=>{const p=renderer.point(e);preview={row:Math.floor(p.y),col:Math.floor(p.x)}; if(paused) return; renderer.draw(game,selected,preview);};
  $('board').onpointerleave=()=>{preview=null;};
  $('board').onpointerdown=e=>{
    e.preventDefault(); if(paused) return; $('board').focus(); const p=renderer.point(e);
    const hit=game.suns.map(s=>({s,d:Math.hypot(s.x-p.x,s.y-p.y)})).sort((a,b)=>a.d-b.d)[0];
    if(hit && hit.d*100*renderer.scale<=Math.max(23*renderer.scale,22)) { game.collect(hit.s.id); say('+25 sun'); persist(); }
    else { preview={row:Math.floor(p.y),col:Math.floor(p.x)}; place(); } update();
  };
  $('pause').onclick=()=>paused&&screen==='pause'?resume():pause(); $('help').onclick=help;
  $('level').onchange=()=>{
    const level=+$('level').value; $('level').value=game.level;
    if(level>=unlocked) return; paused=true; screen='choose';
    dialog('Change garden?', '<p>This replaces the current run. Unlocked levels stay available.</p>',[['Start level '+(level+1),()=>start(level)],['Keep garden',()=>game.status==='playing'?pause():finish()]]);
  };
  addEventListener('keydown',e=>{
    if(e.key==='Tab' && !$('overlay').hidden) {
      const buttons=[...$('card-actions').querySelectorAll('button')],first=buttons[0],last=buttons[buttons.length-1];
      if(e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); } return;
    }
    if(e.target.tagName==='SELECT') return;
    if(e.key==='Escape' || e.key.toLowerCase()==='p') { e.preventDefault(); if(screen==='pause') resume(); else if(screen==='help') { if(game.status==='playing') pause(); else finish(); } else if(!screen) pause(); return; }
    if(paused) return;
    const n=+e.key; if(n>=1 && n<=5) choose(Object.keys(G.PLANTS)[n-1]);
    if(e.key.toLowerCase()==='c') { for(const s of [...game.suns]) game.collect(s.id); persist(); update(); }
    if(e.target!==$('board')) return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)) {
      e.preventDefault(); preview=preview || {row:2,col:0};
      if(e.key==='Enter' || e.key===' ') place();
      else { preview.col=Math.max(0,Math.min(8,preview.col+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0))); preview.row=Math.max(0,Math.min(4,preview.row+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))); } update();
    }
  });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && !paused) pause(); });
  addEventListener('blur',()=>{ if(G.setting('autoPause') && !paused) pause(); });
  addEventListener('pagehide',persist); addEventListener('resize',()=>{renderer.resize();update();});
  if(window.GameSettings) GameSettings.onChange(()=>{renderer.resize();update();});
  function step() { game.tick(); if(game.time-savedAt>=3) { persist(); savedAt=game.time; } }
  function loop(now) {
    if(!paused) { if(last) bank+=Math.min(.15,(now-last)/1000); while(bank>=G.STEP && game.status==='playing') { step(); bank-=G.STEP; } }
    else bank=0;
    last=now; if(now-drawn>=1000/(G.setting('fpsLimit')||30)) { update(); drawn=now; } requestAnimationFrame(loop);
  }
  updateLevels(); update(); if(game.status!=='playing') finish(); else if(stored.game) pause();
  if(test) G.test={get game(){return game;},get paused(){return paused;},get unlocked(){return unlocked;},start,resume,pause,save:persist,
    advance(seconds,policy) { for(let i=0;i<seconds/G.STEP && !paused && game.status==='playing';i++) { if(policy) policy(game); step(); } update(); },render:update};
  else requestAnimationFrame(loop);
})(window.GardenGuard);
