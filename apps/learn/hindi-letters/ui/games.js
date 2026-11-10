(function() {
  'use strict';
  const H=window.Hindi,{el,button}=H,$=id=>document.getElementById(id),out=$('content');
  const names={find:'Find the letter',picture:'Picture → word',build:'Build the word',listen:'Listen & pick'};
  H.rewards=H.read('rewards',{best:{},streak:{}});
  if(!H.rewards || typeof H.rewards!=='object') H.rewards={};
  H.rewards.best=H.rewards.best||{}; H.rewards.streak=H.rewards.streak||{};
  const stats=el('span');stats.id='rewards';document.querySelector('.status').append(stats);
  function rewardStatus() {
    const best=H.rewards.best,total=Object.keys(names).reduce((sum,k)=>sum+(best[k]||0),0),s=H.rewards.streak;
    stats.textContent='Games '+total+'/12 ★ · '+(s.count||0)+' day streak'+(s.day && s.day!==H.localDay()?' · last '+s.day:'');
    H.write('rewards',H.rewards);
  }
  H.recordActivity=function() {H.rewards.streak=H.activity(H.rewards.streak);rewardStatus();};
  function quit() {H.quiet();H.game=null;$('pause-card').close();H.views.games();}
  function pause() {
    if(!H.game||H.game.finished) return;
    H.game.paused=true;H.quiet(); if(!$('pause-card').open) $('pause-card').showModal();
  }
  H.pauseGame=pause;
  $('pause-card').addEventListener('cancel',()=>{if(H.game) H.game.paused=false;});
  $('resume-game').onclick=()=>{if(H.game) H.game.paused=false;$('pause-card').close();};
  $('quit-game').onclick=quit;
  function complete(g) {
    out.className=''; const stars=H.gameStars(g.correct);H.rewards.best[g.mode]=Math.max(H.rewards.best[g.mode]||0,stars);H.recordActivity();
    out.replaceChildren(el('h2','Practice complete!'),el('p','★'.repeat(stars)+'☆'.repeat(3-stars),'result-stars'),el('p',g.correct+' / 10 correct. Every practice helps.'));
    out.append(el('p','Best in '+names[g.mode]+': '+H.rewards.best[g.mode]+' stars. Try again whenever you like.'),button('Play again',()=>start(g.mode),'primary'),button('Choose another game',quit));
  }
  function start(mode) {H.quiet();H.game=H.createGame(mode);render();}
  function render() {
    const g=H.game,q=H.current(g);if(g.finished) {complete(g);return;}
    out.className='playing '+g.mode; const isLetter=g.mode==='find'||g.mode==='listen';
    const targetText=isLetter?q.target.glyph:q.target.word;
    const head=el('div',undefined,'game-head');head.append(el('h2',names[g.mode]),button('Pause / quit',pause));
    const meter=el('p','Question '+(g.index+1)+' of 10 · '+g.correct+' correct','muted');
    const prompt=el('section',undefined,'game-prompt');prompt.id='game-prompt';prompt.setAttribute('aria-live','polite');
    if(g.mode==='find') {
      prompt.append(el('p','Find this letter:'),el('strong',q.target.glyph,'game-glyph hi'),el('p',q.target.roman));
    } else if(g.mode==='listen') {
      prompt.append(el('p','Listen, then choose the letter.'));
      if(!H.hasVoice || !H.prefs.audio || H.prefs.muted) prompt.append(el('strong',q.target.roman,'roman-prompt'),el('p','Audio unavailable or off — match this transliteration.'));
      else prompt.append(el('p','Tap Hear again whenever needed.'));
    } else {
      prompt.append(el('span',q.target.emoji,'emoji'),el('p',q.target.meaning));
      if(g.mode==='build') prompt.append(el('p','Put the letter-group tiles in order. Matras stay with their base letter.','note'));
    }
    prompt.append(button('Hear',()=>H.speak(targetText)));
    const choices=el('div',undefined,'game-choices'),feedback=el('p','','game-feedback');feedback.id='game-feedback';feedback.setAttribute('role','status');
    out.replaceChildren(head,meter,prompt,choices,feedback);
    function submit(value) {
      const correct=H.answer(g,value);if(correct===null) return;
      H.quiet();H.tone(correct);
      choices.querySelectorAll('button').forEach(b=>b.disabled=true);
      feedback.textContent=(correct?'✓ Well done! ':'Keep practising! The answer is ')+targetText+' · '+(isLetter?q.target.roman:q.target.meaning);
      const next=button(g.index===9?'See my stars':'Next question',()=>{if(H.next(g)) render();},'primary');next.id='next-question';out.append(next);next.focus();
    }
    if(g.mode==='build') {
      const built=el('p','Tap a tile to start','built hi');built.id='built'; choices.before(built);
      const controls=el('div',undefined,'row');
      const undo=button('Undo tile',()=>{if(g.paused||q.answered) return;q.used.pop();update();});
      const clear=button('Clear word',()=>{if(g.paused||q.answered) return;q.used=[];update();});
      const check=button('Check word',()=>submit(H.built(g)),'primary');check.id='check-word';
      controls.append(undo,clear,check);choices.append(controls);
      const tiles=el('div',undefined,'tile-row');choices.prepend(tiles);
      q.tiles.forEach((t,i)=>{const b=button(t.text,()=>{if(H.tile(g,i))update();},'word-tile hi');b.dataset.tile=i;tiles.append(b);});
      function update() {
        built.textContent=H.built(g)||'Tap a tile to start';
        tiles.querySelectorAll('button').forEach((b,i)=>b.disabled=q.used.includes(i));
        check.disabled=q.used.length!==q.tiles.length;undo.disabled=clear.disabled=!q.used.length;
      }
      update();
    } else q.options.forEach(option=>{const b=button(isLetter?option.glyph:option.word,()=>submit(option.id),'answer hi');b.dataset.answer=option.id;choices.append(b);});
    out.scrollIntoView({block:'start'});
  }
  H.views.games=function() {
    out.className='';H.game=null;H.quiet();out.replaceChildren(el('h2','Gentle practice games'),el('p','Ten questions, no timer. 4 correct earns ★; 7 earns ★★; 9 earns ★★★. You can pause or quit at any time.','intro'));
    const grid=el('div',undefined,'game-menu');
    Object.entries(names).forEach(([id,name])=>{const b=button(name,()=>start(id),'game-menu-card');b.dataset.game=id;b.append(el('small','Best '+'★'.repeat(H.rewards.best[id]||0)+'☆'.repeat(3-(H.rewards.best[id]||0))));grid.append(b);});out.append(grid);
  };
  const navigate=H.navigate;
  H.navigate=function(mode) {out.className='';H.game=null;H.quiet();navigate(mode);};
  $('mute').onclick=()=>{H.prefs.muted=!H.prefs.muted;H.write('prefs',H.prefs);H.quiet();muteLabel();H.audioChanged();};
  function muteLabel() {$('mute').textContent=H.prefs.muted?'Sound off':'Sound on';$('mute').setAttribute('aria-pressed',H.prefs.muted);}
  H.audioChanged=()=>{if(H.game && H.game.mode==='listen' && !H.game.finished && !H.current(H.game).answered) render();};
  $('help').onclick=()=>{H.quiet();$('help-card').showModal();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden && H.game && !document.querySelector('dialog[open]')) pause();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape' && H.game && !document.querySelector('dialog[open]')) {e.preventDefault();pause();}});
  window.addEventListener('resize',()=>{if(H.game&&!H.game.finished) requestAnimationFrame(()=>out.scrollIntoView({block:'start'}));});
  muteLabel();rewardStatus();
})();
