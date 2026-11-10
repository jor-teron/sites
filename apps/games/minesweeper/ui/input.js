/* Touch: hold once to flag; move >8px to cancel hold and pan the minefield. */
window.MineInput=function(board,action,getGame){
  let gesture=null,ignoreClickUntil=0;
  const index=t=>{const b=t.closest('[data-index]');return b?Number(b.dataset.index):-1;};
  function clear(){if(gesture)clearTimeout(gesture.timer);gesture=null;}
  board.addEventListener('click',e=>{if(Date.now()<ignoreClickUntil&&e.detail!==0)return;const i=index(e.target);if(i>=0)action(i,false);});
  board.addEventListener('contextmenu',e=>{e.preventDefault();const i=index(e.target);if(i>=0&&Date.now()>=ignoreClickUntil)action(i,true);});
  board.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(gesture){clear();return;}
    const i=index(e.target);if(i<0)return;
    gesture={id:e.pointerId,i,x:e.clientX,y:e.clientY,left:board.parentElement.scrollLeft,top:board.parentElement.scrollTop,held:false,moved:false};
    board.setPointerCapture(e.pointerId);ignoreClickUntil=Date.now()+1000;
    gesture.timer=setTimeout(()=>{if(gesture&&!gesture.moved){gesture.held=true;action(i,true);}},400);
  });
  board.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.hypot(dx,dy)>8){gesture.moved=true;clearTimeout(gesture.timer);}
    if(gesture.moved){board.parentElement.scrollLeft=gesture.left-dx;board.parentElement.scrollTop=gesture.top-dy;}
  });
  board.addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;clear();ignoreClickUntil=Date.now()+650;if(!g.held&&!g.moved)action(g.i,false);
  });
  board.addEventListener('pointercancel',clear);board.addEventListener('lostpointercapture',clear);
  board.addEventListener('focusin',e=>{const i=index(e.target);if(i<0)return;board.querySelectorAll('[tabindex="0"]').forEach(b=>{b.tabIndex=-1;});e.target.tabIndex=0;});
  board.addEventListener('keydown',e=>{
    const i=index(e.target),g=getGame();if(i<0)return;
    if(e.key.toLowerCase()==='f'){e.preventDefault();action(i,true);return;}
    const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-g.width,ArrowDown:g.width};if(!(e.key in moves))return;
    e.preventDefault();const next=Math.max(0,Math.min(g.cells.length-1,i+moves[e.key]));board.querySelector(`[data-index="${next}"]`).focus();
  });
};
