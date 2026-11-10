import {DIRS} from '../core/rules.mjs';
const NS='http://www.w3.org/2000/svg';
export function el(tag,attrs={}) {
  const e=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
  return e;
}
const colors=['#287eac','#b16a3d','#3b9172','#9866b7','#bc5876','#607eaa'];
export function paint(board,level,state,hint,activate,animated=null) {
  board.replaceChildren(); board.setAttribute('viewBox',`0 0 ${level.n*100} ${level.n*100}`);
  for(let i=1;i<level.n;i++) {
    board.append(el('path',{d:`M${i*100} 0V${level.n*100} M0 ${i*100}H${level.n*100}`,class:'grid-line'}));
  }
  for(const a of state.arrows) {
    const cells=animated?.id===a.id ? animated.cells : a.cells;
    const g=el('g',{class:`arrow ${hint===a.id?'hint':''}`,'data-id':a.id,role:'button',tabindex:0,
      'aria-label':`Arrow ${a.id+1} pointing ${['up','right','down','left'][a.dir]}`});
    const color=colors[a.id%colors.length], points=cells.map(([x,y])=>[x*100+50,y*100+50]);
    const [x,y]=points.at(-1), [dx,dy]=DIRS[a.dir];
    g.append(el('polyline',{points:points.map(p=>p.join(',')).join(' '),stroke:color,class:'body'}));
    g.append(el('path',{d:`M${x-dx*9-dy*17} ${y-dy*9+dx*17} L${x+dx*15} ${y+dy*15} L${x-dx*9+dy*17} ${y-dy*9-dx*17}`,stroke:color,class:'head'}));
    cells.forEach(([cx,cy])=>g.append(el('rect',{x:cx*100,y:cy*100,width:100,height:100,class:'hit'})));
    g.addEventListener('click',()=>activate(a.id));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();activate(a.id);}});
    board.append(g);
  }
}
export function animate(a,result,redraw) {
  // Each segment follows the previous one. ARW-1a arrows are straight.
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
