/* Canvas-only original shapes. World cells are 100 units; lawn includes a slim mower verge. */
(function (G) {
  'use strict';
  const W = 932, H = 540, X = 22, Y = 28, T = 100;
  const circle = (c,x,y,r,color) => { c.fillStyle=color; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); };
  const box = (c,x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
  function plant(c,kind,x,y,size=1) {
    c.save(); c.translate(x,y); c.scale(size,size);
    const d = G.PLANTS[kind];
    box(c,-4,0,8,28,'#2b743e');
    c.fillStyle='#31864d'; c.beginPath(); c.ellipse(-13,21,19,7,-.3,0,7); c.ellipse(13,25,18,7,.3,0,7); c.fill();
    if (kind === 'sun') {
      for(let i=0;i<10;i++) circle(c,Math.cos(i*Math.PI/5)*22,Math.sin(i*Math.PI/5)*22-8,11,d.color);
      circle(c,0,-8,19,'#714626'); circle(c,-6,-11,2,'#fff1bf'); circle(c,6,-11,2,'#fff1bf');
    } else if (kind === 'wall') {
      c.fillStyle=d.color; c.beginPath(); c.roundRect(-29,-38,58,69,16); c.fill();
      box(c,-20,-25,5,35,'#946342'); box(c,14,-17,4,39,'#946342');
      circle(c,-9,-6,3,'#332c28'); circle(c,9,-6,3,'#332c28'); box(c,-6,8,12,3,'#654a34');
    } else if (kind === 'bomb') {
      circle(c,-13,0,20,d.color); circle(c,15,7,19,'#d94e7b'); box(c,-3,-30,5,22,'#275d31');
      c.strokeStyle='#725333'; c.lineWidth=4; c.beginPath(); c.moveTo(6,-29); c.lineTo(21,-43); c.stroke(); circle(c,22,-44,5,'#ffe578');
    } else {
      circle(c,-5,-13,25,d.color); box(c,7,-24,29,21,d.color); circle(c,37,-13,11,d.color); circle(c,39,-13,6,'#245f4f');
      circle(c,-13,-20,4,'#183e35'); if(kind === 'frost') { box(c,-20,-42,4,14,'#e5faff'); box(c,-30,-35,23,4,'#e5faff'); }
    }
    c.restore();
  }
  G.drawSeed = function (canvas,kind) {
    canvas.width = canvas.height = 80; const c=canvas.getContext('2d'); plant(c,kind,40,45,.85);
  };
  G.Renderer = class {
    constructor(canvas,wrap) { this.canvas=canvas; this.wrap=wrap; this.c=canvas.getContext('2d'); this.resize(); }
    resize() {
      const r=this.wrap.getBoundingClientRect(), scale=Math.min(r.width/W,r.height/H,1.3);
      this.width=Math.max(1,W*scale); this.height=Math.max(1,H*scale); this.scale=scale;
      const dpr=Math.min(devicePixelRatio || 1,G.setting('lowGraphics') ? 1 : 3);
      this.canvas.style.width=this.width+'px'; this.canvas.style.height=this.height+'px';
      this.canvas.width=Math.round(this.width*dpr); this.canvas.height=Math.round(this.height*dpr);
    }
    point(event) {
      const r=this.canvas.getBoundingClientRect();
      return {x:((event.clientX-r.left)/r.width*W-X)/T,y:((event.clientY-r.top)/r.height*H-Y)/T};
    }
    draw(g,selected,preview) {
      const c=this.c, dark=document.documentElement.dataset.theme==='dark';
      c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0); box(c,0,0,W,H,dark?'#284a3a':'#b2d69a');
      c.font='bold 13px system-ui'; c.fillStyle=dark?'#d2e7c5':'#294e36'; c.fillText('GARDEN GUARD',35,19);
      c.font='12px system-ui'; c.textAlign='right'; c.fillText(G.LEVELS[g.level].name,W-14,19); c.textAlign='left';
      for(let row=0;row<5;row++) for(let col=0;col<9;col++) {
        box(c,X+col*T,Y+row*T,T-1,T-1, dark ? ((row+col)%2?'#355e42':'#3b6849') : ((row+col)%2?'#8cbb6a':'#99c878'));
        if (!G.setting('lowGraphics')) { box(c,X+col*T+12,Y+row*T+76,2,5,'#5d985c'); box(c,X+col*T+63,Y+row*T+21,2,5,'#5d985c'); }
      }
      if(selected && preview && preview.row>=0 && preview.row<5 && preview.col>=0 && preview.col<9) {
        const valid=g.canPlant(selected,preview.row,preview.col);
        box(c,X+preview.col*T,Y+preview.row*T,T-1,T-1,valid?'#d8f5a080':'#ea5a6270');
        c.globalAlpha=.45; plant(c,selected,X+(preview.col+.5)*T,Y+(preview.row+.5)*T); c.globalAlpha=1;
      }
      for(const p of g.plants) {
        const x=X+(p.col+.5)*T,y=Y+(p.row+.5)*T; plant(c,p.kind,x,y);
        if(p.hp<G.PLANTS[p.kind].hp) { box(c,x-27,y+38,54,4,'#544b3b'); box(c,x-27,y+38,54*p.hp/G.PLANTS[p.kind].hp,4,'#ffe88c'); }
      }
      for(const e of g.enemies) {
        const x=X+e.x*T,y=Y+(e.row+.5)*T, d=G.INVADERS[e.kind]; c.save(); c.translate(x,y);
        const color=e.slow>0?'#83d9ed':d.color;
        box(c,-15,19,10,20,'#4b4f4a'); box(c,6,19,10,20,'#4b4f4a'); box(c,-19,-10,40,36,e.slow>0?'#3f8198':'#706858');
        box(c,-32,-2,16,9,color); circle(c,0,-25,22,color); circle(c,-8,-28,3,'#182b2b'); box(c,-15,-16,16,3,'#45504b');
        if(e.kind==='cone') { c.fillStyle='#b48b53'; c.beginPath(); c.moveTo(-25,-37); c.lineTo(-6,-66); c.lineTo(26,-37); c.fill(); box(c,-25,-40,51,7,'#725d43'); }
        if(e.kind==='bucket') { box(c,-24,-55,49,22,'#7c91a0'); box(c,-30,-37,60,7,'#d1dbe0'); box(c,-18,-51,37,4,'#b5c6cc'); }
        box(c,-24,44,48,4,'#314b36'); box(c,-24,44,48*Math.max(0,e.hp)/d.hp,4,'#e9c17c'); c.restore();
      }
      for(const b of g.shots) circle(c,X+b.x*T,Y+(b.row+.5)*T,8,b.slow?'#a7f2ff':'#d5f49a');
      g.mowers.forEach((m,row)=>{
        if(m.used && !m.active) return; const x=X+m.x*T,y=Y+(row+.5)*T;
        box(c,x-9,y-20,39,31,'#e6bb45'); box(c,x+3,y-32,5,17,'#554f42'); circle(c,x-2,y+15,9,'#294137'); circle(c,x+24,y+15,9,'#294137');
      });
      for(const f of g.effects) { c.globalAlpha=f.life/.45; circle(c,X+f.x*T,Y+f.y*T,135,'#ffd876'); c.globalAlpha=1; }
      for(const s of g.suns) {
        const x=X+s.x*T,y=Y+s.y*T,r=Math.max(23,20/this.scale);
        circle(c,x,y,r,'#fff2a2'); circle(c,x,y,r*.76,'#efb93b'); c.fillStyle='#61450f'; c.font='bold '+Math.round(r*.65)+'px system-ui'; c.textAlign='center'; c.fillText('+25',x,y+r*.22); c.textAlign='left';
      }
    }
  };
})(window.GardenGuard);
