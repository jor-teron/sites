/* SI-T1: visual-only renderer. No simulation state, random calls or collision shapes.
 * Sprites, glows and static backgrounds are cached; effects are bounded to 96.
 * UFOs and bunkers are scenery (the original game has no UFO/bunker mechanics).
 */
window.SpaceInvaderThemes = (() => {
  'use strict';
  const mono = '"Courier New", monospace', sans = 'system-ui, sans-serif';
  const definitions = [
    ['classic', 'Classic Arcade', '#000000', '#ffffff', '#ffffff', '#ffffff', '#5eff76', '#092d13', mono, 'pixel'],
    ['retro', 'Retro Colour', '#090a15', '#83edff', '#fff29c', '#ff6e82', '#79ef9f', '#172542', mono, 'pixel'],
    ['gameboy', 'Game Boy', '#9bbc0f', '#0f380f', '#306230', '#0f380f', '#0f380f', '#8bac0f', mono, 'pixel'],
    ['amber', 'Amber CRT', '#160c03', '#ffbd59', '#ffbd59', '#ffbd59', '#ffbd59', '#37200a', mono, 'pixel'],
    ['neon', 'Neon Synthwave', '#180e32', '#54eeff', '#ff5bce', '#ffe38a', '#54eeff', '#35215d', sans, 'neon'],
    ['space', 'Deep Space', '#080e24', '#83b8ff', '#c5b0ff', '#ffbd9a', '#a3ffdf', '#16213e', sans, 'vector'],
    ['flat', 'Minimal Flat', '#f3f5fc', '#6778ce', '#a56794', '#c0784e', '#34796f', '#dde3f0', sans, 'flat'],
    ['cyber', 'Cyber Glitch', '#080d16', '#22ffbb', '#53d3ff', '#fd78c9', '#d1ff52', '#152b38', mono, 'pixel'],
    ['paper', 'Paper Sketch', '#faf6e9', '#3e4b59', '#3e4b59', '#3e4b59', '#3e4b59', '#e0dece', '"Comic Sans MS", cursive', 'sketch'],
    ['ocean', 'Ocean Abyss', '#031d38', '#6cdff1', '#baacf8', '#ffb3d2', '#f4d578', '#124963', sans, 'ocean']
  ];
  const themes = definitions.map(([id, name, bg, low, mid, top, player, muted, font, style]) => ({
    id, name, bg, colors: [low, mid, top], player, muted, font, style,
    ink: id === 'gameboy' ? '#0f380f' : id === 'paper' ? '#3e4b59' : id === 'flat' ? '#394268' : low,
    glow: ['neon', 'amber'].includes(id), cache: new Map()
  }));
  const get = id => themes.find(t => t.id === id) || themes[0];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let particles = [], glitchUntil = 0;
  const surface = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function ellipse(c, x, y, rx, ry, fill = true) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fill ? c.fill() : c.stroke();
  }
  function line(c, points) {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
  }
  const masks = [
    ['001100001100','000111111000','001111111100','011011110110','111111111111','101111111101','101000000101','000110011000'],
    ['000110000110','001111001111','011111111111','110011110011','111111111111','001110011100','011001100110','110000000011'],
    ['000011110000','001111111100','011111111110','111001100111','111111111111','000110011000','001001100100','010100001010']
  ];
  function pixel(c, type, frame, ink, bg) {
    const rows = type === 'ufo' ? ['000111111000','011111111110','111111111111','110110110111','001001001000'] :
      type === 'player' ? ['000001100000','000001100000','000111111000','011111111110','111111111111','111111111111'] : masks[type];
    const h = rows.length, sx = 28 / 12, sy = 20 / h;
    c.fillStyle = ink;
    rows.forEach((r, y) => [...r].forEach((v, x) => {
      const shift = frame && y >= h - 2 && typeof type === 'number' ? (x < 6 ? 1 : -1) : 0;
      if (v === '1') c.fillRect((x + shift) * sx, y * sy, sx + .05, sy + .05);
    }));
    if (type === 'ufo') { c.fillStyle = bg; for (let x = 7; x < 25; x += 6) c.fillRect(x, 10 + frame, 2, 3); }
  }
  function vector(c, t, type, frame, ink) {
    c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 1.2;
    if (type === 'player') {
      if (t.style === 'ocean') {
        ellipse(c, 14, 12, 13, 7); c.fillRect(12, 1, 3, 7); c.fillRect(12, 1, 8, 2);
        c.fillStyle = t.bg; for (const x of [7, 14, 21]) ellipse(c, x, 12, 2, 2);
      } else {
        c.beginPath(); c.moveTo(14, 0); c.lineTo(28, 20); c.lineTo(14, 15); c.lineTo(0, 20); c.closePath(); c.fill();
        c.fillStyle = t.bg; c.fillRect(12, 7, 4, 7);
      }
    } else if (type === 'ufo') {
      ellipse(c, 14, 7, 7, 6); ellipse(c, 14, 12, 14, 5);
      c.fillStyle = t.bg; for (let x = 6; x < 27; x += 8) ellipse(c, x, 13 + frame, 1.5, 1.5);
    } else if (t.style === 'ocean') {
      c.beginPath(); c.ellipse(14, 9, 12 - type * 2, 8, 0, Math.PI, Math.PI * 2); c.lineTo(26 - type * 2, 11); c.lineTo(2 + type * 2, 11); c.fill();
      for (let i = 0; i < 5; i++) line(c, [[6 + i * 4, 10], [5 + i * 4 + frame * 2, 15], [7 + i * 4 - frame * 2, 20]]);
      c.fillStyle = t.bg; ellipse(c, 10, 7, 1.3, 1.8); ellipse(c, 18, 7, 1.3, 1.8);
    } else {
      if (type === 2) {
        c.beginPath(); c.moveTo(14, 0); c.lineTo(27, 10); c.lineTo(14, 20); c.lineTo(1, 10); c.closePath(); c.fill();
      } else { ellipse(c, 14, 9, 13, type === 1 ? 8 : 6); }
      for (const x of [5, 23]) line(c, [[x, 12], [x + (frame ? -2 : 2), 19]]);
      c.fillStyle = t.bg; ellipse(c, 9, 8, 2, 2); ellipse(c, 19, 8, 2, 2);
    }
    if (t.style === 'vector') {
      const g = c.createLinearGradient(0, 0, 0, 20); g.addColorStop(0, '#ffffffa0'); g.addColorStop(.5, '#ffffff00'); g.addColorStop(1, '#00000060');
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(0, 0, 28, 20); c.globalCompositeOperation = 'source-over';
    }
  }
  function sprite(t, type, frame) {
    const key = `${type}:${frame}`;
    if (t.cache.has(key)) return t.cache.get(key);
    const image = surface(88, 72), c = image.getContext('2d'); c.scale(2, 2); c.translate(8, 8);
    const ink = typeof type === 'number' ? t.colors[type] : t.player;
    if (t.glow) { c.shadowColor = ink; c.shadowBlur = 5; }
    if (t.style === 'pixel') pixel(c, type, frame, ink, t.bg);
    else if (t.style === 'sketch') {
      // Trace the silhouette, with a second offset pencil pass. Never random.
      const temp = surface(28, 20), p = temp.getContext('2d'); pixel(p, type, frame, ink, t.bg);
      const data = p.getImageData(0, 0, 28, 20).data; c.strokeStyle = ink; c.lineWidth = .65;
      for (let y = 0; y < 20; y++) for (let x = 0; x < 28; x++) if (data[(y * 28 + x) * 4 + 3]) {
        if (x % 3 === 0) line(c, [[x + .3, y], [x + 1.4, y + 1.2]]);
        if (!y || !x || x === 27 || y === 19 || !data[((y - 1) * 28 + x) * 4 + 3] || !data[(y * 28 + x - 1) * 4 + 3]) c.strokeRect(x + .15, y + .1, 1.1, 1.1);
      }
    } else vector(c, t, type, frame, ink);
    t.cache.set(key, image); return image;
  }
  function actor(c, t, type, frame, x, y, w, h) {
    c.drawImage(sprite(t, type, frame), x - w * 8 / 28, y - h * 8 / 20, w * 44 / 28, h * 36 / 20);
  }
  function backdrop(t, W, H) {
    const key = `bg:${W}:${H}`; if (t.cache.has(key)) return t.cache.get(key);
    const image = surface(W, H), c = image.getContext('2d'); c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
    if (t.id === 'space' || t.id === 'ocean') {
      const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, t.id === 'space' ? '#252452' : '#125477'); g.addColorStop(1, t.bg); c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (t.id === 'space') for (let i = 0; i < 3; i++) {
        const g = c.createRadialGradient(80 + i * 150, 250 + i * 100, 0, 80 + i * 150, 250 + i * 100, 210);
        g.addColorStop(0, ['#933c8d48', '#2270a944', '#634eac44'][i]); g.addColorStop(1, '#00000000'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      } else {
        c.fillStyle = '#83e8ff0b'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(60 + i * 95, 0); c.lineTo(i * 70 - 40, H); c.lineTo(i * 90 + 100, H); c.closePath(); c.fill(); }
      }
    }
    if (t.id === 'neon') {
      const g = c.createLinearGradient(0, 200, 0, 360); g.addColorStop(0, '#ffc46c'); g.addColorStop(1, '#fa4398'); c.fillStyle = g; ellipse(c, W / 2, 290, 85, 85);
      c.fillStyle = t.bg; for (let y = 295; y < 375; y += 12) c.fillRect(0, y, W, 4 + (y - 295) / 12);
      c.strokeStyle = '#a43a9e'; c.lineWidth = .6;
      for (let x = -W; x <= W * 2; x += 60) line(c, [[W / 2, 390], [x, H]]);
      for (let y = 390; y < H; y += (y - 380) * .24) line(c, [[0, y], [W, y]]);
    }
    if (t.id === 'retro') {
      c.fillStyle = '#ff6e820a'; c.fillRect(0, 55, W, 50); c.fillStyle = '#fff29c0a'; c.fillRect(0, 105, W, 70); c.fillStyle = '#83edff0a'; c.fillRect(0, 175, W, 70);
    }
    if (t.id === 'paper') {
      c.strokeStyle = '#b6cadd'; c.lineWidth = .65; for (let y = 18; y < H; y += 22) line(c, [[0, y], [W, y]]);
      c.strokeStyle = '#d49f9f'; line(c, [[34, 0], [34, H]]);
    }
    if (t.id === 'flat') {
      c.strokeStyle = '#dce1f1'; for (let x = 24; x < W; x += 24) for (let y = 24; y < H; y += 24) { c.beginPath(); c.arc(x, y, .65, 0, 7); c.stroke(); }
      c.fillStyle = '#e8ecf8'; ellipse(c, W, H, 230, 160);
    }
    if (t.id === 'amber') {
      const g = c.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, H * .65); g.addColorStop(0, '#00000000'); g.addColorStop(1, '#000000b0'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // Ground and tiny distant shelters sit OUTSIDE the playable area.
    c.strokeStyle = t.muted; line(c, [[8, H - 28], [W - 8, H - 28]]);
    for (let x = 72; x < W; x += 105) {
      c.fillStyle = t.muted; c.beginPath(); c.moveTo(x - 13, H - 4); c.lineTo(x - 13, H - 14); c.lineTo(x - 8, H - 19); c.lineTo(x + 8, H - 19); c.lineTo(x + 13, H - 14); c.lineTo(x + 13, H - 4); c.fill();
      c.fillStyle = t.bg; c.fillRect(x - 3, H - 10, 6, 6);
    }
    t.cache.set(key, image); return image;
  }
  function background(c, t, W, H, time) {
    c.drawImage(backdrop(t, W, H), 0, 0);
    if (['space', 'ocean', 'cyber'].includes(t.id)) {
      c.fillStyle = t.colors[0]; c.strokeStyle = t.colors[0];
      for (let i = 0; i < 38; i++) {
        const x = (i * 137.5) % W, speed = .003 + (i % 3) * .007;
        const y = ((i * 83.1 + (motion.matches ? 0 : time * speed)) % H);
        c.globalAlpha = .14 + (i % 3) * .12;
        if (t.id === 'ocean') ellipse(c, x, H - y, 1 + i % 4, 1 + i % 4, false);
        else c.fillRect(x, y, i % 3 ? 1 : 2, i % 3 ? 1 : 2);
      }
      c.globalAlpha = 1;
    }
    const frame = motion.matches ? 0 : Math.floor(time / 650) % 2;
    actor(c, t, 'ufo', frame, motion.matches ? 218 : 30 + ((time * .025) % (W - 90)), 30, 34, 14);
  }
  function bullet(c, t, b, enemy) {
    c.fillStyle = enemy ? t.colors[2] : t.player; c.strokeStyle = c.fillStyle;
    if (t.id === 'ocean') ellipse(c, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, false);
    else if (t.id === 'paper') { c.lineWidth = 1; line(c, [[b.x, b.y + b.h], [b.x + b.w, b.y], [b.x + 1, b.y + 3]]); }
    else { c.fillRect(b.x, b.y, b.w, b.h); }
  }
  function burst(x, y, type = 0) {
    const now = performance.now(); glitchUntil = now + 140;
    const n = motion.matches ? 3 : 12;
    for (let i = 0; i < n; i++) particles.push({ x, y, type, start: now, angle: i * Math.PI * 2 / n, speed: 18 + i % 4 * 12 });
    particles = particles.slice(-96);
  }
  function effects(c, t, W, H, now) {
    particles = particles.filter(p => now - p.start < (motion.matches ? 170 : 480));
    for (const p of particles) {
      const age = (now - p.start) / 480, r = motion.matches ? 0 : age * p.speed;
      c.globalAlpha = (1 - age) * (t.id === 'paper' ? .18 : .8); c.fillStyle = t.colors[p.type]; c.strokeStyle = c.fillStyle;
      const x = p.x + Math.cos(p.angle) * r, y = p.y + Math.sin(p.angle) * r;
      if (['space', 'ocean', 'paper', 'flat'].includes(t.id)) ellipse(c, x, y, t.id === 'paper' ? 9 : 2, t.id === 'paper' ? 5 : 2, t.id !== 'ocean');
      else c.fillRect(x, y, 3, 3);
    }
    c.globalAlpha = 1;
    if (t.id === 'amber') { c.fillStyle = '#00000024'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); }
    if (t.id === 'cyber' && now < glitchUntil && !motion.matches) {
      // Hit-only localized RGB split; no full-screen flash, no shaking, no random flicker.
      c.globalAlpha = .35;
      for (const p of particles.filter((_, i) => i % 12 === 0)) {
        for (const [color, offset] of [['#ff4e9b', -2], ['#39e8ff', 2]]) {
          const key = `split:${p.type}:${color}`;
          if (!t.cache.has(key)) {
            const image = surface(88, 72), g = image.getContext('2d');
            g.drawImage(sprite(t, p.type, 0), 0, 0); g.globalCompositeOperation = 'source-in';
            g.fillStyle = color; g.fillRect(0, 0, 88, 72); t.cache.set(key, image);
          }
          c.drawImage(t.cache.get(key), p.x - 22 + offset, p.y - 18, 44, 36);
        }
        c.fillStyle = '#ff4e9b'; c.fillRect(p.x - 16, p.y - 6, 24, 2);
        c.fillStyle = '#39e8ff'; c.fillRect(p.x - 10, p.y + 5, 28, 2);
      }
      c.globalAlpha = 1;
    }
  }
  function preview(c, t, time) {
    const W = 240, H = 120; c.save(); c.clearRect(0, 0, W, H);
    c.drawImage(backdrop(t, 480, 640), 0, 0, W, H);
    const frame = motion.matches ? 0 : Math.floor(time / 650) % 2;
    [2, 1, 0].forEach((type, i) => actor(c, t, type, frame, 44 + i * 60, 36, 28, 20));
    actor(c, t, 'ufo', frame, 190, 8, 23, 10); actor(c, t, 'player', 0, 106, 88, 28, 16);
    bullet(c, t, { x: 118, y: 68, w: 3, h: 10 }, false); c.restore();
  }
  return { themes, get, motion, actor, background, bullet, burst, effects, preview };
})();
