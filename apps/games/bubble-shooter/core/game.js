/* BUB-1 controller. Stable (last settled shot) saves survive reloads and blocked storage. */
(()=>{
  'use strict';
  const B=BubbleRules,S=BubbleSettings,V=BubbleRender,$=id=>document.getElementById(id),KEY='bubble-shooter.save';
  const read=k=>{try{return localStorage.getItem(k);}catch(_){return null;}},write=(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}};
  let state=B.restore(read(KEY)),resumed=!!state,progress={unlocked:1,stars:{}},best=Math.max(0,Number(read('bubble-shooter.best'))||0);
  if(!Number.isFinite(best))best=0;
  try{const p=JSON.parse(read('bubble-shooter.progress'));if(p&&Number.isInteger(p.unlocked)&&p.unlocked>=1&&p.unlocked<=21){progress.unlocked=p.unlocked;for(let n=1;n<=20;n++)if([1,2,3].includes(p.stars?.[n]))progress.stars[n]=p.stars[n];}}catch(_){}
  if(!state)state=B.create(1,BubbleLevels);
  let angle=-Math.PI/2,flight=null,particles=[],paused=false,modal='',last=0,paint=0,focusBefore=null,pointer=null;
  function save(){write(KEY,JSON.stringify(state));}
  function say(text){$('message').textContent=text;}
  function hud(){
    $('levelName').textContent=state.level===21?'Endless orbit':BubbleLevels[state.level-1][0];
    $('stage').textContent=state.level===21?'Endless · row pair every 10 shots':`Level ${state.level} / 20`;
    $('score').textContent=state.score.toLocaleString();$('best').textContent=best.toLocaleString();
    $('pressure').textContent=`Ceiling in ${state.limit-state.miss} misses`;$('combo').textContent=`Combo ×${state.combo}`;
    $('swapBtn').disabled=$('fireBtn').disabled=paused||!!flight||state.status!=='play';
    $('muteBtn').textContent=S.get('sfx')?'♪':'♪̸';$('muteBtn').setAttribute('aria-pressed',String(!S.get('sfx')));
    $('muteBtn').setAttribute('aria-label',S.get('sfx')?'Mute sounds':'Unmute sounds');
  }
  function close(){paused=false;modal='';$('overlay').hidden=true;pointer=null;hud();(focusBefore||V.canvas).focus();}
  function card(title,body,buttons,type='pause'){
    paused=true;modal=type;pointer=null;if($('overlay').hidden)focusBefore=document.activeElement;
    $('cardTitle').textContent=title;$('cardBody').innerHTML=body;$('cardButtons').replaceChildren();
    buttons.forEach(([label,fn])=>{const el=document.createElement('button');el.textContent=label;el.onclick=fn;$('cardButtons').appendChild(el);});
    $('overlay').hidden=false;$('overlay').querySelector('.card').focus();save();hud();
  }
  function pause(){if(state.status==='play')card('Paused',`<p>Score ${state.score} · ${state.shots} shots · ${state.drops} dropped</p><p>Your settled shots are saved on this device.</p>`,[['Resume',close],['How to play',help],['Retry level',()=>start(state.level)]]);}
  function help(){card('How to play','<p>Match at least <b>3 bubbles of the same colour and symbol</b>. Unsupported bubbles fall for bonus points.</p><ul><li>Mouse: point and click. Touch: drag then release. Aim up!</li><li>← → aim · Space / Enter fire · X swap · P / Esc pause.</li><li>The dotted guide shows one wall bounce. Shots can bounce again.</li><li>Every consecutive pop increases your combo up to ×5. Drops score 25 each.</li><li>Misses push the ceiling down. Never touch the pink bottom line!</li><li>Earn up to 3 stars by using fewer shots. Complete 20 levels to unlock Endless with fresh rows.</li></ul><p class="fine">Auto theme follows Hub Light/Dark. Your best score and level stars stay on this device. Reload resumes the last settled shot.</p>',[['Back',()=>state.status==='play'?pause():result()]],'help');}
  function start(level){state=B.create(level,BubbleLevels);flight=null;particles=[];angle=-Math.PI/2;close();say('Drag to aim · release to fire');save();hud();}
  function levels(){
    card('Choose a level','<div class="level-grid" id="levelGrid"></div><p class="fine">Stars reward efficient clears. Finish all twenty to unlock Endless.</p>',[['Back',()=>state.status==='play'?pause():result()]],'levels');
    for(let n=1;n<=21;n++){const b=document.createElement('button');b.disabled=n>progress.unlocked;b.innerHTML=n===21?'∞<small>Endless</small>':`${n}<small>${'★'.repeat(progress.stars[n]||0)||'–'}</small>`;b.setAttribute('aria-label',`${n===21?'Endless':'Level '+n} ${progress.stars[n]||0} stars`);b.onclick=()=>start(n);$('levelGrid').appendChild(b);}
  }
  function result(){
    const won=state.status==='won',stars=B.stars(state);
    if(won){progress.stars[state.level]=Math.max(progress.stars[state.level]||0,stars);progress.unlocked=Math.max(progress.unlocked,Math.min(21,state.level+1));write('bubble-shooter.progress',JSON.stringify(progress));}
    best=Math.max(best,state.score);write('bubble-shooter.best',String(best));save();
    card(won?'Level clear!':'Bottom line reached',`${won?'<div class="stars">'+'★'.repeat(stars)+'☆'.repeat(3-stars)+'</div>':''}<p>Score <b>${state.score}</b> · ${state.shots} shots<br>${state.drops} floating bubbles dropped.</p>`,won?[['Next level',()=>start(state.level+1)],['Replay',()=>start(state.level)],['Levels',levels]]:[['Try again',()=>start(state.level)],['Levels',levels]],'result');
  }
  function effects(list,drop){if(!S.fx())return;
    list.forEach(b=>{const p=B.point(b,state.ceiling);for(let i=0;i<(drop?1:5);i++)particles.push({...p,color:b.color,vx:(Math.random()-.5)*140,vy:drop?40:(Math.random()-.5)*200,life:1,bubble:drop});});
  }
  function landed(){
    const cell=flight.cell;flight=null;const oldCeiling=state.ceiling,out=B.settle(state,cell);
    effects(out.popped,false);effects(out.dropped,true);
    if(out.popped.length){BubbleSound.play(out.dropped.length?'drop':'pop');S.vibrate();say(`+${out.points} · ${out.popped.length} popped${out.dropped.length?' · '+out.dropped.length+' dropped':''}`);}
    else {BubbleSound.play('fire');say(state.ceiling>oldCeiling?'Ceiling moved down!':'No match · try a bank shot or swap');}
    if(state.score>best){best=state.score;write('bubble-shooter.best',String(best));}
    hud();save();if(state.status!=='play'){BubbleSound.play(state.status==='won'?'win':'lose');result();}
  }
  function fire(){
    if(paused||flight||state.status!=='play')return;BubbleSound.wake();BubbleSound.play('fire');
    const t=B.trajectory(state.board,angle,state.ceiling);flight={...t,x:B.LAUNCH.x,y:B.LAUNCH.y,color:state.current,segment:1};hud();
  }
  function swap(){if(paused||flight||state.status!=='play')return;[state.current,state.next]=[state.next,state.current];BubbleSound.play('swap');save();hud();}
  function aim(e){const rect=V.canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*B.W/rect.width,y=(e.clientY-rect.top)*B.H/rect.height;
    angle=Math.max(-Math.PI+.26,Math.min(-.26,Math.atan2(Math.min(-5,y-B.LAUNCH.y),x-B.LAUNCH.x)));
  }
  V.canvas.addEventListener('pointerdown',e=>{if(paused||flight||e.button>0)return;pointer=e.pointerId;V.canvas.setPointerCapture(pointer);aim(e);BubbleSound.wake();e.preventDefault();});
  V.canvas.addEventListener('pointermove',e=>{if(!paused&&!flight&&(e.pointerType==='mouse'||pointer===e.pointerId))aim(e);});
  V.canvas.addEventListener('pointerup',e=>{if(pointer!==e.pointerId)return;aim(e);pointer=null;fire();});
  V.canvas.addEventListener('pointercancel',()=>{pointer=null;});
  V.canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
  window.addEventListener('keydown',e=>{
    if(e.key==='Tab'&&modal){const els=[...$('overlay').querySelectorAll('button:not(:disabled)')],a=els[0],z=els.at(-1);if(e.shiftKey&&(document.activeElement===a||document.activeElement===document.querySelector('.card'))){e.preventDefault();z?.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a?.focus();}return;}
    if((!modal&&['ArrowLeft','ArrowRight',' '].includes(e.key))||e.key==='Escape')e.preventDefault();
    if(e.key.toLowerCase()==='p'||e.key==='Escape'){if(modal==='pause')close();else if(modal==='help'||modal==='levels'){if(state.status==='play')pause();else result();}else if(!modal)pause();return;}
    if(paused)return;
    if(e.key==='ArrowLeft')angle=Math.max(-Math.PI+.26,angle-.04);
    if(e.key==='ArrowRight')angle=Math.min(-.26,angle+.04);
    if(e.code==='Space'||(e.key==='Enter'&&document.activeElement===V.canvas))fire();
    if(e.key.toLowerCase()==='x')swap();
  });
  $('fireBtn').onclick=fire;$('swapBtn').onclick=swap;$('pauseBtn').onclick=()=>modal==='pause'?close():pause();$('helpBtn').onclick=help;$('levelsBtn').onclick=levels;
  $('muteBtn').onclick=()=>{S.mute();hud();};window.GameSettings?.onChange(hud);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused)pause();});
  window.addEventListener('blur',()=>{if(S.get('autoPause')&&!paused)pause();});
  window.addEventListener('pagehide',save);window.addEventListener('resize',V.resize);
  // Refresh Hub theme on focus, including changes made by an enclosing Hub window.
  window.addEventListener('focus',S.theme);new ResizeObserver(V.resize).observe($('arena'));
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000||0);last=now;
    if(!paused){
      if(flight){let distance=700*dt;
        while(flight&&distance>0){const target=flight.points[flight.segment],dx=target.x-flight.x,dy=target.y-flight.y,d=Math.hypot(dx,dy);
          if(distance>=d){flight.x=target.x;flight.y=target.y;distance-=d;flight.segment++;if(flight.segment>=flight.points.length)landed();}
          else {flight.x+=dx/d*distance;flight.y+=dy/d*distance;distance=0;}
        }
      }
      particles.forEach(p=>{p.life-=dt*(p.bubble?.8:1.6);p.vy+=dt*360;p.x+=p.vx*dt;p.y+=p.vy*dt;});particles=particles.filter(p=>p.life>0);
    }
    if(now-paint>=1000/(S.get('fpsLimit')||30)){V.draw(state,angle,flight,particles,paused);paint=now;}
    requestAnimationFrame(frame);
  }
  S.theme();V.resize();hud();save();if(state.status!=='play')result();else if(resumed)pause();requestAnimationFrame(frame);
})();
