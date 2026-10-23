/*
 * Project: sketchbook
 * File: sk_jelly.js
 * Role: The floating button's jelly look (pure SVG + vanilla JS, no libraries).
 *   #floatBtn stays the fixed, invisible hit target; #jelly (pointer-events:none) draws a soft,
 *   glossy blue blob over it. Drag: the blob stretches long/thin toward the finger while a small
 *   gooey tail blob stays home (merged by an SVG goo filter: feGaussianBlur + feColorMatrix);
 *   the soft shadow stretches with it. Release: a slow, soft spring with squash-and-stretch that
 *   settles over several bounces. Crumple: whole-body jiggle.
 *   If anything fails, body never gets .jelly-on and the plain blue CSS button stays visible.
 *   No distance cap: the blob reaches the finger, joined home by a thinning goo bridge.
 *   API used by sk_float.js: floatFollow(dx, dy), floatRelease(), floatShake(), floatPress(), floatArm(on).
 */
const JELLY_HOME = 120;       // centre of the 240×240 SVG = button home
// The blob follows the finger all the way (no cap); a goo bridge + home tail thin with distance.
const SVGNS = 'http://www.w3.org/2000/svg';

const jelly = { x: 0, y: 0, vx: 0, vy: 0, sq: 0, vsq: 0, rot: 0, vrot: 0, ang: 0, tail: 0, raf: 0 };
let jBody, jGloss, jTail, jShadow, jBridge;

function buildJelly() {
  const host = document.getElementById('jelly');
  if (!host) return;
  host.innerHTML =
    '<defs>' +
    '<radialGradient id="jg" cx="36%" cy="30%" r="75%">' +
    '<stop offset="0" stop-color="#f2fbff"/><stop offset="0.35" stop-color="#8fd0ff"/>' +
    '<stop offset="0.75" stop-color="#3d8ff0"/><stop offset="1" stop-color="#2a63c9"/></radialGradient>' +
    '<filter id="goo" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="6"/>' +
    '<feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>' +
    '<filter id="jsh" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>' +
    '</defs>' +
    '<ellipse id="jShadow" cx="120" cy="150" rx="22" ry="5" fill="rgba(30,70,140,0.35)" filter="url(#jsh)"/>' +
    '<g filter="url(#goo)"><line id="jBridge" x1="120" y1="120" x2="120" y2="120" stroke="#5aa8f5" stroke-linecap="round" stroke-width="0"/>' +
    '<circle id="jTail" cx="120" cy="120" r="0" fill="#5aa8f5"/>' +
    '<g id="jBody"><ellipse rx="25" ry="25" fill="url(#jg)"/></g></g>' +
    '<g id="jGloss"><ellipse cx="-8" cy="-11" rx="9" ry="5" fill="#fff" opacity="0.75" transform="rotate(-25 -8 -11)"/>' +
    '<circle cx="10" cy="-14" r="2" fill="#fff" opacity="0.6"/>' +
    '<text y="6" text-anchor="middle" font-size="17" fill="#fff" font-family="system-ui,sans-serif" opacity="0.95">☰</text></g>';
  jBody = document.getElementById('jBody');
  jGloss = document.getElementById('jGloss');
  jTail = document.getElementById('jTail');
  jShadow = document.getElementById('jShadow');
  jBridge = document.getElementById('jBridge');
  jellyDraw(1, 1);
  document.body.classList.add('jelly-on');   // only now hide the plain fallback button
}

// Paint the blob: offset (x, y), stretch sx along angle ang, thin sy across it, extra rotation.
function jellyDraw(sx, sy) {
  if (!jBody) return;
  const cx = JELLY_HOME + jelly.x, cy = JELLY_HOME + jelly.y;
  const t = 'translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ') rotate(' + (jelly.ang + jelly.rot).toFixed(1) +
    ') scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ') rotate(' + (-jelly.ang).toFixed(1) + ')';
  jBody.setAttribute('transform', t);
  // gloss + ☰ ride along, squished half as much so they stay readable
  const gx = 1 + (sx - 1) * 0.5, gy = 1 + (sy - 1) * 0.5;
  jGloss.setAttribute('transform', 'translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ') rotate(' + (jelly.ang + jelly.rot * 0.6).toFixed(1) +
    ') scale(' + gx.toFixed(3) + ' ' + gy.toFixed(3) + ') rotate(' + (-jelly.ang).toFixed(1) + ')');
  const tr = Math.max(0, jelly.tail);
  jTail.setAttribute('r', tr.toFixed(1));
  // goo bridge home → blob, thinner the farther it goes (only while the tail exists)
  jBridge.setAttribute('x2', cx.toFixed(1));
  jBridge.setAttribute('y2', cy.toFixed(1));
  jBridge.setAttribute('stroke-width', (tr > 0.5 ? Math.min(tr * 1.6, 26) : 0).toFixed(1));
  jShadow.setAttribute('cx', (JELLY_HOME + jelly.x * 0.8).toFixed(1));
  jShadow.setAttribute('cy', (150 + jelly.y * 0.4).toFixed(1));
  jShadow.setAttribute('rx', (22 * Math.max(sx, 0.7) + Math.abs(jelly.x) * 0.2).toFixed(1));
  jShadow.setAttribute('ry', (5 * Math.max(sy, 0.6)).toFixed(1));
}

