/* JIG-1a: pointer controller, autosave, clock and UI. Rotation/zoom/sound are JIG-1b. */
(() => {
  'use strict';
  const M=JigsawModel, S=JigsawSettings, $=id=>document.getElementById(id);
  const canvas=$('board'), renderer=new JigsawRenderer(canvas), counts=[12,24,48,100,150,200,300];
  const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch(_){return null;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}};
  let state,image,picture=0,photo=read('jigsaw.photo'),elapsed=0,started=false,paused=false,last=performance.now();
  let drag=null,dirty=false,drawPending=false,lastDraw=0,volatilePhoto=false,loadSerial=0;
  const format=t=>{t=Math.floor(t);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
  const bestKey=()=>`${picture}:${state.count}`;
  let bests=read('jigsaw.best'); if(!bests || typeof bests!=='object' || Array.isArray(bests)) bests={};
  if(!photo || typeof photo.url!=='string' || !photo.url.startsWith('data:image/jpeg;base64,') || !/^photo-[0-9a-f]+$/.test(photo.id))photo=null;
  JigsawPictures.titles.forEach((t,i)=>$('picture').add(new Option(t,i)));
  if(photo)$('picture').add(new Option('Your last photo',photo.id));
  counts.forEach(n=>$('size').add(new Option(`${n} pieces`,n))); $('size').value='24';
  S.mountGear($('gear'));
  function message(text){$('status').textContent=text;}
  function tick(allowHidden=false){
    const now=performance.now(); if(started && !paused && (allowHidden || !document.hidden) && !M.complete(state))elapsed+=(now-last)/1000;
    last=now; $('time').textContent=format(elapsed);
  }
  function hud(){
    $('placed').textContent=`${state.pieces.filter(p=>p.locked).length} / ${state.count}`;
    $('best').textContent=Number.isFinite(bests[bestKey()])?format(bests[bestKey()]):'—';
    $('board').ariaLabel=`Jigsaw puzzle with ${state.count} pieces. Drag pieces to join them or place them on the board.`;
  }
  function draw(){renderer.draw(state,image,{ghost:$('ghost').checked,edges:$('edges').checked,active:drag?.group});}
  function invalidate(){
    if(drawPending)return;drawPending=true;
    requestAnimationFrame(function frame(now){
      if(now-lastDraw<1000/(S.get('fpsLimit')||30)){requestAnimationFrame(frame);return;}
      drawPending=false;lastDraw=now;draw();
    });
  }
  function save(){
    tick(); if(!state || volatilePhoto)return;
    if(!write('jigsaw.save',{...state,picture,elapsed,started,ghost:$('ghost').checked,edges:$('edges').checked}))
      message('Storage unavailable — keep this tab open to keep your puzzle.');
    dirty=false;
  }
  function stageBounds(){
    const a=renderer.world(8,8),b=renderer.world(renderer.width-8,renderer.height-8);
    return {left:a.x,top:a.y,right:b.x,bottom:b.y};
  }
  // Keep complete groups reachable after a resize; never break their relative offsets.
  function contain(id){
    const members=M.group(state,id);if(!members.length || members[0].locked)return;
    const b=stageBounds(), pad=renderer.pad;
    const left=Math.min(...members.map(p=>p.x))-pad,top=Math.min(...members.map(p=>p.y))-pad;
    const right=Math.max(...members.map(p=>p.x+state.w))+pad,bottom=Math.max(...members.map(p=>p.y+state.h))+pad;
    // Large joined groups can exceed a narrow viewport: keep their centre reachable.
    const dx=right-left>b.right-b.left?(b.left+b.right-left-right)/2:Math.max(b.left-left,Math.min(0,b.right-right));
    const dy=bottom-top>b.bottom-b.top?(b.top+b.bottom-top-bottom)/2:Math.max(b.top-top,Math.min(0,b.bottom-bottom));
    M.move(state,members[0].id,dx,dy);
  }
  function fit(){
    if(!state || !image)return;
    if(drag)finish(true);
    renderer.fit(state,image);new Set(state.pieces.filter(p=>!p.locked).map(p=>p.group)).forEach(contain);invalidate();
  }
  function scatter(){
    const rng=M.random(state.seed+789), b=stageBounds(), pad=renderer.pad;
    const top=1000/state.aspect+42/renderer.view.scale, bottom=b.bottom-state.h-pad;
    // Tray uses jittered slots, so even the 300-piece layout has no fully covered pieces.
    const left=b.left+pad,right=b.right-state.w-pad,usable=Math.max(state.h,bottom-top);
    const columns=Math.max(2,Math.ceil(Math.sqrt(state.count*(right-left)/usable)));
    const rows=Math.ceil(state.count/columns), ids=state.pieces.map(p=>p.id);
    for(let i=ids.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    ids.forEach((id,i)=>{const p=state.pieces[id];
      p.x=left+(i%columns+.2+rng()*.15)/columns*(right-left);
      p.y=top+(Math.floor(i/columns)+rng()*.2)/Math.max(1,rows-1)*Math.max(0,bottom-top);
      contain(p.group);
    });
    // A few side pieces around the board when there is room.
    if(renderer.view.x>renderer.view.scale*(state.w+pad*3))state.pieces.slice(0,Math.min(8,state.count)).forEach((p,i)=>{
      p.x=i%2?1000+pad:b.left+pad;p.y=(i/8)*1000/state.aspect;contain(p.group);
    });
  }
  async function source(id){
    if(typeof id==='number' && id>=0 && id<6)return JigsawPictures.make(id);
    if(!photo || id!==photo.id)throw new Error('Photo is not available on this device.');
    const img=new Image();img.src=photo.url;await img.decode();return img;
  }
  async function start(id,count,saved=null){
    const serial=++loadSerial;
    try{
      const nextImage=await source(id);if(serial!==loadSerial)return;
      if(drag)finish(true);tick();picture=id;image=nextImage;
      state=saved || M.create(count,image.width/image.height,Math.floor(Math.random()*0x7fffffff));
      elapsed=saved?Math.max(0,Number(saved.elapsed)||0):0;started=!!saved?.started;paused=false;last=performance.now();
      $('over').hidden=$('pause').hidden=true;$('picture').value=String(id);$('size').value=String(state.count);
      $('ghost').checked=!!saved?.ghost;$('edges').checked=!!saved?.edges;
      renderer.fit(state,image);if(!saved)scatter();else new Set(state.pieces.map(p=>p.group)).forEach(contain);
      hud();invalidate();message(saved?'Saved puzzle resumed.':'Drag pieces to the board or join matching neighbours.');
      save();if(M.complete(state))complete();
    }catch(e){message(e.message);if(!state)await start(0,24);}
  }
  function complete(){
    tick();const key=bestKey(),record=!Number.isFinite(bests[key]) || elapsed<bests[key];
    if(record){bests[key]=elapsed;write('jigsaw.best',bests);}
    $('result').textContent=`${state.count} pieces in ${format(elapsed)}${record?' · New best!':''}`;
    $('over').hidden=false;$('again').focus();hud();save();
  }
  function drop(id,x,y){
    const p=state.pieces[id];if(!p || p.locked)return;tick();
    M.move(state,id,x-p.x,y-p.y);
    const tolerance=Math.min(Math.min(state.w,state.h)*.24,18/renderer.view.scale);
    const joined=M.settle(state,id,tolerance);contain(state.pieces[id].group);
    dirty=true;hud();invalidate();if(M.complete(state))complete();else if(joined)message('Pieces joined!');save();
  }
  function finish(cancel=false){
    if(!drag)return;
    const d=drag;drag=null;canvas.classList.remove('dragging');
    if(canvas.hasPointerCapture(d.pointer))canvas.releasePointerCapture(d.pointer);
    // Cancellation restores the entire group to its starting offset and does not snap it.
    if(cancel){const p=state.pieces[d.id];M.move(state,d.id,d.origin.x-p.x,d.origin.y-p.y);invalidate();save();}
    else {const p=state.pieces[d.id];drop(d.id,p.x,p.y);}
  }
  canvas.addEventListener('pointerdown',e=>{
    if(!state || drag || paused || !e.isPrimary || e.button!==0 || M.complete(state))return;
    const box=canvas.getBoundingClientRect(),p=renderer.pick(state,e.clientX-box.left,e.clientY-box.top,$('edges').checked);
    if(!p)return;e.preventDefault();tick();started=true;last=performance.now();
    const point=renderer.world(e.clientX-box.left,e.clientY-box.top);
    drag={id:p.id,group:p.group,pointer:e.pointerId,point,origin:{x:p.x,y:p.y}};
    const ids=new Set(M.group(state,p.group).map(q=>q.id));
    renderer.order=[...renderer.order.filter(id=>!ids.has(id)),...renderer.order.filter(id=>ids.has(id))];
    canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');invalidate();
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag || e.pointerId!==drag.pointer)return;e.preventDefault();
    const box=canvas.getBoundingClientRect(),pt=renderer.world(e.clientX-box.left,e.clientY-box.top);
    M.move(state,drag.id,pt.x-drag.point.x,pt.y-drag.point.y);drag.point=pt;dirty=true;invalidate();
  });
  canvas.addEventListener('pointerup',e=>{if(e.pointerId===drag?.pointer)finish();});
  canvas.addEventListener('pointercancel',()=>finish(true));
  canvas.addEventListener('lostpointercapture',()=>{if(drag)finish(true);});
  function pause(on){
    if(!state || M.complete(state))return;finish(true);tick();paused=on;last=performance.now();$('pause').hidden=!on;
    if(on){$('pauseInfo').textContent=`${format(elapsed)} · ${$('placed').textContent} pieces placed`;$('resume').focus();}else canvas.focus();save();
  }
  $('pauseBtn').onclick=()=>pause(true);$('resume').onclick=()=>pause(false);
  $('helpBtn').onclick=()=>{pause(true);$('help').hidden=false;$('closeHelp').focus();};
  $('closeHelp').onclick=()=>{$('help').hidden=true;if(paused)$('resume').focus();};
  $('new').onclick=()=>{if(!started || M.complete(state) || confirm('Start a new puzzle? This replaces the saved puzzle.')){
    volatilePhoto=String($('picture').value).startsWith('photo-') && !read('jigsaw.photo');
    start(isNaN(Number($('picture').value))?$('picture').value:Number($('picture').value),Number($('size').value));
  }};
  $('again').onclick=()=>{$('over').hidden=true;$('picture').focus();message('Choose a picture and size then press New puzzle.');};
  for(const id of ['ghost','edges'])$(id).onchange=()=>{invalidate();save();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){
    if(!$('help').hidden){$('help').hidden=true;return;}pause(!paused);
  }});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){tick(true);finish(true);save();if(S.get('autoPause'))pause(true);}last=performance.now();});
  window.addEventListener('pagehide',()=>{finish(true);save();});
  new ResizeObserver(fit).observe(canvas);
  new MutationObserver(invalidate).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  const hints=()=>{$('hint').hidden=!S.get('showHints');};hints();S.onChange(hints);
  // Decode and downsample locally. No file content ever leaves this browser.
  $('photo').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(file.size>25*1024*1024){message('Please choose an image smaller than 25 MB.');return;}
    if(started && !M.complete(state) && !confirm('Use this photo? This replaces the saved puzzle.'))return;
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();
      let sw=img.width,sh=img.height; if(sw/sh>4)sw=sh*4;if(sw/sh<.25)sh=sw*4;
      const ratio=Math.min(1,1200/Math.max(sw,sh)),c=document.createElement('canvas');
      c.width=Math.round(sw*ratio);c.height=Math.round(sh*ratio);
      c.getContext('2d').drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,c.width,c.height);
      const data=c.toDataURL('image/jpeg',.82);let hash=2166136261;
      for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);
      photo={id:`photo-${(hash>>>0).toString(16)}`,url:data};
      volatilePhoto=data.length>700000 || !write('jigsaw.photo',photo);
      if(volatilePhoto){try{localStorage.removeItem('jigsaw.save');localStorage.removeItem('jigsaw.photo');}catch(_){}}
      [...$('picture').options].filter(o=>o.value.startsWith('photo-')).forEach(o=>o.remove());
      $('picture').add(new Option('Your photo',photo.id));await start(photo.id,Number($('size').value));
      message(volatilePhoto?'Photo is local to this tab; too large to save.':'Photo stays on this device. Puzzle autosaved.');
    }catch(_){message('That image could not be read. Try a JPEG or PNG photo.');}finally{URL.revokeObjectURL(url);}
  };
  // Opt-in integration seam: test harness uses the same move/drop/snap/completion path as pointers.
  if(new URLSearchParams(location.search).has('test'))window.JigsawTest={
    start:(id,n)=>{volatilePhoto=false;return start(id,n);},drop,
    snapshot:()=>JSON.parse(JSON.stringify({state,picture,elapsed,started,paused})),
    draw,save,renderer,move:(id,dx,dy)=>M.move(state,id,dx,dy)
  };
  const raw=read('jigsaw.save'),restored=M.restore(raw);
  if(restored && ((Number.isInteger(raw.picture) && raw.picture>=0 && raw.picture<6) || (typeof raw.picture==='string' && raw.picture===photo?.id)) &&
      Number.isFinite(raw.elapsed) && raw.elapsed>=0 && raw.elapsed<1e9){
    Object.assign(restored,{elapsed:raw.elapsed,started:raw.started,ghost:raw.ghost,edges:raw.edges});start(raw.picture,raw.count,restored);
  }else start(0,24);
  setInterval(()=>{if(state){tick();if(dirty)save();}},1000);
})();
