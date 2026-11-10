/* Original procedural art. No network requests or third-party pictures. */
window.JigsawPictures = (() => {
  const titles = ['Alpine lake', 'Evening coast', 'Colour study', 'Reef friends', 'City lights', 'Flower meadow'];
  function make(id) {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
    const c = canvas.getContext('2d'), rng = JigsawModel.random(1287 + id);
    const rect = (x,y,w,h,color) => { c.fillStyle=color; c.fillRect(x,y,w,h); };
    const disc = (x,y,r,color) => { c.fillStyle=color; c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); };
    const poly = (points,color) => { c.fillStyle=color; c.beginPath(); points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fill(); };
    const sky = c.createLinearGradient(0,0,0,800);
    sky.addColorStop(0,['#318dc9','#3d235e','#f5e8cc','#026585','#09173c','#79c9e5'][id]);
    sky.addColorStop(1,['#cde8b3','#ffad67','#d6bbd1','#55cbb9','#735987','#e8edb1'][id]); c.fillStyle=sky; c.fillRect(0,0,1200,800);
    if (id === 0) {
      disc(950,140,72,'#ffedb4');
      poly([[0,440],[260,150],[500,455],[760,100],[1200,470]],'#6d8a9d');
      poly([[170,250],[260,150],[345,252],[290,230],[260,270],[230,230]],'#e7f2ed');
      poly([[650,240],[760,100],[880,250],[800,213],[760,260],[720,215]],'#fff5e7');
      rect(0,480,1200,320,'#329ca8');
      for(let i=0;i<65;i++) rect(rng()*1200,500+rng()*290,30+rng()*100,2,'#8ed5ca');
      poly([[0,370],[180,510],[340,800],[0,800]],'#205e55');
      for(let i=0;i<18;i++){ const x=20+i*65,y=480+rng()*260; poly([[x,y-95],[x-30,y],[x+30,y]],'#244e47'); }
    } else if (id === 1) {
      disc(760,340,105,'#ffd284'); rect(0,450,1200,350,'#7f607f');
      for(let i=0;i<90;i++) rect(rng()*1200,460+rng()*300,30+rng()*190,2,['#ed9b95','#f2c998','#a382a8'][i%3]);
      poly([[0,700],[400,580],[850,700],[1200,660],[1200,800],[0,800]],'#302945');
      for(let i=0;i<9;i++){let x=80+i*125,y=120+rng()*140; c.strokeStyle='#423553';c.lineWidth=4;c.beginPath();c.moveTo(x-14,y+6);c.quadraticCurveTo(x,y-9,x+14,y+6);c.stroke();}
    } else if (id === 2) {
      for(let i=0;i<90;i++){ const x=rng()*1200,y=rng()*800,r=25+rng()*100,color=['#d94f69','#1b8396','#f0b34c','#68458b','#d7e7c3'][i%5];
        if(i%2) disc(x,y,r,color); else poly([[x,y-r],[x-r,y+r],[x+r,y+r]],color); }
    } else if (id === 3) {
      for(let i=0;i<45;i++) { const x=rng()*1200,y=rng()*800; c.strokeStyle='#9be5df';c.lineWidth=2;c.beginPath();c.arc(x,y,5+rng()*12,0,7);c.stroke(); }
      for(let i=0;i<12;i++){const x=90+rng()*1000,y=120+rng()*520,color=['#f2c656','#ee7c73','#b9b8ed'][i%3];
        poly([[x+35,y],[x+85,y-35],[x+85,y+35]],color); c.fillStyle=color;c.beginPath();c.ellipse(x,y,60,32,0,0,7);c.fill();disc(x-28,y-7,5,'#19384b'); }
      for(let i=0;i<40;i++){let x=i*32;c.strokeStyle=i%2?'#367c6b':'#51a776';c.lineWidth=12;c.beginPath();c.moveTo(x,800);c.bezierCurveTo(x-35,740,x+35,700,x,640-rng()*100);c.stroke();}
    } else if (id === 4) {
      disc(930,140,64,'#f1e2b4'); for(let i=0;i<100;i++) disc(rng()*1200,rng()*430,1+rng()*2,'#d7deef');
      for(let i=0;i<19;i++){const x=i*66,h=120+rng()*410;rect(x,800-h,62,h,i%2?'#202d50':'#2c365b');
        for(let y=820-h;y<780;y+=28) for(let k=0;k<3;k++) if(rng()>.25) rect(x+8+k*18,y,8,12,['#ffc77e','#90c9cf'][i%2]);}
    } else {
      poly([[0,430],[350,330],[720,470],[1200,290],[1200,800],[0,800]],'#5b9968');
      for(let i=0;i<140;i++){let x=rng()*1200,y=440+rng()*360,r=8+(y-440)/28;
        c.strokeStyle='#35674b';c.lineWidth=3;c.beginPath();c.moveTo(x,y+25);c.lineTo(x,y);c.stroke();
        for(let j=0;j<5;j++)disc(x+Math.cos(j*1.256)*r,y+Math.sin(j*1.256)*r,r*.7,['#f1cad9','#ffe8a0','#e09bd0'][i%3]);disc(x,y,r*.45,'#d89b3e');}
    }
    return canvas;
  }
  return { titles, make };
})();
