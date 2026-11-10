/* All six bubbles have a unique dark inner symbol, independent of hue. */
window.BubbleRender=(()=>{
  const B=BubbleRules, colors=['#f4778b','#f6bc50','#55c7a3','#6eabf7','#b590ee','#5ed1dc'],symbols=['●','◆','▲','✚','★','≋'];
  const canvas=document.getElementById('board'),ctx=canvas.getContext('2d');
  let ink='#24364d',muted='#596d87',line='#c7d4e5',field='#f7faff';
  function resize(){
    const box=document.getElementById('arena').getBoundingClientRect(),s=Math.min(box.width/B.W,box.height/B.H);
    canvas.style.width=`${B.W*s}px`;canvas.style.height=`${B.H*s}px`;
    const dpr=Math.min(3,window.devicePixelRatio||1);
    canvas.width=Math.round(B.W*s*dpr);canvas.height=Math.round(B.H*s*dpr);ctx.setTransform(canvas.width/B.W,0,0,canvas.height/B.H,0,0);
  }
  function bubble(x,y,color,r=B.R,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x-r*.3,y-r*.4,1,x,y,r);g.addColorStop(0,'#fff');g.addColorStop(.3,colors[color]);g.addColorStop(1,colors[color]);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r-1,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#16304755';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='#142538';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${r*.95}px system-ui`;ctx.fillText(symbols[color],x,y+.5);ctx.restore();
  }
  function path(points,dash){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function draw(s,angle,flight,particles,paused){
    const css=getComputedStyle(document.documentElement);ink=css.getPropertyValue('--ink');muted=css.getPropertyValue('--muted');line=css.getPropertyValue('--line');field=css.getPropertyValue('--field');
    ctx.clearRect(0,0,B.W,B.H);ctx.fillStyle=field;ctx.fillRect(0,0,B.W,B.H);
    ctx.fillStyle=line;ctx.fillRect(0,0,B.W,B.TOP+s.ceiling);
    ctx.strokeStyle=line;ctx.lineWidth=1;for(let x=20;x<B.W;x+=40)for(let y=38;y<B.LINE;y+=B.DY){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='#df6480';ctx.lineWidth=2;path([{x:8,y:B.LINE},{x:B.W-8,y:B.LINE}],[5,7]);
    ctx.fillStyle=muted;ctx.font='11px system-ui';ctx.textAlign='left';ctx.fillText('BOTTOM LINE',10,B.LINE+15);
    if(!flight&&s.status==='play'&&!paused&&BubbleSettings.get('showHints')){
      const guide=B.trajectory(s.board,angle,s.ceiling,1);ctx.strokeStyle=ink;ctx.globalAlpha=.5;ctx.lineWidth=3;path(guide.points,[1,12]);ctx.globalAlpha=1;
      if(guide.cell){const p=B.point(guide.cell,s.ceiling);bubble(p.x,p.y,s.current,B.R,.22);}
    }
    s.board.forEach(b=>{const p=B.point(b,s.ceiling);bubble(p.x,p.y,b.color);});
    ctx.strokeStyle=ink;ctx.lineWidth=12;ctx.lineCap='round';path([B.LAUNCH,{x:B.LAUNCH.x+Math.cos(angle)*36,y:B.LAUNCH.y+Math.sin(angle)*36}],[]);
    if(!flight)bubble(B.LAUNCH.x,B.LAUNCH.y,s.current);else bubble(flight.x,flight.y,flight.color);
    bubble(327,608,s.next,15);ctx.fillStyle=muted;ctx.textAlign='center';ctx.font='11px system-ui';ctx.fillText('NEXT',327,582);ctx.fillText('CURRENT',200,632);
    particles.forEach(p=>{if(p.bubble)bubble(p.x,p.y,p.color,B.R,p.life);else {ctx.globalAlpha=p.life;ctx.fillStyle=colors[p.color];ctx.fillRect(p.x,p.y,5,5);}});ctx.globalAlpha=1;
  }return {canvas,resize,draw};
})();
