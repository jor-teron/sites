const app = document.querySelector('#app');
const navButtons = [...document.querySelectorAll('.nav-link')];
const completed = new Set(JSON.parse(localStorage.getItem('campcraft-completed') || '[]'));
let currentView = 'home';
let activeLesson = null;
let activeStep = 0;

const lessons = [
  {id:'basics',number:'01',title:'Tent basics',level:'START HERE',duration:'4 min',description:'Get to know the parts of a simple dome tent before you pitch it.',steps:[
    ['Meet your tent','A basic dome tent has a fabric body, flexible poles and usually a separate rainfly. Your exact model may differ.','body'],
    ['Find the tent body','The inner tent is the main fabric room. Mesh panels help ventilation; the door gives you access.','body'],
    ['Identify the poles','Flexible pole sections join together to form the tent frame. Check the pole sleeves, clips or hubs your model uses.','poles'],
    ['Locate the rainfly','The rainfly sits over the tent body and sheds rain. Keep its door and vents aligned with the inner tent.','fly'],
    ['Know the small parts','Pegs anchor the tent to the ground. Guylines add stability. A groundsheet protects the floor when correctly sized.','parts']
  ],tip:'Lay every part out and compare it with your manufacturer’s instructions before heading out.'},
  {id:'pitch',number:'02',title:'Pitch your tent',level:'FIELD SKILL',duration:'8 min',description:'Choose a safe spot, build the frame and secure a beginner dome tent.',steps:[
    ['Choose a good site','Look for level, durable ground. Avoid hollows, dry creek beds, flood channels, dead branches overhead and exposed storm-prone ridges.','site'],
    ['Lay out the groundsheet','Use a footprint or groundsheet slightly smaller than the tent floor so rain cannot collect underneath it.','ground'],
    ['Spread the tent body','Lay the tent body flat with the door facing your preferred direction. Find the pole sleeves or clips.','body'],
    ['Join the pole sections','Connect the shock-corded pole sections gently. Do not let them snap together or force a stuck joint.','poles'],
    ['Raise the frame','Follow your tent’s pole layout. Seat pole ends in their grommets or fittings, then raise the frame gradually.','frame'],
    ['Attach the rainfly','Drape the rainfly over the frame, align doors and vents, then fasten its clips or straps as the maker specifies.','fly'],
    ['Peg out the corners','Pull the floor just taut—not stretched—and drive pegs at an angle away from the tent. Use suitable pegs for the ground.','pegs'],
    ['Tension and check','Tension guylines where provided. Check doors, vents, pole joints and rainfly clearance. Recheck after wind or rain.','finish']
  ],tip:'Never cook, use a stove, lantern with a flame, or fuel-burning heater inside a tent. Carbon monoxide and fire can be fatal.'}
];

