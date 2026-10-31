/*
  File: ui/effects.js
  Project: tower-defence
  Purpose: Ordnance and impact effects: tracer bullets, cannon shells,
           frost bolts, blasts, sparks, dust, smoke, debris, frost bursts,
           and fading scorch decals. Everything is stored in tile units
           so a resize keeps effects in place. Particles come from a fixed
           pool (no allocation per shot) and every look is a cached sprite
           from models.js, so a frame is only blits.
*/

import { TILE } from '../core/path.js';
import { sprite, blit } from '../assets/models.js';

/* Hard caps keep slow PCs smooth. New effects are dropped when full. */
const MAX_PARTICLES = 320;
const MAX_SCORCH = 20;

/* Particle pool: active list plus free stack, both of reusable objects. */
const active = [];
const free = [];
for (let i = 0; i < MAX_PARTICLES; i++) free.push({});

/* Scorch decals ring buffer: oldest is replaced. */
const scorches = [];
let scorchNext = 0;

/* Seeded random so rebuilt sprites look the same after a resize. */
function seeded(seed) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

/* Radial gradient disc sprite helper. stops: [[t, color], ...]. */
function disc(key, sizeTiles, radiusTiles, stops) {
  return sprite(key, sizeTiles, (g, T) => {
    const R = radiusTiles * T;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
  });
}

/* ---------- sprites ---------- */

const SPR = {
  flash: () => disc('fx-flash', 1.4, 0.7, [[0, 'rgba(255,255,240,1)'], [0.25, 'rgba(255,240,170,0.9)'], [0.6, 'rgba(255,180,60,0.35)'], [1, 'rgba(255,140,0,0)']]),
  fire: () => disc('fx-fire', 1.0, 0.5, [[0, 'rgba(255,250,200,1)'], [0.3, 'rgba(255,190,60,0.95)'], [0.65, 'rgba(230,90,20,0.7)'], [1, 'rgba(120,30,10,0)']]),
  smoke: () => sprite('fx-smoke', 1.0, (g, T) => {
    const rnd = seeded(7);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 0.16 * T;
      const R = (0.2 + rnd() * 0.14) * T;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(110,110,110,0.45)');
      gr.addColorStop(1, 'rgba(80,80,80,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
    }
  }),
  dust: () => disc('fx-dust', 0.8, 0.4, [[0, 'rgba(170,140,100,0.55)'], [1, 'rgba(140,110,80,0)']]),
  debris: () => sprite('fx-debris', 0.16, (g, T) => {
    const rnd = seeded(13);
    g.fillStyle = '#2b2622';
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = (0.035 + rnd() * 0.035) * T;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,170,80,0.6)';
    g.fillRect(-0.01 * T, -0.01 * T, 0.02 * T, 0.02 * T);
  }),
  spark: () => sprite('fx-spark', 0.3, (g, T) => {
    const gr = g.createLinearGradient(-0.13 * T, 0, 0.06 * T, 0);
    gr.addColorStop(0, 'rgba(255,140,0,0)');
    gr.addColorStop(1, 'rgba(255,250,210,1)');
    g.fillStyle = gr;
    g.fillRect(-0.13 * T, -0.012 * T, 0.19 * T, 0.024 * T);
  }),
  ice: () => sprite('fx-ice', 0.22, (g, T) => {
    g.fillStyle = 'rgba(220,255,255,0.95)';
    g.beginPath();
    g.moveTo(0.09 * T, 0);
    g.lineTo(0, 0.03 * T);
    g.lineTo(-0.06 * T, 0);
    g.lineTo(0, -0.03 * T);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(100,220,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  }),
  ring: () => sprite('fx-ring', 1.3, (g, T) => {
    const R = 0.5 * T;
    const gr = g.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    gr.addColorStop(0, 'rgba(160,240,255,0)');
    gr.addColorStop(0.75, 'rgba(200,250,255,0.8)');
    gr.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
  }),
  scorch: () => sprite('fx-scorch', 1.3, (g, T) => {
    const rnd = seeded(29);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.5 * T);
    gr.addColorStop(0, 'rgba(10,8,6,0.85)');
    gr.addColorStop(0.6, 'rgba(25,18,12,0.5)');
    gr.addColorStop(1, 'rgba(30,20,10,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 0.5 * T, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = (0.25 + rnd() * 0.25) * T;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, (0.03 + rnd() * 0.05) * T, 0, Math.PI * 2);
      g.fill();
    }
  }),
  /* Brass tracer: bright streak behind a small brass slug. Head at +x. */
  bullet: () => sprite('fx-bullet', 0.6, (g, T) => {
    const gr = g.createLinearGradient(-0.28 * T, 0, 0.04 * T, 0);
    gr.addColorStop(0, 'rgba(255,170,40,0)');
    gr.addColorStop(1, 'rgba(255,235,150,0.9)');
    g.fillStyle = gr;
    g.fillRect(-0.28 * T, -0.016 * T, 0.32 * T, 0.032 * T);
    const bg = g.createLinearGradient(0, -0.025 * T, 0, 0.025 * T);
    bg.addColorStop(0, '#FFE9A0');
    bg.addColorStop(0.5, '#C9952E');
    bg.addColorStop(1, '#6E4E12');
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0.04 * T, 0, 0.045 * T, 0.022 * T, 0, 0, Math.PI * 2);
    g.fill();
  }),
  /* Dark cannon shell with a glowing base. */
  shell: () => sprite('fx-shell', 0.4, (g, T) => {
    g.fillStyle = 'rgba(255,140,40,0.7)';
    g.beginPath();
    g.arc(-0.06 * T, 0, 0.035 * T, 0, Math.PI * 2);
    g.fill();
    const sg = g.createLinearGradient(0, -0.045 * T, 0, 0.045 * T);
    sg.addColorStop(0, '#8a8f98');
    sg.addColorStop(0.45, '#3a3d44');
    sg.addColorStop(1, '#111');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(0.01 * T, 0, 0.075 * T, 0.042 * T, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#B07B3A';
    g.fillRect(-0.035 * T, -0.042 * T, 0.018 * T, 0.084 * T);
  }),
  /* Icy bolt: cyan glow, white core shard, faint tail. */
  frostBolt: () => sprite('fx-frost', 0.6, (g, T) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 0.16 * T);
    gr.addColorStop(0, 'rgba(200,250,255,0.9)');
    gr.addColorStop(1, 'rgba(100,220,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 0.16 * T, 0, Math.PI * 2);
    g.fill();
    const tg = g.createLinearGradient(-0.26 * T, 0, 0, 0);
    tg.addColorStop(0, 'rgba(120,230,255,0)');
    tg.addColorStop(1, 'rgba(180,245,255,0.7)');
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(-0.26 * T, 0);
    g.lineTo(0, -0.035 * T);
    g.lineTo(0, 0.035 * T);
    g.closePath();
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.moveTo(0.09 * T, 0);
    g.lineTo(0, 0.035 * T);
    g.lineTo(-0.05 * T, 0);
    g.lineTo(0, -0.035 * T);
    g.closePath();
    g.fill();
  })
};

