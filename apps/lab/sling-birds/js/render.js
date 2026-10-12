// Canvas sizing, world<->screen transforms and drawing.
import { WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y } from './config.js';
import { S } from './entities.js';
import { drawSling, drawTrajectory } from './slingshot.js';

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');

// ---------- SIZING ----------
export let SCALE = 1, CW = 0, CH = 0, OFFSET_X = 0, OFFSET_Y = 0;

export function resize() {
  const rect = stage.getBoundingClientRect();
  CW = Math.max(200, Math.floor(rect.width));
  CH = Math.max(300, Math.floor(rect.height));

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(CW * dpr);
  canvas.height = Math.floor(CH * dpr);
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const scaleX = CW / WORLD_WIDTH;
  const scaleY = CH / WORLD_HEIGHT;
  SCALE = Math.min(scaleX, scaleY);
  OFFSET_X = (CW - WORLD_WIDTH * SCALE) / 2;
  OFFSET_Y = (CH - WORLD_HEIGHT * SCALE) / 2;
}

export function initResize() {
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));
}

export function w2s(x, y) { return { x: x * SCALE + OFFSET_X, y: y * SCALE + OFFSET_Y }; }
export function s2w(x, y) { return { x: (x - OFFSET_X) / SCALE, y: (y - OFFSET_Y) / SCALE }; }

// ---------- DRAWING ----------
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#1a1a3e');
  g.addColorStop(0.6, '#2a1a3e');
  g.addColorStop(1, '#4a2a2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);

  // Distant hills
  ctx.fillStyle = 'rgba(30, 40, 60, 0.6)';
  ctx.beginPath();
  ctx.moveTo(0, CH);
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * CW;
    const y = CH - 180 - Math.sin(i * 1.3) * 60;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(CW, CH);
  ctx.closePath();
  ctx.fill();

  // Stars
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 73 + 19) % 400) / 400 * CW;
    const sy = ((i * 53 + 41) % 200) / 200 * CH * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.1})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Moon
  const mx = CW * 0.8, my = CH * 0.18;
  ctx.fillStyle = 'rgba(255, 240, 200, 0.15)';
  ctx.beginPath();
  ctx.arc(mx, my, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 240, 200, 0.9)';
  ctx.beginPath();
  ctx.arc(mx, my, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround() {
  const gy = w2s(0, GROUND_Y).y;
  const g = ctx.createLinearGradient(0, gy, 0, CH);
  g.addColorStop(0, '#4a3a1a');
  g.addColorStop(0.2, '#2a1a0a');
  g.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = g;
  ctx.fillRect(0, gy, CW, CH - gy);
  // Grass strip
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(0, gy - 2, CW, 4);
}
function drawBird(body, _type) {
  const p = w2s(body.position.x, body.position.y);
  const r = 18 * SCALE;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(body.angle);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(2, 2, r, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#ff5b5b');
  g.addColorStop(1, '#b81010');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#ffe0b0';
  ctx.beginPath();
  ctx.arc(0, r * 0.35, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.3, r * 0.28, 0, Math.PI * 2);
  ctx.arc(r * 0.3, -r * 0.3, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.arc(r * 0.35, -r * 0.3, r * 0.14, 0, Math.PI * 2);
  ctx.fill();

  // Angry eyebrows
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.7);
  ctx.lineTo(-r * 0.1, -r * 0.45);
  ctx.moveTo(r * 0.55, -r * 0.7);
  ctx.lineTo(r * 0.15, -r * 0.45);
  ctx.stroke();

  // Beak
  ctx.fillStyle = '#ffb030';
  ctx.beginPath();
  ctx.moveTo(r * 0.15, r * 0.1);
  ctx.lineTo(r * 0.9, r * 0.05);
  ctx.lineTo(r * 0.15, r * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a5010';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawPig(pigEntry) {
  const body = pigEntry.body;
  const p = w2s(body.position.x, body.position.y);
  const r = pigEntry.r * SCALE;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(body.angle);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(2, 2, r, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#7bff7b');
  g.addColorStop(1, '#2a8a2a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a3a0a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.25, r * 0.25, 0, Math.PI * 2);
  ctx.arc(r * 0.3, -r * 0.25, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.25, r * 0.11, 0, Math.PI * 2);
  ctx.arc(r * 0.32, -r * 0.25, r * 0.11, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillStyle = '#4ac04a';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.5, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a3a0a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#0a3a0a';
  ctx.beginPath();
  ctx.arc(-r * 0.15, r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.arc(r * 0.15, r * 0.2, r * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBlock(blockEntry) {
  const body = blockEntry.body;
  const w = blockEntry.w * SCALE;
  const h = blockEntry.h * SCALE;
  const p = w2s(body.position.x, body.position.y);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(body.angle);

  const mat = blockEntry.material;
  const fill = mat === 'wood' ? '#c68a4a' : '#888';
  const stroke = mat === 'wood' ? '#5a3a1a' : '#333';
  const highlight = mat === 'wood' ? 'rgba(255, 220, 160, 0.4)' : 'rgba(220, 220, 220, 0.4)';

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);

  // Body
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Texture hints
  if (mat === 'wood') {
    ctx.strokeStyle = 'rgba(90, 58, 26, 0.35)';
    ctx.lineWidth = 1;
    const lines = 3;
    for (let i = 1; i <= lines; i++) {
      const ly = -h / 2 + (h / (lines + 1)) * i;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, ly);
      ctx.lineTo(w / 2 - 3, ly);
      ctx.stroke();
    }
  } else if (mat === 'stone') {
    ctx.fillStyle = 'rgba(60, 60, 60, 0.35)';
    ctx.beginPath();
    ctx.arc(-w * 0.2, h * 0.1, w * 0.08, 0, Math.PI * 2);
    ctx.arc(w * 0.25, -h * 0.15, w * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight
  ctx.fillStyle = highlight;
  ctx.fillRect(-w / 2, -h / 2, w, Math.max(2, h * 0.12));

  // Border
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.restore();
}

export function render() {
  drawBackground();

  for (const b of S.blocks) drawBlock(b);
  for (const p of S.pigs) if (!p.dead) drawPig(p);
  for (const b of S.activeBirds) drawBird(b.body, b.type);

  if (S.currentBird && !S.currentBird.launched) {
    if (S.isDragging) {
      const fakeBody = { position: { x: S.dragPos.x, y: S.dragPos.y }, angle: 0 };
      drawBird(fakeBody, S.currentBird.type);
    } else {
      drawBird(S.currentBird.body, S.currentBird.type);
    }
  }

  drawSling();
  drawGround();
  drawTrajectory();
}
