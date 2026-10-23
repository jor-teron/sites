/** Parrot — a bright jungle bird with a hooked beak and long tail feathers. */
DR.registerObstacle({
  id: 'parrot',
  kind: 'air',
  draw(ctx, o) {
    const s = Math.sin(o.flap), up = s > 0, x = o.x, y = o.y;
    ctx.save();
    ctx.translate(x, y + (up ? 0 : 1));
    ctx.fillStyle = '#2563eb'; DRX.poly(ctx, [14, 15, 2, 20, -4, 27, 6, 23, 14, 21]); ctx.fill();           // tail feathers
    ctx.fillStyle = '#facc15'; DRX.poly(ctx, [12, 17, 0, 18, -3, 23, 12, 21]); ctx.fill();
    ctx.fillStyle = '#ef4444'; DRX.ell(ctx, 22, 16, 13, 7.5, -0.1); ctx.fill();                              // body
    ctx.fillStyle = '#fca5a5'; DRX.ell(ctx, 24, 19, 8, 3.2); ctx.fill();
    ctx.fillStyle = up ? '#16a34a' : '#22c55e';                                                               // wing
    ctx.beginPath(); ctx.moveTo(14, 14);
    if (up) { ctx.quadraticCurveTo(18, -4, 30, -2); ctx.quadraticCurveTo(26, 8, 28, 15); }
    else { ctx.quadraticCurveTo(18, 30, 30, 28); ctx.quadraticCurveTo(26, 22, 28, 16); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(24, up ? 3 : 25); ctx.lineTo(30, up ? -1 : 28); ctx.lineTo(28, up ? 8 : 20); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(34, 11, 7, 0, DRX.PI2); ctx.fill();                  // head
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(36, 10, 2.6, 0, DRX.PI2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(36.6, 10, 1.2, 0, DRX.PI2); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(39, 7); ctx.quadraticCurveTo(46, 9, 41, 16); ctx.lineTo(39, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
});
