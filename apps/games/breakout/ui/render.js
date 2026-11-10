/* Original geometry-only artwork. Canvas backing store tracks devicePixelRatio. */
'use strict';
BRK.Renderer = class {
  constructor(canvas, wrap) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.fit();
  }
  fit() {
    const C = BRK.C, box = this.wrap.getBoundingClientRect();
    this.scale = Math.max(.01, Math.min(box.width / C.width, box.height / C.height));
    const width = C.width * this.scale, height = C.height * this.scale;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(Math.max(1, width - 2) * dpr);
    this.canvas.height = Math.round(Math.max(1, height - 2) * dpr);
  }
  point(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    return (clientX - rect.left - 1) * BRK.C.width / (rect.width - 2);
  }
  burst(e) {
    if (!BRK.settings.effects()) return;
    for (let i = 0; i < 9; i++) this.particles.push({ x: e.x, y: e.y,
      vx: (Math.random() - .5) * 180, vy: (Math.random() - .5) * 180,
      life: .45, color: ['#52c4cb', '#ab9dff', '#f4b76a'][e.color - 1] });
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
  }
  update(dt) {
    if (!BRK.settings.effects()) this.particles = [];
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; }
  }
  draw(model) {
    const C = BRK.C, ctx = this.ctx, dark = BRK.settings.dark();
    ctx.setTransform(this.canvas.width / C.width, 0, 0, this.canvas.height / C.height, 0, 0);
    ctx.fillStyle = dark ? '#101b2c' : '#edf5fa'; ctx.fillRect(0, 0, C.width, C.height);
    ctx.strokeStyle = dark ? '#1f3047' : '#dce8f0'; ctx.lineWidth = 1;
    for (let y = 25; y < C.height; y += 30) {
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(C.width - 8, y); ctx.stroke();
    }
    ctx.fillStyle = dark ? '#9daec5' : '#536881'; ctx.font = 'bold 12px system-ui';
    ctx.textAlign = 'left'; ctx.fillText('BREAKOUT / ' + String(model.level).padStart(2, '0'), 18, 28);
    ctx.textAlign = 'right'; ctx.fillText(model.remaining + ' BRICKS', C.width - 18, 28);
    const colors = dark ? ['#52c4cb', '#ab9dff', '#f4b76a'] : ['#138a93', '#7260c7', '#c0781d'];
    for (const b of model.bricks) {
      if (b.hp === 0) continue;
      ctx.fillStyle = b.hp === -1 ? (dark ? '#60718a' : '#8193a9') : colors[b.max - 1];
      ctx.fillRect(b.x, b.y, C.brickWidth, C.brickHeight);
      ctx.fillStyle = '#ffffff55'; ctx.fillRect(b.x + 2, b.y + 2, C.brickWidth - 4, 2);
      if (b.hp === -1) {
        ctx.strokeStyle = '#ffffffaa'; ctx.beginPath();
        ctx.moveTo(b.x + 17, b.y + 6); ctx.lineTo(b.x + 25, b.y + 16);
        ctx.moveTo(b.x + 25, b.y + 6); ctx.lineTo(b.x + 17, b.y + 16); ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffffdd';
        for (let j = 0; j < b.hp; j++) ctx.fillRect(b.x + 17 - (b.hp - 1) * 3 + j * 6, b.y + 11, 3, 3);
      }
    }
    ctx.fillStyle = model.buffs.laser > 0 ? '#db668a' : (dark ? '#e5eefb' : '#294a68');
    ctx.fillRect(model.paddle.x - model.paddleWidth / 2, C.paddleY, model.paddleWidth, C.paddleHeight);
    ctx.fillStyle = '#45b7bf'; ctx.fillRect(model.paddle.x - 3, C.paddleY, 6, C.paddleHeight);
    for (const b of model.balls) {
      ctx.beginPath(); ctx.arc(b.x, b.y, C.radius, 0, Math.PI * 2);
      ctx.fillStyle = model.buffs.slow > 0 ? '#638fe5' : (dark ? '#ffffff' : '#d75b34'); ctx.fill();
    }
    ctx.fillStyle = '#e65080';
    for (const shot of model.shots) ctx.fillRect(shot.x - 2, shot.y, 4, 12);
    const letters = { wide: 'W', multi: 'M', slow: 'S', laser: 'L', life: '+' };
    ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    for (const drop of model.drops) {
      ctx.fillStyle = '#226a82'; ctx.fillRect(drop.x - 13, drop.y - 10, 26, 20);
      ctx.fillStyle = '#fff'; ctx.fillText(letters[drop.type], drop.x, drop.y + 5);
    }
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / .45; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;
    if (model.mode === 'ready') {
      ctx.fillStyle = dark ? '#ecf3ff' : '#213d57'; ctx.font = 'bold 18px system-ui';
      ctx.fillText('Tap Launch or press Space', C.width / 2, 405);
      ctx.font = '13px system-ui'; ctx.fillText('Move the paddle to aim your start', C.width / 2, 430);
    }
  }
};
