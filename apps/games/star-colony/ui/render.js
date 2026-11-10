/* DPR-crisp, pan/zoom canvas. Rendering never changes simulation state. */
window.SCRender = (() => {
  const colors = { regolith: '#304551', rock: '#22343f', ice: '#547f98', ore: '#6e5551' };
  const accents = { dome: '#77e6d6', oxygen: '#7edbff', solar: '#edc97c', battery: '#c9a5f4', farm: '#96dca0', drill: '#88c9f0', mine: '#e7a27d', storage: '#aebdc7', corridor: '#6d8794' };
  function draw(canvas, s, camera, selected, mode, clock) {
    const ctx = canvas.getContext('2d'), rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#152732'; ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.translate(rect.width / 2 - camera.x * camera.zoom, rect.height / 2 - camera.y * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    const z = 28, minX = Math.max(0, Math.floor((camera.x - rect.width / camera.zoom / 2) / z)), maxX = Math.min(s.w, Math.ceil((camera.x + rect.width / camera.zoom / 2) / z));
    const minY = Math.max(0, Math.floor((camera.y - rect.height / camera.zoom / 2) / z)), maxY = Math.min(s.h, Math.ceil((camera.y + rect.height / camera.zoom / 2) / z));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const tile = s.terrain[y * s.w + x]; ctx.fillStyle = colors[tile]; ctx.fillRect(x * z, y * z, z - .6, z - .6);
      if (tile !== 'regolith') {
        ctx.fillStyle = tile === 'ice' ? '#a7d9e5' : tile === 'ore' ? '#c28d6c' : '#405663';
        ctx.beginPath(); ctx.moveTo(x * z + 6, y * z + 21); ctx.lineTo(x * z + 12, y * z + 5); ctx.lineTo(x * z + 23, y * z + 20); ctx.fill();
      } else { ctx.fillStyle = '#3d525d'; ctx.fillRect(x * z + (x * 13 + y * 7) % 20 + 3, y * z + (x * 7 + y * 11) % 20 + 3, 1.5, 1.5); }
    }
    for (const b of s.buildings) {
      const x = b.x * z, y = b.y * z;
      ctx.globalAlpha = b.ready ? 1 : .5; ctx.fillStyle = b.health <= 0 ? '#754851' : accents[b.type] || '#c4b0e1';
      if (b.type === 'dome') {
        ctx.beginPath(); ctx.arc(x + 14, y + 15, 11, Math.PI, 0); ctx.lineTo(x + 25, y + 24); ctx.lineTo(x + 3, y + 24); ctx.fill();
        ctx.fillStyle = '#245467'; ctx.fillRect(x + 7, y + 14, 14, 6);
      } else if (b.type === 'solar') {
        ctx.fillRect(x + 12, y + 8, 4, 18); ctx.fillStyle = '#648dbe'; ctx.fillRect(x + 2, y + 3, 24, 15);
        ctx.strokeStyle = '#b1dcf0'; ctx.lineWidth = .7; ctx.strokeRect(x + 2, y + 3, 24, 15); ctx.beginPath(); ctx.moveTo(x + 14, y + 3); ctx.lineTo(x + 14, y + 18); ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + 26, y + 10); ctx.stroke();
      } else if (b.type === 'corridor') ctx.fillRect(x + 6, y + 6, 16, 16);
      else { ctx.fillRect(x + 3, y + 4, 22, 21); ctx.fillStyle = '#263f4e'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(SCData.buildings[b.type].glyph, x + 14, y + 20); }
      ctx.globalAlpha = 1;
      if (!b.ready) { ctx.strokeStyle = '#e4eaf2'; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 1, y + 1, 26, 26); ctx.setLineDash([]); }
      if (selected?.id === b.id) { ctx.strokeStyle = '#fff1a7'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 28, 28); }
    }
    for (const c of s.colonists) {
      ctx.fillStyle = c.health < 35 ? '#ff8b8b' : '#f5eee2'; ctx.beginPath(); ctx.arc(c.x * z + 14, c.y * z + 14, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3f718c'; ctx.fillRect(c.x * z + 12, c.y * z + 12, 5, 2);
    }
    if (mode) { ctx.fillStyle = '#ffffde'; ctx.font = '12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('Tap an empty tile to plan ' + SCData.buildings[mode].name, minX * z + 8, minY * z + 18); }
    if (window.SCFx) window.SCFx.draw(ctx, s, clock, selected);
  }
  return { draw };
})();