function jellyStop() { if (jelly.raf) cancelAnimationFrame(jelly.raf); jelly.raf = 0; }

// Drag: blob goes all the way to the finger, stretches along the pull, tail thins with distance.
function floatFollow(dx, dy) {
  jellyStop();
  const dist = Math.hypot(dx, dy);
  jelly.x = dx; jelly.y = dy; jelly.vx = jelly.vy = 0;
  if (dist > 1) jelly.ang = Math.atan2(dy, dx) * 180 / Math.PI;
  jelly.sq = Math.min(dist / 260, 0.65);       // soft stretch along the pull
  jelly.vsq = 0; jelly.rot = 0; jelly.vrot = 0;
  jelly.tail = dist > 6 ? Math.max(3, 17 - dist * 0.045) : 0;
  jellyDraw(1 + jelly.sq, 1 - jelly.sq * 0.45);
}

// Armed (gesture will fire on release): soft glow.
function floatArm(on) {
  const el = document.getElementById('jelly');
  if (el) el.classList.toggle('armed', !!on);
}

// Soft spring loop: offset, squash-stretch and rotation all settle over several bounces.
function jellyAnimate() {
  jellyStop();
  const step = () => {
    // soft, slow spring: low stiffness, little damping → many squishy settle wobbles
    jelly.vx = (jelly.vx - jelly.x * 0.04) * 0.9;
    jelly.vy = (jelly.vy - jelly.y * 0.04) * 0.9;
    jelly.x += jelly.vx; jelly.y += jelly.vy;
    const sp = Math.hypot(jelly.vx, jelly.vy);
    if (sp > 0.5) jelly.ang = Math.atan2(jelly.vy, jelly.vx) * 180 / Math.PI;
    jelly.vsq = (jelly.vsq - jelly.sq * 0.06 + Math.min(sp, 30) * 0.0012) * 0.94;
    jelly.sq += jelly.vsq;
    jelly.vrot = (jelly.vrot - jelly.rot * 0.06) * 0.92;
    jelly.rot += jelly.vrot;
    jelly.tail *= 0.9;
    const sq = Math.max(-0.45, Math.min(0.8, jelly.sq));
    jellyDraw(1 + sq, 1 - sq * 0.55);
    const busy = Math.abs(jelly.x) + Math.abs(jelly.y) + Math.abs(jelly.vx) + Math.abs(jelly.vy) > 0.15 ||
      Math.abs(jelly.sq) + Math.abs(jelly.vsq) > 0.003 || Math.abs(jelly.rot) + Math.abs(jelly.vrot) > 0.1 || jelly.tail > 0.3;
    if (busy) jelly.raf = requestAnimationFrame(step);
    else { jelly.raf = 0; jelly.x = jelly.y = jelly.sq = jelly.rot = jelly.tail = 0; jellyDraw(1, 1); }
  };
  jelly.raf = requestAnimationFrame(step);
}

// Release: snap the stretch into a squash and let it bounce home.
function floatRelease() {
  floatArm(false);
  jelly.vsq = -jelly.sq * 0.6;     // stretched → overshoots into a squash
  jelly.vx = -jelly.x * 0.15; jelly.vy = -jelly.y * 0.15;
  jellyAnimate();
}

// Crumple: whole-body jelly jiggle.
function floatShake() {
  jelly.ang = Math.random() * 360;
  jelly.vsq += 0.35;
  jelly.vrot += 14;
  jellyAnimate();
}

// Tiny press squish (pointer down).
function floatPress() {
  jellyStop();
  jelly.sq = -0.12; jelly.vsq = 0;
  jellyDraw(1 + jelly.sq, 1 - jelly.sq * 0.55);
}
