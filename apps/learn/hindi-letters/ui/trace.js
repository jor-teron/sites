/* Coverage is sampled from the actual device-rendered glyph, not a rectangular hit zone.
 * The numbered arrows are broad practice phases, not a claim of calligraphic stroke order. */
(function () {
  'use strict';
  const H = window.Hindi, SIZE = 320;
  const font = '190px "Noto Sans Devanagari", Mangal, "Kohinoor Devanagari", sans-serif';
  H.createTrace = function (canvas, glyph, onGrade) {
    const ctx = canvas.getContext('2d'), mask = document.createElement('canvas'), ink = document.createElement('canvas');
    canvas.width = canvas.height = mask.width = mask.height = ink.width = ink.height = SIZE;
    const m = mask.getContext('2d', { willReadFrequently:true }), pen = ink.getContext('2d', { willReadFrequently:true });
    m.font = font; m.textAlign = 'center';
    // Use measured ink bounds so accents/signs and the long ई stay inside the canvas.
    let metrics = m.measureText(glyph), scale = Math.min(1, 240 / (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight));
    m.font = font.replace('190px', (190 * scale) + 'px'); metrics = m.measureText(glyph);
    const x = SIZE/2 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight)/2;
    const y = SIZE/2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent)/2;
    m.fillText(glyph, x, y);
    const pixels = m.getImageData(0,0,SIZE,SIZE).data, samples = [];
    let minX = SIZE, maxX = 0, minY = SIZE, maxY = 0;
    for (let yy = 0; yy < SIZE; yy++) for (let xx = 0; xx < SIZE; xx++) {
      if (pixels[(yy*SIZE+xx)*4+3] > 100) { minX=Math.min(minX,xx); maxX=Math.max(maxX,xx); minY=Math.min(minY,yy); maxY=Math.max(maxY,yy); if (xx%3===0 && yy%3===0) samples.push([xx,yy]); }
    }
    // Longest upper horizontal run gives a font-dependent headline. Some glyphs have no full headline.
    let headline = minY, longest = 0;
    for (let yy=minY; yy<minY+(maxY-minY)*.5; yy++) {
      let run=0;
      for (let xx=minX; xx<=maxX; xx++) {
        run = pixels[(yy*SIZE+xx)*4+3]>100 ? run+1 : 0;
        if (run>longest) { longest=run; headline=yy; }
      }
    }
    let active = null, last, phase = 1;
    pen.strokeStyle = '#157d79'; pen.fillStyle='#157d79'; pen.lineWidth=12; pen.lineCap=pen.lineJoin='round';
    function arrow(x1,y1,x2,y2,n) {
      ctx.strokeStyle='#a34b31'; ctx.fillStyle='#a34b31'; ctx.lineWidth=2; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.setLineDash([]);
      const a=Math.atan2(y2-y1,x2-x1); ctx.beginPath(); ctx.moveTo(x2,y2);
      ctx.lineTo(x2-10*Math.cos(a-.45),y2-10*Math.sin(a-.45)); ctx.moveTo(x2,y2);
      ctx.lineTo(x2-10*Math.cos(a+.45),y2-10*Math.sin(a+.45)); ctx.stroke();
      ctx.font='bold 14px system-ui'; ctx.textAlign='center'; ctx.fillText(n,x1,y1-10);
    }
    function paint() {
      ctx.clearRect(0,0,SIZE,SIZE); ctx.fillStyle='#fff9eb'; ctx.fillRect(0,0,SIZE,SIZE);
      ctx.save(); ctx.globalAlpha=.16; ctx.drawImage(mask,0,0); ctx.restore();
      ctx.drawImage(ink,0,0);
      if (phase===1) { arrow(Math.max(18,minX-18),Math.min(maxY-35,headline+30),Math.max(18,minX-18),maxY,'1'); }
      else { arrow(minX,Math.max(24,headline-13),maxX,Math.max(24,headline-13),'2 →'); }
    }
    function near(data,xx,yy,r) {
      for (let dy=-r;dy<=r;dy+=2) for(let dx=-r;dx<=r;dx+=2) {
        const tx=xx+dx,ty=yy+dy;
        if(tx>=0 && ty>=0 && tx<SIZE && ty<SIZE && dx*dx+dy*dy<=r*r && data[(ty*SIZE+tx)*4+3]>80) return true;
      }
      return false;
    }
    function grade() {
      const drawn=pen.getImageData(0,0,SIZE,SIZE).data;
      const covered=samples.filter(([xx,yy])=>near(drawn,xx,yy,7)).length;
      let total=0,inside=0;
      for(let yy=0;yy<SIZE;yy+=4) for(let xx=0;xx<SIZE;xx+=4) if(drawn[(yy*SIZE+xx)*4+3]>80) { total++; if(near(pixels,xx,yy,12)) inside++; }
      const coverage=samples.length ? covered/samples.length : 0, precision=total ? inside/total : 0;
      const result=Object.assign({coverage,precision},H.traceGrade(coverage,precision)); onGrade(result); return result;
    }
    function point(e) { const b=canvas.getBoundingClientRect(); return [(e.clientX-b.left)*SIZE/b.width,(e.clientY-b.top)*SIZE/b.height]; }
    canvas.onpointerdown=e=>{ if(active!==null) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId); active=e.pointerId; last=point(e); pen.beginPath(); pen.arc(...last,6,0,Math.PI*2); pen.fill(); paint(); };
    canvas.onpointermove=e=>{ if(e.pointerId!==active) return; e.preventDefault(); const p=point(e); pen.beginPath(); pen.moveTo(...last); pen.lineTo(...p); pen.stroke(); last=p; paint(); };
    const end=e=>{if(e.pointerId!==active) return; active=null; grade();};
    canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=end;
    paint();
    return { grade, samples, mask, ink, setPhase(n) { phase=n; paint(); }, clear() { active=null; pen.clearRect(0,0,SIZE,SIZE); phase=1; paint(); onGrade({coverage:0,precision:0,stars:0,score:0}); } };
  };
})();
