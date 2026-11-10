/* DPR bitmaps are generated only on picture/size/viewport changes, never during a drag. */
window.JigsawRenderer = class {
  constructor(canvas) { this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.hit=document.createElement('canvas').getContext('2d'); }
  fit(state, image) {
    const box=this.canvas.getBoundingClientRect(); this.width=box.width; this.height=box.height;
    this.dpr=window.devicePixelRatio || 1; this.canvas.width=Math.round(box.width*this.dpr); this.canvas.height=Math.round(box.height*this.dpr);
    const boardW=Math.min(box.width*.88,box.height*.57*state.aspect), boardH=boardW/state.aspect;
    this.view={ x:(box.width-boardW)/2, y:Math.max(12,box.height*.035), scale:boardW/1000, boardW, boardH };
    this.order=state.pieces.map(p=>p.id);
    this.pad=Math.max(Math.min(state.w,state.h)*.3,5/this.view.scale); this.cache=new Map();
    for(const p of state.pieces) {
      const path=new Path2D(), w=state.w,h=state.h,sz=Math.min(w,h); path.moveTo(0,0);
      [[0,0,w,0],[w,0,w,h],[w,h,0,h],[0,h,0,0]].forEach((e,i) => {
        for(const s of JigsawModel.edgeSegments(...e,p.edges[i],sz)) {
          if(s.kind==='line')path.lineTo(...s.points[0]); else path.bezierCurveTo(...s.points.flat());
        }
      }); path.closePath();
      const bitmap=document.createElement('canvas'), q=this.dpr*this.view.scale, pad=this.pad;
      bitmap.width=Math.ceil((w+pad*2)*q); bitmap.height=Math.ceil((h+pad*2)*q);
      const c=bitmap.getContext('2d'); c.scale(q,q); c.translate(pad,pad);
      // Bake each bevel/shadow once: per-frame canvas blur on 300 pieces is expensive.
      c.shadowColor='rgba(0,0,0,.3)';c.shadowBlur=3*this.dpr;c.shadowOffsetY=2*this.dpr;
      c.fillStyle='#24333b';c.fill(path);c.shadowColor='transparent';c.shadowBlur=c.shadowOffsetY=0;
      c.save(); c.clip(path);
      c.drawImage(image,-p.tx,-p.ty,1000,1000/state.aspect); c.restore();
      c.strokeStyle='rgba(255,255,255,.55)'; c.lineWidth=1.6/q; c.stroke(path);
      c.strokeStyle='rgba(20,35,45,.65)'; c.lineWidth=.7/q; c.stroke(path);
      this.cache.set(p.id,{bitmap,path,width:bitmap.width/q,height:bitmap.height/q});
    }
  }
  world(x,y) { const v=this.view; return {x:(x-v.x)/v.scale,y:(y-v.y)/v.scale}; }
  edgeGroups(state) { return new Set(state.pieces.filter(JigsawModel.isEdge).map(p=>p.group)); }
  pick(state,x,y,edges) {
    const pt=this.world(x,y), shown=this.edgeGroups(state);
    for(let i=state.pieces.length-1;i>=0;i--) {
      const p=state.pieces[this.order[i]];
      if(!p.locked && (!edges || shown.has(p.group)) && this.hit.isPointInPath(this.cache.get(p.id).path,pt.x-p.x,pt.y-p.y)) return p;
    }
    return null;
  }
  draw(state,image,{ghost=false,edges=false,active=-1}={}) {
    const c=this.ctx,v=this.view,d=this.dpr;
    c.setTransform(d,0,0,d,0,0); c.clearRect(0,0,this.width,this.height);
    c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--board'); c.fillRect(v.x,v.y,v.boardW,v.boardH);
    c.save(); c.translate(v.x,v.y); c.scale(v.scale,v.scale);
    if(ghost){ c.globalAlpha=.22;c.drawImage(image,0,0,1000,1000/state.aspect);c.globalAlpha=1; }
    c.strokeStyle='#82949c';c.lineWidth=1/v.scale;c.strokeRect(0,0,1000,1000/state.aspect);
    const shown=this.edgeGroups(state), ordered=this.order.map(id=>state.pieces[id]);
    const list=[...ordered.filter(p=>p.locked),...ordered.filter(p=>!p.locked)];
    for(const p of list) {
      if(edges && !p.locked && !shown.has(p.group))continue;
      const b=this.cache.get(p.id);c.drawImage(b.bitmap,p.x-this.pad,p.y-this.pad,b.width,b.height);
      if(active===p.group && !p.locked){c.save();c.translate(p.x,p.y);c.strokeStyle='#f0c56b';c.lineWidth=1.5/v.scale;c.stroke(b.path);c.restore();}
    }
    c.restore();
    c.font='12px system-ui';c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted');
    c.fillText('LOOSE PIECES · drag to join',Math.max(12,v.x),Math.min(this.height-10,v.y+v.boardH+24));
  }
};