function tentSketch(mode='body', compact=false){
  const labels = {
    body:'TENT BODY',poles:'FLEXIBLE POLES',fly:'RAINFLY',parts:'SMALL PARTS',site:'SITE CHECK',ground:'GROUND LAYER',frame:'RAISED FRAME',pegs:'PEG THE CORNERS',finish:'CHECK THE PITCH'
  };
  let tent = `<path class="fabric" d="M95 220 L250 65 Q267 48 284 65 L435 220 Z"/><path class="sketch" d="M95 220 Q265 232 435 220"/><path class="shade" d="M250 220 L250 128 Q265 109 282 128 L282 220 Z"/><path class="sketch thin" d="M250 220 L266 184 L282 220"/><path class="sketch thin" d="M266 184 L266 129"/>`;
  let poles = `<path class="accent" d="M95 220 Q170 22 266 54 Q365 22 435 220"/><path class="sketch thin" d="M95 220 Q266 80 435 220"/>`;
  let fly = `<path class="fabric" d="M83 221 L244 45 Q265 24 287 45 L447 221 L414 221 L279 82 Q266 69 253 82 L116 221 Z"/><path class="sketch thin" d="M244 45 Q266 58 287 45"/>`;
  let ground = `<path class="shade" d="M75 224 Q266 242 455 224 L442 238 Q266 257 88 238 Z"/><path class="sketch thin" d="M95 220 L250 65 Q267 48 284 65 L435 220 Z"/>`;
  let markup = tent;
  if(mode==='poles') markup = `<path class="sketch" d="M95 220 L435 220"/>${poles}<path class="softline" d="M95 220 Q266 80 435 220"/>`;
  if(mode==='fly') markup = fly + `<path class="softline" d="M266 65 L266 220"/>`;
  if(mode==='parts') markup = `${tent}<path class="sketch" d="M95 220 l-12 20 m12 -20 l13 20 M435 220 l-12 20 m12 -20 l13 20"/><path class="accent" d="M435 220 L480 248"/>`;
  if(mode==='ground') markup = `${ground}<path class="ground" d="M45 247 Q260 258 480 247"/>`;
  if(mode==='frame') markup = `${tent}${poles}`;
  if(mode==='site') markup = `<path class="ground" d="M30 225 Q160 216 250 226 T490 225"/><path class="sketch thin" d="M390 75 l15 -24 l15 24 M405 51 v-24 M392 75 h27"/><path class="sketch thin" d="M80 215 l15 -30 l15 30 M95 185 v-22"/><path class="accent" d="M60 245 L150 245 M370 245 L465 245"/>${tent}`;
  if(mode==='pegs') markup = `${tent}<path class="sketch" d="M95 220 l-8 31 l-12 -3 M435 220 l8 31 l12 -3"/><path class="accent" d="M95 220 L65 248 M435 220 L465 248"/>`;
  if(mode==='finish') markup = `${tent}${poles}<path class="sketch" d="M95 220 L58 247 M435 220 L474 247 M160 145 L116 185 M370 145 L414 185"/><path class="accent" d="M58 247 L42 247 M474 247 L490 247"/>`;
  return `<svg class="sketch" viewBox="0 0 530 290" role="img" aria-label="Sketch diagram: ${labels[mode]||'tent'}"><defs><pattern id="papergrain" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".6" fill="#9eaa91" opacity=".35"/></pattern></defs><rect x="0" y="0" width="530" height="290" fill="url(#papergrain)"/>${markup}<path class="ground" d="M38 250 Q265 264 492 250"/><text x="25" y="27">${labels[mode]||'TENT'}</text><text x="425" y="277">FIELD SKETCH / 01</text></svg>`;
}
function heroSketch(){return `<svg class="sketch" viewBox="0 0 520 280" role="img" aria-label="Hand-drawn sketch of a dome tent outdoors"><path class="ground" d="M20 230 Q260 245 500 230"/><path class="fabric" d="M82 226 L232 65 Q257 39 282 65 L438 226 Z"/><path class="shade" d="M232 226 L232 137 Q258 108 285 137 L285 226 Z"/><path class="sketch" d="M82 226 Q260 238 438 226 M82 226 Q180 35 260 48 Q350 35 438 226"/><path class="sketch thin" d="M260 48 Q260 135 260 226"/><path class="accent" d="M82 226 L54 249 M438 226 L466 249"/><path class="sketch thin" d="M54 249 l-7 -8 m7 8 l10 -3 M466 249 l-8 -8 m8 8 l-10 -3"/><circle class="dot" cx="260" cy="48" r="4"/><text x="25" y="28">A PLACE TO BEGIN</text><text x="402" y="270">01 / CAMP</text></svg>`}
function setView(view){currentView=view;activeLesson=null;navButtons.forEach(b=>b.classList.toggle('active',b.dataset.view===view));render()}
function lessonCard(l){return `<article class="lesson-card" data-lesson="${l.id}" tabindex="0" role="button" aria-label="Open ${l.title}"><div class="card-top"><span class="number">${l.number}</span><span class="tag">${completed.has(l.id)?'COMPLETED':l.level}</span></div><h3>${l.title}</h3><p>${l.description}</p><div class="card-bottom"><span>${l.steps.length} illustrated steps · ${l.duration}</span><span class="arrow">↗</span></div></article>`}
function renderHome(){return `<section class="hero"><div><span class="eyebrow">OUTDOOR SKILLS · 01</span><h1>Learn the art of being outdoors.</h1><p class="intro">Simple, practical field skills. Start with the basics, then take them outside.</p><button class="btn primary" data-open="basics">Start learning <span aria-hidden="true">↗</span></button></div><div class="hero-art">${heroSketch()}</div></section><section><div class="section-head"><div><span class="eyebrow">YOUR FIRST FIELD SKILLS</span><h2>Start with shelter.</h2></div><p>Two lessons to get you started.</p></div><div class="lesson-grid">${lessons.map(lessonCard).join('')}</div></section>`}
function renderLessons(){return `<section><span class="eyebrow">THE LEARNING PATH</span><h1>Lessons.</h1><p class="intro">Build confidence one practical skill at a time.</p><div class="lesson-grid">${lessons.map(lessonCard).join('')}</div></section>`}
function renderPractice(){return `<section><span class="eyebrow">TAKE IT OUTSIDE</span><h1>Practice.</h1><p class="intro">A quick field checklist for your first tent pitch.</p><div class="practice-panel"><h3>Before you leave</h3>${['Check your tent and pole sections','Pack pegs, guylines and a suitable groundsheet','Read your tent manufacturer’s pitching instructions','Practise pitching at home once'].map((x,i)=>`<label class="check-row"><input type="checkbox" data-check="${i}"><span>${x}</span></label>`).join('')}<p class="practice-progress" id="practice-progress">0 of 4 checked</p></div><div class="note"><b>Safety first.</b> Keep cooking equipment and open flames outside the tent. Never use fuel-burning appliances in an enclosed shelter.</div></section>`}
function renderLesson(){const l=lessons.find(x=>x.id===activeLesson);const s=l.steps[activeStep];const last=activeStep===l.steps.length-1;return `<section class="lesson-view"><button class="back-link" data-view="lessons">← ALL LESSONS</button><div class="lesson-heading"><div><span class="eyebrow">LESSON ${l.number} · ${l.level}</span><h1>${l.title}</h1><p class="intro">${l.description}</p></div><span class="step-count">${activeStep+1} / ${l.steps.length}</span></div><div class="tutorial"><div class="progress"><span style="width:${(activeStep+1)/l.steps.length*100}%"></span></div><div class="sketch-stage">${tentSketch(s[2])}</div><div class="step-content"><span class="step-kicker">STEP ${String(activeStep+1).padStart(2,'0')}</span><h3>${s[0]}</h3><p>${s[1]}</p></div><div class="step-controls"><button class="btn" data-step="prev" ${activeStep===0?'disabled':''}>← Back</button><button class="btn primary" data-step="next">${last?'Finish lesson':'Next step →'}</button></div></div><div class="note"><b>Field note.</b> ${l.tip}</div></section>`}
function render(){app.innerHTML=activeLesson?renderLesson():currentView==='home'?renderHome():currentView==='lessons'?renderLessons():renderPractice();}
function openLesson(id){activeLesson=id;activeStep=0;render()}
navButtons.forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
app.addEventListener('click',e=>{const open=e.target.closest('[data-open]');if(open){openLesson(open.dataset.open);return}const card=e.target.closest('[data-lesson]');if(card){openLesson(card.dataset.lesson);return}const view=e.target.closest('[data-view]');if(view){setView(view.dataset.view);return}const step=e.target.closest('[data-step]');if(step&&activeLesson){const l=lessons.find(x=>x.id===activeLesson);if(step.dataset.step==='prev')activeStep=Math.max(0,activeStep-1);else if(activeStep===l.steps.length-1){completed.add(l.id);localStorage.setItem('campcraft-completed',JSON.stringify([...completed]));activeLesson=null;currentView='lessons';navButtons.forEach(b=>b.classList.toggle('active',b.dataset.view==='lessons'));}else activeStep++;render()}});
app.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-lesson]')){e.preventDefault();openLesson(e.target.dataset.lesson)}});
app.addEventListener('change',()=>{const checks=[...app.querySelectorAll('[data-check]')];const p=app.querySelector('#practice-progress');if(p)p.textContent=`${checks.filter(c=>c.checked).length} of ${checks.length} checked`});
render();
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
