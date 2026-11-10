/* Reuse buttons to preserve keyboard focus and in-progress touch gestures. */
window.MineView=(()=>{
  const board=document.getElementById('board'),wrap=document.getElementById('boardWrap');let buttons=[],current;
  function fit(){
    if(!current)return;
    const zoom=document.getElementById('zoom').value;
    const size=zoom==='fit'?Math.max(20,Math.min(36,Math.floor((wrap.clientWidth-10)/current.width),Math.floor((wrap.clientHeight-10)/current.height))):Number(zoom);
    board.style.setProperty('--size',size+'px');
  }
  function draw(g){
    current=g;
    if(buttons.length!==g.cells.length||Number(board.dataset.width)!==g.width){
      board.replaceChildren();buttons=[];board.dataset.width=g.width;board.style.gridTemplateColumns=`repeat(${g.width},var(--size,30px))`;
      board.setAttribute('aria-rowcount',g.height);board.setAttribute('aria-colcount',g.width);
      for(let y=0;y<g.height;y++){
        const row=document.createElement('div');row.className='row';row.setAttribute('role','row');
        for(let x=0;x<g.width;x++){
          const b=document.createElement('button'),i=y*g.width+x;b.type='button';b.dataset.index=i;b.tabIndex=i?-1:0;
          b.setAttribute('role','gridcell');b.setAttribute('aria-rowindex',y+1);b.setAttribute('aria-colindex',x+1);row.appendChild(b);buttons.push(b);
        }
        board.appendChild(row);
      }
    }
    const end=g.status==='lost'||g.status==='won';
    g.cells.forEach((c,i)=>{
      const b=buttons[i],mine=end&&c.mine,wrong=g.status==='lost'&&c.mark===1&&!c.mine;
      b.className='cell'+(c.open?' open':'')+(mine?' mine':'')+(c.mark===1?' flag':'')+(wrong?' wrong':'')+(g.exploded===i?' exploded':'');
      b.dataset.number=c.open&&!c.mine?c.number:'';b.textContent=wrong?'×':mine?'✹':c.open?c.number||'':c.mark===1?'⚑':c.mark===2?'?':'';
      const label=wrong?'wrong flag':mine?'mine':c.open?c.number?`${c.number} adjacent mines`:'empty':c.mark===1?'flagged':c.mark===2?'question mark':'covered';
      b.setAttribute('aria-label',`Row ${Math.floor(i/g.width)+1} column ${i%g.width+1}: ${label}`);
    });
    document.getElementById('remaining').textContent=g.mines-MineRules.flags(g);
    const reset=document.getElementById('reset');reset.textContent=g.status==='won'?'☀':g.status==='lost'?'☹':'☺';
    reset.setAttribute('aria-label',(end?(g.status==='won'?'You won. ':'Mine hit. '):'')+'New game');fit();
  }
  new ResizeObserver(fit).observe(wrap);document.getElementById('zoom').addEventListener('change',fit);
  return {draw,fit,board};
})();
