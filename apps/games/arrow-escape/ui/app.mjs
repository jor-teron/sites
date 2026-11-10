import {generate} from '../core/levels.mjs';
import {fresh,move,undo,route,stars} from '../core/rules.mjs';
import {read,write,restore} from '../core/storage.mjs';
import {paint,animate} from './render.mjs';
const $=id=>document.getElementById(id), GS=window.GameSettings;
let store;try {store=localStorage;} catch {store={getItem:()=>null,setItem:()=>{throw Error();}};}
const saved=read(store); let progress=saved.progress;
let level=generate(Math.max(1,Math.min(progress.unlocked,(Number.isInteger(saved.number)?saved.number:1))));
let state=restore(level,saved.state), busy=false,hint=null,hintUntil=0,page=0;
function persist() {if(!write(store,{progress,number:level.number,state})) $('status').textContent='Storage unavailable — this session still works.';}
function theme() {
  const setting=GS?.get('theme')||'auto';let hub='';try {hub=store.getItem('sites-hub.theme')||'';} catch {}
  document.documentElement.classList.toggle('dark',setting==='dark'||(setting==='auto'&&(hub?hub==='dark':matchMedia('(prefers-color-scheme: dark)').matches)));
}
theme();GS?.onChange(theme);addEventListener('storage',theme);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
GS?.mountGear($('gear'),'arrow-escape');
$('back').onclick=e=>{if(window.hubBack){e.preventDefault();window.hubBack();}};
function resize() {
  const area=$('play').getBoundingClientRect();
  const px=Math.max(level.n*40,Math.min(640,area.width-16,area.height-16));
  $('board').style.width=`${px}px`;$('board').style.height=`${px}px`;
}
new ResizeObserver(resize).observe($('play'));
function draw(animated=null) {
  paint($('board'),level,state,hint,activate,animated);
  $('level-label').textContent=`Level ${String(level.number).padStart(3,'0')} · ${level.n}×${level.n}`;
  $('moves').textContent=`${state.moves} moves`;$('lives').textContent='♥ '.repeat(state.lives)+'♡ '.repeat(3-state.lives);
  $('lives').setAttribute('aria-label',`${state.lives} lives`);
  $('undo').disabled=busy||!state.history.length;$('hint').disabled=busy||state.lives===0||!state.arrows.length;
  $('restart').disabled=busy;$('levels').disabled=busy;
}
function open(title,html) {$('modal-title').textContent=title;$('modal-body').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
$('close').onclick=()=>$('modal').close();
function endCard() {
  if(!state.arrows.length) {
    const s=stars(state);progress.stars[level.number]=Math.max(s,progress.stars[level.number]||0);
    progress.unlocked=Math.min(500,Math.max(progress.unlocked,level.number+1));persist();
    open('Board cleared!',`<div class="stars">${'★'.repeat(s)}${'☆'.repeat(3-s)}</div><p class="intro">${state.moves} moves · ${state.bumps} bumps · ${state.hints} hints</p><div class="actions"><button id="replay">Replay</button><button id="next">${level.number===500?'All 500 cleared!':'Next level →'}</button></div>`);
    $('replay').onclick=()=>start(level.number);$('next').onclick=()=>start(Math.min(500,level.number+1));
  } else if(!state.lives) {
    open('Out of lives',`<p>Find an arrow with a clear route to the edge. Undo your last bump or try again.</p><div class="actions"><button id="recover">Undo bump</button><button id="retry">Retry</button></div>`);
    $('recover').onclick=()=>{$('modal').close();undo(state);draw();persist();};$('retry').onclick=()=>start(level.number);
  }
}
async function activate(id) {
  if(busy||$('modal').open||!state.lives)return;
  const a=state.arrows.find(a=>a.id===id);if(!a)return;
  const result=route(a,state.arrows,level.n);busy=true;hint=null;draw();
  await animate(a,result,animated=>draw(animated));
  move(state,id,level.n);busy=false;draw();persist();
  $('status').textContent=result.safe?'Clear path! Keep going.':'Blocked! One life lost. Look beyond the arrowhead.';
  endCard();
}
function start(number) {
  if(busy)return;
  level=generate(number);state=fresh(level);hint=null;hintUntil=0;$('modal').close();
  $('status').textContent=level.n>8?'Scroll the board to explore. Tap a clear arrow.':'Tap an arrow whose path to the edge is clear.';
  resize();draw();persist();
}
$('undo').onclick=()=>{if(!busy&&undo(state)){hint=null;draw();persist();$('status').textContent='Last move undone.';}};
$('restart').onclick=()=>start(level.number);
$('hint').onclick=()=>{
  if(busy||Date.now()<hintUntil) {$('status').textContent='Wait a few seconds before another hint.';return;}
  const a=state.arrows.find(a=>route(a,state.arrows,level.n).safe);if(!a)return;
  hint=a.id;state.hints++;hintUntil=Date.now()+5000;draw();persist();
  $('board').querySelector(`[data-id="${a.id}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});
  $('status').textContent='The gold arrow can leave safely. Hints reduce your stars.';
};
function levels() {
  const start=page*50+1,end=Math.min(500,start+49);
  open('Select level',`<div class="pages"><button id="prev-page" ${page?'':'disabled'}>←</button><span>${String(start).padStart(3,'0')} – ${end}</span><button id="next-page" ${page<9?'':'disabled'}>→</button></div><div class="level-grid"></div>`);
  for(let i=start;i<=end;i++) {
    const b=document.createElement('button');b.className='level-cell'+(i===level.number?' current':'');
    b.disabled=i>progress.unlocked;b.innerHTML=`${String(i).padStart(3,'0')}<small>${progress.stars[i]?'★'.repeat(progress.stars[i]):b.disabled?'Locked':'☆'}</small>`;
    b.onclick=()=>start(i);$('modal-body').querySelector('.level-grid').append(b);
  }
  $('prev-page').onclick=()=>{page--;levels();};$('next-page').onclick=()=>{page++;levels();};
}
$('levels').onclick=()=>{page=Math.floor((level.number-1)/50);levels();};
// Read-only state for diagnostics and scripted interaction tests.
window.arrowEscape={get state(){return JSON.parse(JSON.stringify(state));},get level(){return JSON.parse(JSON.stringify(level));},get busy(){return busy;}};
resize();draw();if(!state.arrows.length||!state.lives)endCard();