/* ---------- spawning ---------- */

/*
  Take a pooled particle. Returns null when the pool is empty, so callers
  simply skip the effect. Fields are in tiles, tiles/s, and seconds.
*/
function spawn(kind, x, y, vx, vy, life, size) {
  const p = free.pop();
  if (!p) return null;
  p.kind = kind;
  p.x = x; p.y = y;
  p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life;
  p.size = size;
  p.rot = Math.random() * Math.PI * 2;
  p.vrot = 0;
  p.drag = 3;
  active.push(p);
  return p;
}

/* Random point on a circle with a speed range, for bursts. */
function burstVel(min, max) {
  const a = Math.random() * Math.PI * 2;
  const s = min + Math.random() * (max - min);
  return [Math.cos(a) * s, Math.sin(a) * s];
}

/*
  Cannon blast at x, y (tiles). radius is the splash radius in tiles.
  Flash, fireball fading to smoke, smoke puffs, flying debris, scorch.
*/
export function blast(x, y, radius = 1, big = false) {
  const k = Math.max(0.6, radius) * (big ? 1.4 : 1);
  spawn('flash', x, y, 0, 0, 0.09, 1.1 * k);
  const f = spawn('fire', x, y, 0, 0, 0.75, 1.0 * k);
  if (f) f.drag = 0;
  for (let i = 0; i < (big ? 5 : 3); i++) {
    const [vx, vy] = burstVel(0.2, 0.6);
    spawn('smoke', x + vx * 0.2, y + vy * 0.2, vx, vy, 1.0 + Math.random() * 0.5, 0.8 * k);
  }
  for (let i = 0; i < (big ? 10 : 6); i++) {
    const [vx, vy] = burstVel(1.8, 3.8);
    const d = spawn('debris', x, y, vx * k, vy * k, 0.45 + Math.random() * 0.35, 0.7 + Math.random() * 0.6);
    if (d) { d.vrot = (Math.random() - 0.5) * 20; d.drag = 4; }
  }
  for (let i = 0; i < 4; i++) {
    const [vx, vy] = burstVel(2.5, 5);
    const s = spawn('spark', x, y, vx, vy, 0.18 + Math.random() * 0.12, 1);
    if (s) s.drag = 5;
  }
  scorches[scorchNext] = { x, y, rot: Math.random() * Math.PI * 2, size: 0.8 * k, life: 7, maxLife: 7 };
  scorchNext = (scorchNext + 1) % MAX_SCORCH;
}

