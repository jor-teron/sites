import {DIRS} from '../core/rules.mjs';
import {arrowColor} from './themes.mjs';
const NS='http://www.w3.org/2000/svg';
export function el(tag,attrs={}) {
  const e=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
  return e;
}
export function paint(board,level,state,hint,activate,animated=null) {
  board.replaceChildren(); board.setAttribute('viewBox',`0 0 ${level.n*100} ${level.n*100}`);
  const theme=document.documentElement.dataset.boardTheme;
  if(theme==='floor'||theme==='stone') {
    for(let y=0;y<level.n;y++)for(let x=0;x<level.n;x++) {
      if(theme==='floor')board.append(el('rect',{x:x*100+3,y:y*100+3,width:94,height:94,rx:3,
        class:(x+y)%2?'floor-a':'floor-b'}));
      else board.append(el('rect',{x:x*100+4+(y%2)*2,y:y*100+5,width:90,height:88,rx:12+(x%3)*3,class:'stone-cell'}));
    }
  }
  for(let i=1;i<level.n;i++) {
    board.append(el('path',{d:`M${i*100} 0V${level.n*100} M0 ${i*100}H${level.n*100}`,class:'grid-line'}));
  }
  for(const a of state.arrows) {
    const cells=animated?.id===a.id ? animated.cells : a.cells;
    const locked=a.lock!==undefined && state.arrows.some(b=>b.id===a.lock);
    const g=el('g',{class:`arrow ${hint===a.id?'hint':''} ${locked?'locked':''}`,'data-id':a.id,role:'button',tabindex:0,
      'aria-label':`Arrow ${a.id+1} pointing ${['up','right','down','left'][a.dir]}${locked?`, locked until key ${a.lockLabel}`:a.keyLabel?`, key ${a.keyLabel}`:''}`});
    const color=a.keyLabel?'#bd8b1e':arrowColor(a.id), points=cells.map(([x,y])=>[x*100+50,y*100+50]);
    const [x,y]=points.at(-1), [dx,dy]=DIRS[a.dir];
    g.append(el('polyline',{points:points.map(p=>p.join(',')).join(' '),stroke:color,class:'body'}));
    g.append(el('path',{d:`M${x-dx*9-dy*17} ${y-dy*9+dx*17} L${x+dx*15} ${y+dy*15} L${x-dx*9+dy*17} ${y-dy*9-dx*17}`,stroke:color,class:'head'}));
    if(theme==='carbus') {
      const [cx,cy]=points[Math.floor((points.length-1)/2)],vertical=a.dir%2===0;
      g.append(el('rect',{x:cx-(vertical?12:23),y:cy-(vertical?23:12),width:vertical?24:46,
        height:vertical?46:24,rx:6,fill:color,stroke:'var(--panel)','stroke-width':3}));
      g.append(el('rect',{x:cx-6,y:cy-6,width:12,height:12,rx:2,fill:'var(--panel)'}));
    }
    if(a.keyLabel||a.lockLabel) {
      const [tx,ty]=points[0],label=a.keyLabel?`K${a.keyLabel}`:locked?`L${a.lockLabel}`:'✓';
      g.append(el('circle',{cx:tx,cy:ty,r:25,fill:'var(--panel)',stroke:color,'stroke-width':4}));
      const text=el('text',{x:tx,y:ty+8,'text-anchor':'middle','font-size':23,'font-weight':800,fill:color});
      text.textContent=label;g.append(text);
    }
    cells.forEach(([cx,cy])=>g.append(el('rect',{x:cx*100,y:cy*100,width:100,height:100,class:'hit'})));
    g.addEventListener('click',()=>activate(a.id));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();activate(a.id);}});
    board.append(g);
  }
}
export function animate(a,result,redraw) {
  // Each segment advances along its predecessor: curved bodies uncoil, never translate sideways.
  return import('../core/rules.mjs').then(({trajectory})=>new Promise(resolve=>{
    const steps=result.safe?result.steps:Math.max(.16,result.steps+.16);
    const frames=trajectory(a,Math.ceil(steps));
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:(result.safe?260+steps*20:360);
    const start=performance.now();
    function frame(now) {
      const t=duration?Math.min(1,(now-start)/duration):1;
      const ease=result.safe?1-(1-t)**2:Math.sin(Math.PI*t);
      const pos=ease*steps, i=Math.min(frames.length-2,Math.floor(pos)), f=pos-i;
      const cells=frames[i].map(([x,y],j)=>[x+(frames[i+1][j][0]-x)*f,y+(frames[i+1][j][1]-y)*f]);
      redraw({id:a.id,cells});
      if(t<1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  }));
}

export function celebrate() {
  if(window.GameSettings?.get('lowGraphics') || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  document.querySelector('.confetti')?.remove();
  const layer=document.createElement('div');layer.className='confetti';layer.ariaHidden='true';
  for(let i=0;i<24;i++) {
    const bit=document.createElement('i');bit.style.cssText=`--x:${(i*41)%100}%;--delay:${i%5*.05}s;--color:${arrowColor(i)};--spin:${i%2?1:-1}`;
    layer.append(bit);
  }
  document.body.append(layer);setTimeout(()=>layer.remove(),1600);
}
