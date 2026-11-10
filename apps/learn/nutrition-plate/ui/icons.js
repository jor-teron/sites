/* NP-1a: food icons drawn on canvas. No network images. */
(function (root) {
  'use strict';
  function disk(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function oval(ctx, x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function bowl(ctx, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(s * 0.18, s * 0.42); ctx.quadraticCurveTo(s * 0.5, s * 0.95, s * 0.82, s * 0.42);
    ctx.lineTo(s * 0.78, s * 0.42); ctx.quadraticCurveTo(s * 0.5, s * 0.82, s * 0.22, s * 0.42); ctx.closePath(); ctx.fill();
    oval(ctx, s * 0.5, s * 0.42, s * 0.32, s * 0.12, color);
  }
  const draw = {
    roti(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.36, s * 0.32, '#e8c27a'); oval(ctx, s * 0.5, s * 0.52, s * 0.28, s * 0.24, '#f3d9a0'); },
    paratha(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.38, s * 0.33, '#d4a017'); oval(ctx, s * 0.5, s * 0.52, s * 0.26, s * 0.22, '#f0c85a'); },
    puri(ctx, s) { disk(ctx, s * 0.5, s * 0.5, s * 0.32, '#e6b35c'); disk(ctx, s * 0.5, s * 0.5, s * 0.2, '#f5d48a'); },
    rice(ctx, s) { bowl(ctx, s, '#cfd8dc'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#f5f1e6');
      for (let i = 0; i < 8; i++) oval(ctx, s * (0.35 + (i % 4) * 0.1), s * (0.36 + Math.floor(i / 4) * 0.07), 2, 1.2, '#fff8e8'); },
    pulao(ctx, s) { this.rice(ctx, s); disk(ctx, s * 0.38, s * 0.38, 3, '#e07020'); disk(ctx, s * 0.6, s * 0.4, 3, '#4caf50'); },
    poha(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#f0e0a8'); disk(ctx, s * 0.4, s * 0.38, 3, '#7cb342'); },
    bread(ctx, s) { ctx.fillStyle = '#e0b070'; ctx.fillRect(s * 0.22, s * 0.3, s * 0.56, s * 0.42); ctx.fillStyle = '#f3d9a8'; ctx.fillRect(s * 0.26, s * 0.34, s * 0.48, s * 0.34); },
    idli(ctx, s) { oval(ctx, s * 0.5, s * 0.48, s * 0.28, s * 0.16, '#f4f0e0'); oval(ctx, s * 0.5, s * 0.62, s * 0.24, s * 0.12, '#ebe6d3'); },
    dosa(ctx, s) { ctx.fillStyle = '#e8c878'; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.58, s * 0.4, s * 0.18, -0.4, 0, Math.PI * 2); ctx.fill(); },
    porridge(ctx, s) { bowl(ctx, s, '#bcaaa4'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#d7b56d'); },
    dal(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#e6a817'); },
    sambar(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#c5681a'); disk(ctx, s * 0.42, s * 0.4, 3, '#e07020'); },
    chole(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#8d4b1a'); },
    sprouts(ctx, s) { bowl(ctx, s, '#eceff1'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#aed581');
      ctx.strokeStyle = '#689f38'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s * 0.45, s * 0.42); ctx.lineTo(s * 0.48, s * 0.3); ctx.stroke(); },
    sabzi(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#5d9a3a'); disk(ctx, s * 0.4, s * 0.38, 3, '#e07020'); disk(ctx, s * 0.58, s * 0.4, 3, '#f4d35e'); },
    leafy(ctx, s) { ctx.fillStyle = '#3d7a2a'; ctx.beginPath(); ctx.ellipse(s * 0.42, s * 0.5, s * 0.18, s * 0.3, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5da13c'; ctx.beginPath(); ctx.ellipse(s * 0.6, s * 0.5, s * 0.18, s * 0.3, 0.5, 0, Math.PI * 2); ctx.fill(); },
    salad(ctx, s) { bowl(ctx, s, '#fff8e8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#c5e1a5'); disk(ctx, s * 0.4, s * 0.38, 3, '#e07020'); disk(ctx, s * 0.58, s * 0.4, 3, '#8d6e63'); },
    soup(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#e07a2f'); },
    potato(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.26, s * 0.2, '#d8b06a'); oval(ctx, s * 0.42, s * 0.48, 2, 2, '#8d6e63'); },
    corn(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.16, s * 0.34, '#f4d35e'); ctx.fillStyle = '#7cb342'; ctx.fillRect(s * 0.42, s * 0.16, s * 0.16, s * 0.14); },
    banana(ctx, s) { ctx.fillStyle = '#f4d35e'; ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.55, s * 0.32, s * 0.14, -0.6, 0, Math.PI * 2); ctx.fill(); },
    apple(ctx, s) { disk(ctx, s * 0.5, s * 0.55, s * 0.24, '#e05040'); ctx.strokeStyle = '#3d7a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.34); ctx.lineTo(s * 0.5, s * 0.22); ctx.stroke(); },
    citrus(ctx, s) { disk(ctx, s * 0.5, s * 0.52, s * 0.26, '#f4a020'); disk(ctx, s * 0.5, s * 0.52, s * 0.16, '#ffe08a'); },
    melon(ctx, s) { ctx.fillStyle = '#e05040'; ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.7); ctx.quadraticCurveTo(s * 0.5, s * 0.15, s * 0.8, s * 0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe0e0'; ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.68); ctx.quadraticCurveTo(s * 0.5, s * 0.3, s * 0.7, s * 0.68); ctx.closePath(); ctx.fill(); },
    fruit(ctx, s) { disk(ctx, s * 0.5, s * 0.52, s * 0.24, '#e07020'); ctx.fillStyle = '#3d7a2a'; ctx.beginPath(); ctx.ellipse(s * 0.62, s * 0.3, 6, 3, 0.4, 0, Math.PI * 2); ctx.fill(); },
    coconut(ctx, s) { disk(ctx, s * 0.5, s * 0.54, s * 0.26, '#6d4c41'); disk(ctx, s * 0.5, s * 0.54, s * 0.18, '#f5f1e6'); },
    milk(ctx, s) { ctx.fillStyle = '#eceff1'; ctx.fillRect(s * 0.32, s * 0.22, s * 0.36, s * 0.58); ctx.fillStyle = '#90caf9'; ctx.fillRect(s * 0.32, s * 0.22, s * 0.36, s * 0.1); },
    curd(ctx, s) { bowl(ctx, s, '#d7ccc8'); oval(ctx, s * 0.5, s * 0.4, s * 0.28, s * 0.1, '#f5f5f5'); },
    paneer(ctx, s) { ctx.fillStyle = '#f5f0d8'; ctx.fillRect(s * 0.28, s * 0.38, s * 0.22, s * 0.22); ctx.fillRect(s * 0.5, s * 0.32, s * 0.22, s * 0.22); ctx.strokeStyle = '#d7ccc8'; ctx.strokeRect(s * 0.28, s * 0.38, s * 0.22, s * 0.22); ctx.strokeRect(s * 0.5, s * 0.32, s * 0.22, s * 0.22); },
    egg(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.2, s * 0.26, '#f5f1e6'); disk(ctx, s * 0.5, s * 0.54, s * 0.1, '#f4d35e'); },
    chicken(ctx, s) { oval(ctx, s * 0.52, s * 0.55, s * 0.26, s * 0.16, '#e8a070'); oval(ctx, s * 0.3, s * 0.48, s * 0.1, s * 0.08, '#e8a070'); },
    meat(ctx, s) { oval(ctx, s * 0.5, s * 0.52, s * 0.28, s * 0.18, '#a63d3d'); oval(ctx, s * 0.5, s * 0.52, s * 0.16, s * 0.1, '#c75b5b'); },
    fish(ctx, s) { ctx.fillStyle = '#7fb3c8'; ctx.beginPath(); ctx.ellipse(s * 0.48, s * 0.52, s * 0.24, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.7, s * 0.52); ctx.lineTo(s * 0.86, s * 0.38); ctx.lineTo(s * 0.86, s * 0.66); ctx.closePath(); ctx.fill(); },
    prawn(ctx, s) { ctx.strokeStyle = '#e07050'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s * 0.28, s * 0.62); ctx.quadraticCurveTo(s * 0.5, s * 0.2, s * 0.75, s * 0.5); ctx.stroke(); },
    nut(ctx, s) { oval(ctx, s * 0.4, s * 0.52, s * 0.12, s * 0.16, '#c48a3a'); oval(ctx, s * 0.6, s * 0.5, s * 0.12, s * 0.16, '#a06a28'); },
    oil(ctx, s) { ctx.fillStyle = '#f0c020'; ctx.beginPath(); ctx.moveTo(s * 0.38, s * 0.28); ctx.lineTo(s * 0.62, s * 0.28); ctx.lineTo(s * 0.58, s * 0.78); ctx.lineTo(s * 0.42, s * 0.78); ctx.closePath(); ctx.fill(); },
    snack(ctx, s) { ctx.fillStyle = '#e6b35c'; ctx.beginPath(); ctx.moveTo(s * 0.25, s * 0.7); ctx.lineTo(s * 0.5, s * 0.22); ctx.lineTo(s * 0.75, s * 0.7); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c68a2a'; ctx.fillRect(s * 0.42, s * 0.48, s * 0.16, s * 0.16); },
    sweet(ctx, s) { disk(ctx, s * 0.5, s * 0.52, s * 0.24, '#e07080'); disk(ctx, s * 0.5, s * 0.52, s * 0.1, '#f5d0d4'); },
    tea(ctx, s) { bowl(ctx, s, '#eceff1'); oval(ctx, s * 0.5, s * 0.42, s * 0.24, s * 0.08, '#6d4c41'); ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s * 0.78, s * 0.5, s * 0.1, -0.8, 0.8); ctx.stroke(); },
    juice(ctx, s) { ctx.fillStyle = '#f4a020'; ctx.fillRect(s * 0.34, s * 0.28, s * 0.32, s * 0.5); ctx.fillStyle = '#ffe0a0'; ctx.fillRect(s * 0.34, s * 0.28, s * 0.32, s * 0.08); },
    drink(ctx, s) { ctx.fillStyle = '#90caf9'; ctx.fillRect(s * 0.34, s * 0.26, s * 0.32, s * 0.54); ctx.fillStyle = '#e3f2fd'; ctx.fillRect(s * 0.34, s * 0.26, s * 0.32, s * 0.1); },
    water(ctx, s) { ctx.fillStyle = '#e3f2fd'; ctx.fillRect(s * 0.34, s * 0.26, s * 0.32, s * 0.54); ctx.strokeStyle = '#90caf9'; ctx.strokeRect(s * 0.34, s * 0.26, s * 0.32, s * 0.54); }
  };
  function paint(canvas, type) {
    const s = canvas.width, ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    disk(ctx, s * 0.5, s * 0.5, s * 0.48, '#f4efe4');
    (draw[type] || draw.fruit).call(draw, ctx, s);
  }
  function make(type, size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size || 64;
    canvas.className = 'np-icon';
    canvas.setAttribute('aria-hidden', 'true');
    paint(canvas, type);
    return canvas;
  }
  root.NPIcons = { paint, make };
})(typeof globalThis !== 'undefined' ? globalThis : this);
