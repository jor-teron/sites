import {generate} from '../core/levels.mjs';
import {fresh,move,undo,route,stars,clone} from '../core/rules.mjs';
import {read,write,restore} from '../core/storage.mjs';
import {dayStamp,dailyLevel,cleanDaily,completeDaily,visibleStreak} from '../core/daily.mjs';
import {paint,animate,celebrate} from './render.mjs';
import {THEMES,applyBoardTheme} from './themes.mjs';
import {sound} from './sound.mjs';
const $=id=>document.getElementById(id), GS=window.GameSettings;
let store;
try {store=localStorage;} catch {store={getItem:()=>null,setItem:()=>{throw Error();}};}
const saved=read(store);
let progress=saved.progress, daily=cleanDaily(saved.daily);
const validNumber=n=>Math.max(1,Math.min(progress.unlocked,Number.isInteger(n)?n:1));
let mode=saved.mode==='daily'?'daily':'campaign';
let level=mode==='daily'?dailyLevel(dayStamp()):generate(validNumber(saved.number));
let state=restore(level,mode==='daily' && saved.date!==dayStamp()?null:saved.state);
let campaignSession=saved.campaignSession, dailySession=saved.dailySession;
let busy=false,hint=null,hintUntil=Number.isFinite(saved.hintUntil)?Math.min(Date.now()+5000,saved.hintUntil):0,page=0;
let boardTheme='classic';try {boardTheme=store.getItem('arrow-escape.board-theme');} catch {}
boardTheme=applyBoardTheme(store,boardTheme);
function persist() {
  const data={progress,number:level.number,state,mode,date:level.date,daily,campaignSession,dailySession,hintUntil};
  if(!write(store,data))$('status').textContent='Storage unavailable — this session still works.';
}
function theme() {
  const setting=GS?.get('theme')||'auto';let hub='';try {hub=store.getItem('sites-hub.theme')||'';} catch {}
  const dark=setting==='dark'||(setting==='auto'&&(hub?hub==='dark':matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.classList.toggle('dark',dark);
}
theme();GS?.onChange(theme);addEventListener('storage',theme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
GS?.mountGear($('gear'),'arrow-escape');
$('back').onclick=e=>{if(typeof window.hubBack==='function'){e.preventDefault();window.hubBack();}};
function resize() {
  const area=$('play').getBoundingClientRect();
  const px=Math.max(level.n*40,Math.min(640,area.width-16,area.height-16));
  $('board').style.width=`${px}px`;$('board').style.height=`${px}px`;
}
new ResizeObserver(resize).observe($('play'));
function draw(animated=null) {
  paint($('board'),level,state,hint,activate,animated);
  $('level-label').textContent=mode==='daily'?`Daily · ${level.date.slice(5)}`:`Level ${String(level.number).padStart(3,'0')} · ${level.n}×${level.n}`;
  $('moves').textContent=`${state.moves} moves · ${state.arrows.length} left`;
  $('lives').textContent='♥ '.repeat(state.lives)+'♡ '.repeat(3-state.lives);
  $('lives').setAttribute('aria-label',`${state.lives} lives`);
  $('undo').disabled=busy||!state.history.length;
  $('hint').disabled=busy||!state.lives||!state.arrows.length;
  for(const id of ['restart','levels','pause'])$(id).disabled=busy;
}
function open(title,html) {
  $('modal-title').textContent=title;$('modal-body').innerHTML=html;
  if(!$('modal').open)$('modal').showModal();
}
$('close').onclick=()=>$('modal').close();
function coach() {
  $('status').textContent=GS?.get('showHints')===false?'Clear all the arrows.':level.n>8
    ?'Scroll large boards. Clear K keys to open matching L locks.'
    :'Tap a clear arrow. Curved arrows uncoil along their own body.';
}
function refresh() {
  hint=null;hintUntil=0;$('modal').close();coach();resize();draw();persist();
  $('board-scroll').scrollTo(0,0);
  if(!state.arrows.length||!state.lives)endCard();
}
function start(number) {
  if(busy)return;
  if(mode==='daily')dailySession={date:level.date,state:clone(state)};
  mode='campaign';level=generate(validNumber(number));state=fresh(level);refresh();
}
function startDaily(retry=false) {
  if(busy)return;
  if(mode==='campaign')campaignSession={number:level.number,state:clone(state)};
  else dailySession={date:level.date,state:clone(state)};
  mode='daily';level=dailyLevel(dayStamp());
  state=restore(level,!retry && dailySession?.date===level.date?dailySession.state:null);refresh();
}
function returnCampaign() {
  if(busy)return;
  if(mode==='daily')dailySession={date:level.date,state:clone(state)};
  mode='campaign';level=generate(validNumber(campaignSession?.number||1));
  state=restore(level,campaignSession?.state);refresh();
}
function retry() {if(mode==='daily')startDaily(true);else start(level.number);}
function endCard(effects=false) {
  if(!state.arrows.length) {
    const s=stars(state);
    if(mode==='daily')daily=completeDaily(daily,level.date,s);
    else {
      progress.stars[level.number]=Math.max(s,progress.stars[level.number]||0);
      progress.unlocked=Math.min(500,Math.max(progress.unlocked,level.number+1));
    }
    persist();
    if(effects) {
      celebrate();sound('win');
      if(GS?.get('vibration') && navigator.vibrate)try{navigator.vibrate([25,40,25]);}catch{}
    }
    const detail=mode==='daily'?`<p class="intro">Daily ${level.date} · ${visibleStreak(daily)} day streak</p>`:'';
    open('Board cleared!',`<div class="stars">${'★'.repeat(s)}${'☆'.repeat(3-s)}</div><p class="intro">${state.moves} moves · ${state.bumps} bumps · ${state.hints} hints</p>${detail}<div class="actions"><button id="replay">Replay</button><button id="next">${mode==='daily'?'Campaign':level.number===500?'Browse levels':'Next level →'}</button></div>`);
    $('replay').onclick=retry;
    $('next').onclick=()=>{if(mode==='daily')returnCampaign();else if(level.number===500)levels();else start(level.number+1);};
  } else if(!state.lives) {
    open('Out of lives',`<p>Find an arrow with a clear route to the edge. Undo your last bump or try again.</p><div class="actions"><button id="recover">Undo bump</button><button id="retry">Retry</button></div>`);
    $('recover').onclick=()=>{$('modal').close();undo(state);draw();persist();};$('retry').onclick=retry;
  }
}
async function activate(id) {
  if(busy||$('modal').open||!state.lives)return;
  if(mode==='daily' && level.date!==dayStamp()){startDaily();return;}
  const a=state.arrows.find(a=>a.id===id);if(!a)return;
  const result=route(a,state.arrows,level.n);
  if(result.reason==='locked') {
    hint=a.lock;draw();$('status').textContent=`Clear the matching K${a.lockLabel} key first. Locked taps do not cost lives.`;
    sound('bump');return;
  }
  busy=true;hint=null;draw();
  await animate(a,result,animated=>draw(animated));
  move(state,id,level.n);busy=false;draw();persist();
  sound(result.safe?(a.keyLabel?'key':'slide'):'bump');
  $('status').textContent=result.safe?(a.keyLabel?`K${a.keyLabel} cleared — matching lock is open!`:'Clear path! Keep going.'):'Blocked! One life lost. Look beyond the arrowhead.';
  if(!result.safe && GS?.get('screenShake') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    $('board-scroll').animate([{transform:'translateX(0)'},{transform:'translateX(4px)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}],{duration:180});
  }
  if(document.hidden && GS?.get('autoPause'))pause();else endCard(true);
}
$('undo').onclick=()=>{
  if(!busy&&undo(state)){hint=null;draw();persist();$('status').textContent='Last move undone. Keys and locks restored.';}
};
$('restart').onclick=retry;
$('hint').onclick=()=>{
  if(busy||Date.now()<hintUntil){$('status').textContent='Wait a few seconds before another hint.';return;}
  const a=state.arrows.find(a=>route(a,state.arrows,level.n).safe);if(!a)return;
  hint=a.id;state.hints++;hintUntil=Date.now()+5000;draw();persist();
  $('board').querySelector(`[data-id="${a.id}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
  $('status').textContent='The gold-highlighted arrow can leave safely. Hints reduce stars.';
};
function dailyButton() {
  const s=daily.completed[dayStamp()];
  return `<button class="daily-choice" id="daily">Daily · ${dayStamp()} IST<small>${s?'★'.repeat(s)+' · ':''}${visibleStreak(daily)} day streak</small></button>`;
}
function levels() {
  const start=page*50+1,end=Math.min(500,start+49);
  open('Select level',`${dailyButton()}<div class="pages"><button id="prev-page" ${page?'':'disabled'} aria-label="Previous levels">←</button><span>${String(start).padStart(3,'0')} – ${end}</span><button id="next-page" ${page<9?'':'disabled'} aria-label="Next levels">→</button></div><div class="level-grid"></div>`);
  for(let i=start;i<=end;i++) {
    const b=document.createElement('button');b.className='level-cell'+(mode==='campaign'&&i===level.number?' current':'');
    b.disabled=i>progress.unlocked;b.innerHTML=`${String(i).padStart(3,'0')}<small>${progress.stars[i]?'★'.repeat(progress.stars[i]):b.disabled?'Locked':'☆'}</small>`;
    b.onclick=()=>start(i);$('modal-body').querySelector('.level-grid').append(b);
  }
  $('daily').onclick=()=>startDaily();
  $('prev-page').onclick=()=>{page--;levels();};$('next-page').onclick=()=>{page++;levels();};
}
$('levels').onclick=()=>{
  const number=mode==='daily'?(campaignSession?.number||1):level.number;
  page=Math.floor((validNumber(number)-1)/50);levels();
};
function help() {
  open('How to play',`<ol class="help-list"><li>Tap or focus an arrow and press Enter or Space. Its head points towards the exit.</li><li>A clear arrow slides off. A bent or zigzag arrow uncoils: each segment follows the one in front, then exits straight behind its head.</li><li>A blocked arrow travels to the obstacle and bumps back. Three bumps lose the board. Undo restores arrows and lives.</li><li>Clear a <strong>K-number key</strong> to release the matching <strong>L-number lock</strong>. Locked taps do not use lives. Undoing a key locks its partner again.</li><li>Hints highlight a currently safe arrow, with a five-second cooldown. No bumps or hints earns three stars. One penalty earns two; more earns one. Undo cannot remove hint penalties.</li><li>Scroll large boards: cells never shrink below 40 px. All 500 levels are solvable. Complete a level to unlock the next.</li><li>Daily changes at midnight IST. Complete on consecutive dates for a streak. Replaying a daily never adds extra days.</li></ol><p>Progress and both campaign/daily sessions stay on this device. Pause or leave whenever you like. Auto theme follows Hub Light/Dark, then your system.</p><div class="actions"><button id="help-back">Back to pause</button></div>`);
  $('help-back').onclick=pause;
}
function pause() {
  if(busy)return;
  // Moves/hints are saved eagerly; pausing must not rewrite a cleared store.
  open('Paused',`<div class="actions"><button id="resume">▶ Resume</button><button id="help">How to play</button></div><div class="option-row"><label for="board-theme">Board theme</label><select id="board-theme">${THEMES.map(([id,label])=>`<option value="${id}" ${boardTheme===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="option-row"><span>Synthesized sounds</span><button id="mute"></button></div>${dailyButton()}${mode==='daily'?'<button id="campaign">Return to campaign</button>':''}<p class="hint-note">Auto light/dark and sound volume are in ⚙ shared Game Settings. Progress is saved.</p>`);
  $('resume').onclick=()=>{$('modal').close();endCard();};$('help').onclick=help;
  $('board-theme').onchange=e=>{boardTheme=applyBoardTheme(store,e.target.value);draw();};
  const muted=()=>{try{return GS?!GS.get('sfx'):store.getItem('arrow-escape.muted')==='true';}catch{return false;}};
  const muteLabel=()=>{$('mute').textContent=muted()?'Muted':'Sound on';$('mute').setAttribute('aria-pressed',String(muted()));};
  muteLabel();$('mute').onclick=()=>{
    const next=muted();if(GS)GS.set('sfx',next);else try{store.setItem('arrow-escape.muted',String(!next));}catch{}
    muteLabel();if(next)sound('slide');
  };
  $('daily').onclick=()=>startDaily();if($('campaign'))$('campaign').onclick=returnCampaign;
}
$('pause').onclick=pause;
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open&&!busy){e.preventDefault();pause();}});
addEventListener('visibilitychange',()=>{if(document.hidden&&GS?.get('autoPause')&&!busy&&!$('modal').open)pause();});
// Read-only state for diagnostics and scripted interaction tests.
window.arrowEscape={get state(){return clone(state);},get level(){return clone(level);},get busy(){return busy;},get mode(){return mode;}};
coach();resize();draw();if(!state.arrows.length||!state.lives)endCard();
