/*
 * Desert Road — sprites drawn in code and pre-rendered to offscreen canvases.
 * Car: top-down, nose up, sized exactly CFG.car.width x height (the collision box).
 * Obstacles: drawn inside each type's w x h box (their collision box).
 * Sprites are cached per (key, scale) so drawing a frame is just drawImage.
 */
(() => {
  const DR = window.DR, CFG = DR.CFG;
  const PAD = 10;                         // px around a sprite for shadows / glow
  const cache = new Map();

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** Build (or fetch) a sprite: paint(g, w, h) draws into a w x h box at origin (0,0). */
  function sprite(key, w, h, scale, paint) {
    const k = key + '@' + scale;
    let s = cache.get(k);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.ceil((w + PAD * 2) * scale);
    c.height = Math.ceil((h + PAD * 2) * scale);
    const g = c.getContext('2d');
    g.scale(scale, scale);
    g.translate(PAD, PAD);
    paint(g, w, h);
    s = { canvas: c, w: w + PAD * 2, h: h + PAD * 2, pad: PAD };
    cache.set(k, s);
    return s;
  }

  // ----- Player car -----
  function paintCar(g, w, h, col) {
    // tyres (peek out past the body)
    g.fillStyle = '#151515';
    for (const ty of [h * 0.17, h * 0.70]) {
      rr(g, -2, ty, 6, h * 0.17, 2); g.fill();
      rr(g, w - 4, ty, 6, h * 0.17, 2); g.fill();
    }
    g.fillStyle = '#555';
    for (const ty of [h * 0.17, h * 0.70]) {
      g.fillRect(-1, ty + h * 0.06, 2, h * 0.05);
      g.fillRect(w - 1, ty + h * 0.06, 2, h * 0.05);
    }

    // body: metallic side-to-side gradient
    const body = g.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, col.dark);
    body.addColorStop(0.18, col.base);
    body.addColorStop(0.42, col.light);
    body.addColorStop(0.58, col.base);
    body.addColorStop(0.85, col.base);
    body.addColorStop(1, col.dark);
    g.beginPath();
    g.moveTo(w * 0.22, 0);
    g.quadraticCurveTo(w * 0.5, -1.5, w * 0.78, 0);
    g.quadraticCurveTo(w, h * 0.03, w, h * 0.16);
    g.lineTo(w, h * 0.88);
    g.quadraticCurveTo(w, h, w * 0.8, h);
    g.lineTo(w * 0.2, h);
    g.quadraticCurveTo(0, h, 0, h * 0.88);
    g.lineTo(0, h * 0.16);
    g.quadraticCurveTo(0, h * 0.03, w * 0.22, 0);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    // front-to-back shade over the body
    const len = g.createLinearGradient(0, 0, 0, h);
    len.addColorStop(0, 'rgba(255,255,255,0.18)');
    len.addColorStop(0.5, 'rgba(255,255,255,0)');
    len.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = len;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1;
    g.stroke();

    // hood creases and highlight
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.05); g.lineTo(w * 0.27, h * 0.26);
    g.moveTo(w * 0.7, h * 0.05); g.lineTo(w * 0.73, h * 0.26);
    g.stroke();
    const hood = g.createRadialGradient(w * 0.45, h * 0.12, 1, w * 0.45, h * 0.12, w * 0.4);
    hood.addColorStop(0, 'rgba(255,255,255,0.55)');
    hood.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hood;
    g.fillRect(w * 0.1, 0, w * 0.8, h * 0.3);

    // windshield: tinted glass with a sky reflection
    const glass = (x0, y0, x1, y1) => {
      const gg = g.createLinearGradient(x0, y0, x1, y1);
      gg.addColorStop(0, '#9fd6ff');
      gg.addColorStop(0.35, '#3a6f9c');
      gg.addColorStop(1, '#0f2233');
      return gg;
    };
    g.beginPath();
    g.moveTo(w * 0.17, h * 0.36);
    g.quadraticCurveTo(w * 0.5, h * 0.26, w * 0.83, h * 0.36);
    g.lineTo(w * 0.76, h * 0.47);
    g.lineTo(w * 0.24, h * 0.47);
    g.closePath();
    g.fillStyle = glass(0, h * 0.28, 0, h * 0.47);
    g.fill();
    // reflection streak
    g.save(); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.moveTo(w * 0.3, h * 0.28); g.lineTo(w * 0.42, h * 0.28);
    g.lineTo(w * 0.3, h * 0.48); g.lineTo(w * 0.2, h * 0.48);
    g.closePath(); g.fill();
    g.restore();

    // roof with highlight
    const roof = g.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
    roof.addColorStop(0, col.dark);
    roof.addColorStop(0.35, col.light);
    roof.addColorStop(1, col.base);
    rr(g, w * 0.24, h * 0.47, w * 0.52, h * 0.24, 4);
    g.fillStyle = roof; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    rr(g, w * 0.3, h * 0.5, w * 0.14, h * 0.18, 3); g.fill();

    // side windows
    g.fillStyle = glass(0, h * 0.45, w, h * 0.7);
    g.beginPath();
    g.moveTo(w * 0.15, h * 0.38); g.lineTo(w * 0.22, h * 0.47); g.lineTo(w * 0.22, h * 0.7); g.lineTo(w * 0.15, h * 0.74);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(w * 0.85, h * 0.38); g.lineTo(w * 0.78, h * 0.47); g.lineTo(w * 0.78, h * 0.7); g.lineTo(w * 0.85, h * 0.74);
    g.closePath(); g.fill();

    // rear window
    g.beginPath();
    g.moveTo(w * 0.24, h * 0.72); g.lineTo(w * 0.76, h * 0.72);
    g.lineTo(w * 0.8, h * 0.82); g.quadraticCurveTo(w * 0.5, h * 0.86, w * 0.2, h * 0.82);
    g.closePath();
    g.fillStyle = glass(0, h * 0.86, 0, h * 0.72); g.fill();

    // side mirrors
    g.fillStyle = col.dark;
    rr(g, -4, h * 0.36, 6, 4, 2); g.fill();
    rr(g, w - 2, h * 0.36, 6, 4, 2); g.fill();

    // headlights (unlit lenses; glow is drawn live)
    g.fillStyle = '#fffbe6';
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    for (const x of [w * 0.1, w * 0.7]) {
      rr(g, x, h * 0.025, w * 0.2, 3.5, 1.5); g.fill(); g.stroke();
    }
    // tail lights (dim lenses)
    g.fillStyle = '#7a0d0d';
    for (const x of [w * 0.08, w * 0.72]) { rr(g, x, h * 0.955, w * 0.2, 3, 1.2); g.fill(); }
    // grille / bumper hints
    g.fillStyle = 'rgba(0,0,0,0.35)';
    rr(g, w * 0.36, h * 0.01, w * 0.28, 2, 1); g.fill();
  }

  DR.sprites = {
    PAD,
    car(colorId, scale) {
      const col = CFG.carColors.find(c => c.id === colorId) || CFG.carColors[0];
      return sprite('car:' + col.id, CFG.car.width, CFG.car.height, scale, (g, w, h) => paintCar(g, w, h, col));
    },
    obstacle(type, scale) {
      const paint = OBSTACLES[type.kind];
      return sprite('ob:' + (type.kind || type.emoji) + ':' + type.w + 'x' + type.h, type.w, type.h, scale,
        (g, w, h) => {
          // soft ground shadow under every obstacle
          g.save();
          g.filter = 'blur(2px)';
          g.fillStyle = 'rgba(60,30,5,0.35)';
          g.beginPath();
          g.ellipse(w / 2 + 3, h * 0.82, w * 0.46, h * 0.16, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
          if (paint) paint(g, w, h);
          else {
            g.font = Math.round(h) + 'px serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(type.emoji, w / 2, h / 2);
          }
        });
    },
    clear() { cache.clear(); },
  };

  // ----- Obstacles (desert themed, family friendly) -----
  const OBSTACLES = {
    cactus(g, w, h) {
      const green = (x0, x1) => {
        const gr = g.createLinearGradient(x0, 0, x1, 0);
        gr.addColorStop(0, '#1f5a26'); gr.addColorStop(0.4, '#5fae4a'); gr.addColorStop(1, '#1b4a20');
        return gr;
      };
      const cx = w / 2, tw = w * 0.3;
      // arms
      g.fillStyle = green(0, w * 0.35);
      rr(g, w * 0.06, h * 0.3, w * 0.16, h * 0.32, w * 0.08); g.fill();
      rr(g, w * 0.06, h * 0.52, w * 0.3, h * 0.1, w * 0.05); g.fill();
      g.fillStyle = green(w * 0.65, w);
      rr(g, w * 0.78, h * 0.18, w * 0.16, h * 0.3, w * 0.08); g.fill();
      rr(g, w * 0.62, h * 0.4, w * 0.3, h * 0.1, w * 0.05); g.fill();
      // trunk
      g.fillStyle = green(cx - tw / 2, cx + tw / 2);
      rr(g, cx - tw / 2, h * 0.04, tw, h * 0.88, tw / 2); g.fill();
      // ribs and spines
      g.strokeStyle = 'rgba(0,40,0,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx, h * 0.1); g.lineTo(cx, h * 0.88); g.stroke();
      g.fillStyle = '#f6efc8';
      for (let y = h * 0.12; y < h * 0.86; y += 6) {
        g.fillRect(cx - tw / 2 - 1, y, 2, 1); g.fillRect(cx + tw / 2 - 1, y + 3, 2, 1);
      }
      // flower
      g.fillStyle = '#ff6fa8';
      g.beginPath(); g.arc(cx, h * 0.06, 3, 0, Math.PI * 2); g.fill();
    },
    rock(g, w, h) {
      const gr = g.createRadialGradient(w * 0.35, h * 0.3, 2, w * 0.5, h * 0.55, w * 0.6);
      gr.addColorStop(0, '#c9c0b4'); gr.addColorStop(0.5, '#8a8076'); gr.addColorStop(1, '#4a423b');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(w * 0.1, h * 0.7); g.lineTo(w * 0.05, h * 0.42); g.lineTo(w * 0.25, h * 0.15);
      g.lineTo(w * 0.55, h * 0.06); g.lineTo(w * 0.85, h * 0.22); g.lineTo(w * 0.96, h * 0.55);
      g.lineTo(w * 0.82, h * 0.88); g.lineTo(w * 0.35, h * 0.94);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(30,20,10,0.5)'; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(w * 0.27, h * 0.2); g.lineTo(w * 0.52, h * 0.12); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.moveTo(w * 0.5, h * 0.35); g.lineTo(w * 0.62, h * 0.6); g.lineTo(w * 0.58, h * 0.8); g.stroke();
    },
    camel(g, w, h) {
      const fur = g.createLinearGradient(0, 0, w, 0);
      fur.addColorStop(0, '#8a5a2b'); fur.addColorStop(0.45, '#d9a566'); fur.addColorStop(1, '#7a4c22');
      // legs (top-down peeking out)
      g.fillStyle = '#6b4320';
      for (const [x, y] of [[0.2, 0.18], [0.66, 0.18], [0.2, 0.72], [0.66, 0.72]]) {
        rr(g, w * x, h * y, w * 0.14, h * 0.12, 3); g.fill();
      }
      // body
      g.fillStyle = fur;
      g.beginPath(); g.ellipse(w * 0.47, h * 0.52, w * 0.3, h * 0.36, 0, 0, Math.PI * 2); g.fill();
      // humps
      g.fillStyle = 'rgba(255,230,180,0.5)';
      g.beginPath(); g.ellipse(w * 0.45, h * 0.4, w * 0.12, h * 0.1, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.45, h * 0.64, w * 0.12, h * 0.1, 0, 0, Math.PI * 2); g.fill();
      // neck + head (facing right)
      g.fillStyle = fur;
      rr(g, w * 0.66, h * 0.44, w * 0.2, h * 0.14, 5); g.fill();
      g.beginPath(); g.ellipse(w * 0.88, h * 0.5, w * 0.1, h * 0.11, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a1a0d';
      g.beginPath(); g.arc(w * 0.9, h * 0.44, 1.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(w * 0.9, h * 0.56, 1.5, 0, Math.PI * 2); g.fill();
      // tail
      g.strokeStyle = '#5a3818'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(w * 0.17, h * 0.52); g.lineTo(w * 0.06, h * 0.56); g.stroke();
    },
    snake(g, w, h) {
      const sk = g.createLinearGradient(0, 0, 0, h);
      sk.addColorStop(0, '#9bc94a'); sk.addColorStop(1, '#3e6a1a');
      g.strokeStyle = sk; g.lineCap = 'round'; g.lineWidth = h * 0.26;
      g.beginPath();
      g.moveTo(w * 0.1, h * 0.6);
      g.bezierCurveTo(w * 0.3, h * 0.1, w * 0.45, h * 0.95, w * 0.62, h * 0.45);
      g.quadraticCurveTo(w * 0.72, h * 0.25, w * 0.82, h * 0.42);
      g.stroke();
      // pattern
      g.strokeStyle = 'rgba(40,60,10,0.6)'; g.lineWidth = 2; g.setLineDash([2, 4]);
      g.stroke(); g.setLineDash([]);
      // head
      g.fillStyle = '#5f8f2a';
      g.beginPath(); g.ellipse(w * 0.86, h * 0.44, w * 0.12, h * 0.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111';
      g.beginPath(); g.arc(w * 0.9, h * 0.34, 1.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(w * 0.9, h * 0.54, 1.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d33'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(w * 0.97, h * 0.44); g.lineTo(w, h * 0.38); g.moveTo(w * 0.97, h * 0.44); g.lineTo(w, h * 0.5); g.stroke();
    },
    scorpion(g, w, h) {
      const sh = g.createRadialGradient(w * 0.45, h * 0.45, 1, w * 0.5, h * 0.55, w * 0.4);
      sh.addColorStop(0, '#e2a04a'); sh.addColorStop(1, '#7a3f12');
      g.strokeStyle = '#6b3510'; g.lineWidth = 1.5;
      // legs
      for (let i = 0; i < 4; i++) {
        const y = h * (0.42 + i * 0.1);
        g.beginPath(); g.moveTo(w * 0.4, y); g.lineTo(w * 0.22, y + 3);
        g.moveTo(w * 0.6, y); g.lineTo(w * 0.78, y + 3); g.stroke();
      }
      // claws
      g.fillStyle = sh;
      g.beginPath(); g.ellipse(w * 0.22, h * 0.18, w * 0.1, h * 0.12, -0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(w * 0.78, h * 0.18, w * 0.1, h * 0.12, 0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w * 0.42, h * 0.38); g.lineTo(w * 0.26, h * 0.26); g.moveTo(w * 0.58, h * 0.38); g.lineTo(w * 0.74, h * 0.26); g.stroke();
      // body
      g.beginPath(); g.ellipse(w * 0.5, h * 0.55, w * 0.14, h * 0.22, 0, 0, Math.PI * 2); g.fill();
      // tail curling up over the back
      g.strokeStyle = '#b8681f'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(w * 0.5, h * 0.75);
      g.quadraticCurveTo(w * 0.5, h * 1.0, w * 0.68, h * 0.9);
      g.quadraticCurveTo(w * 0.8, h * 0.78, w * 0.66, h * 0.7); g.stroke();
      g.fillStyle = '#3a1a05';
      g.beginPath(); g.arc(w * 0.65, h * 0.69, 2, 0, Math.PI * 2); g.fill();
    },
  };
})();