/* Small bullet hit: a few sparks thrown back toward the shooter plus dust. */
export function hitSparks(x, y, angle) {
  for (let i = 0; i < 4; i++) {
    const a = angle + Math.PI + (Math.random() - 0.5) * 2.2;
    const s = 1.5 + Math.random() * 2.5;
    const p = spawn('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.12 + Math.random() * 0.12, 0.7);
    if (p) p.drag = 6;
  }
  const [vx, vy] = burstVel(0.05, 0.2);
  spawn('dust', x, y, vx, vy, 0.45, 0.45);
}

/* Frost bolt hit: expanding ice ring and a few shards. */
export function frostBurst(x, y) {
  const r = spawn('ring', x, y, 0, 0, 0.35, 0.8);
  if (r) r.drag = 0;
  for (let i = 0; i < 5; i++) {
    const [vx, vy] = burstVel(1, 2.2);
    const p = spawn('ice', x, y, vx, vy, 0.3 + Math.random() * 0.15, 1);
    if (p) { p.rot = Math.atan2(vy, vx); p.drag = 5; }
  }
}

/* Dust puff and sparks when a soldier or buggy is destroyed. */
export function smallDeath(x, y) {
  for (let i = 0; i < 2; i++) {
    const [vx, vy] = burstVel(0.1, 0.4);
    spawn('dust', x, y, vx, vy, 0.6, 0.6);
  }
  for (let i = 0; i < 3; i++) {
    const [vx, vy] = burstVel(1.5, 3);
    const p = spawn('spark', x, y, vx, vy, 0.2, 0.8);
    if (p) p.drag = 5;
  }
}

/* Faint smoke left behind a flying cannon shell. */
export function shellSmoke(x, y) {
  const p = spawn('smoke', x, y, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, 0.55, 0.3);
  if (p) p.drag = 1;
}

/* ---------- update / draw ---------- */

/* Age and move particles and scorch decals. dt in seconds. */
export function updateEffects(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const p = active[i];
    p.life -= dt;
    if (p.life <= 0) {
      active[i] = active[active.length - 1];
      active.pop();
      free.push(p);
      continue;
    }
    const damp = Math.max(0, 1 - p.drag * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
  }
  for (const s of scorches) if (s && s.life > 0) s.life -= dt;
}

/* Remove every effect (new run). */
export function clearEffects() {
  while (active.length) free.push(active.pop());
  scorches.length = 0;
  scorchNext = 0;
}

/* Scorch decals, drawn on the road under towers and units. */
export function drawScorches(ctx) {
  const T = TILE;
  const spr = SPR.scorch();
  for (const s of scorches) {
    if (!s || s.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, s.life / 2.5) * 0.7;
    blit(ctx, spr, s.x * T, s.y * T, s.rot, s.size);
  }
  ctx.globalAlpha = 1;
}

/*
  Shots. Each projectile has kind ('gun' | 'cannon' | 'frost'), x, y in
  tiles, and ang (flight direction).
*/
export function drawProjectiles(ctx, projectiles) {
  const T = TILE;
  for (const p of projectiles) {
    const spr = p.kind === 'cannon' ? SPR.shell() : p.kind === 'frost' ? SPR.frostBolt() : SPR.bullet();
    blit(ctx, spr, p.x * T, p.y * T, p.ang);
  }
}

/* Particles above units. Alpha and scale follow each particle's life. */
export function drawParticles(ctx) {
  const T = TILE;
  for (const p of active) {
    const t = p.life / p.maxLife;
    const u = 1 - t;
    const x = p.x * T;
    const y = p.y * T;
    switch (p.kind) {
      case 'flash':
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        blit(ctx, SPR.flash(), x, y, 0, p.size * (0.7 + u * 0.6));
        ctx.globalCompositeOperation = 'source-over';
        break;
      case 'fire': {
        const sc = p.size * (0.55 + u * 0.9);
        ctx.globalAlpha = Math.min(1, u * 2.5) * t * 0.9;
        blit(ctx, SPR.smoke(), x, y, p.rot, sc * 1.25);
        const fa = Math.max(0, 1 - u * 1.7);
        if (fa > 0) {
          ctx.globalAlpha = fa;
          blit(ctx, SPR.fire(), x, y, 0, sc);
        }
        break;
      }
      case 'smoke':
        ctx.globalAlpha = t * 0.7;
        blit(ctx, SPR.smoke(), x, y, p.rot, p.size * (0.5 + u * 1.1));
        break;
      case 'dust':
        ctx.globalAlpha = t;
        blit(ctx, SPR.dust(), x, y, 0, p.size * (0.6 + u * 0.9));
        break;
      case 'debris':
        ctx.globalAlpha = Math.min(1, t * 3);
        blit(ctx, SPR.debris(), x, y, p.rot, p.size);
        break;
      case 'spark':
        ctx.globalAlpha = t;
        blit(ctx, SPR.spark(), x, y, Math.atan2(p.vy, p.vx), p.size * (0.5 + t * 0.5));
        break;
      case 'ice':
        ctx.globalAlpha = t;
        blit(ctx, SPR.ice(), x, y, p.rot, p.size);
        break;
      case 'ring':
        ctx.globalAlpha = t;
        blit(ctx, SPR.ring(), x, y, 0, p.size * (0.3 + u * 1.0));
        break;
    }
  }
  ctx.globalAlpha = 1;
}

/* Live particle count (for tests and tuning). */
export function particleCount() {
  return active.length;
}
