/* DS-2a first-person view (DS-3: open road too). ES module: loads the shared Learn copy of three.js r170.
   Over file:// browsers block module imports, so this file never runs there and
   ui/app.js keeps the old top-down map (ui/render.js) as the main view instead. */
import * as THREE from '../../common/vendor/three/three.module.min.js';
import { createWorld, poseCamera } from './scene3d.js';

const DS = window.DS;

function textTexture(text, style) {
  const c = document.createElement('canvas'), round = !!style.round;
  c.width = round ? 64 : 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = style.bg || '#ffffff';
  if (round) { g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); } else g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = style.fg || '#203040'; g.font = 'bold ' + (round ? 38 : 34) + 'px system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, c.width / 2, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(kind, text) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.lineWidth = 12; g.strokeStyle = '#c83e42'; g.beginPath();
  if (kind === 'yield') { g.moveTo(10, 14); g.lineTo(118, 14); g.lineTo(64, 116); g.closePath(); }
  else if (kind === 'warn') { g.moveTo(64, 10); g.lineTo(120, 114); g.lineTo(8, 114); g.closePath(); }   // DS-3 warning triangle
  else { const n = kind === 'stop' ? 8 : 40; for (let i = 0; i <= n; i++) { const a = (i + .5) / n * Math.PI * 2; g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); } }
  g.fillStyle = kind === 'stop' ? '#c83e42' : '#ffffff'; g.fill(); if (kind !== 'stop') g.stroke();
  g.fillStyle = kind === 'stop' ? '#ffffff' : '#202020'; g.font = 'bold ' + (kind === 'stop' ? 34 : kind === 'warn' ? (text.length > 3 ? 20 : 40) : 54) + 'px system-ui,sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; if (text) g.fillText(text, 64, kind === 'warn' ? 84 : 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function create(canvas) {
  const weak = (navigator.deviceMemory || 4) <= 4 || (devicePixelRatio || 1) > 1.5;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !weak, powerPreference: 'low-power', alpha: false });
  const world = createWorld(THREE, DS, { label: textTexture, sign: signTexture });
  const eye = new THREE.PerspectiveCamera(70, 1, .2, 420), rear = new THREE.PerspectiveCamera(38, 3, .3, 220);
  const left = new THREE.PerspectiveCamera(44, 1.4, .3, 180), right = new THREE.PerspectiveCamera(44, 1.4, .3, 180);
  let size = '';
  function resize() {
    const r = canvas.getBoundingClientRect(), key = r.width + 'x' + r.height + '@' + devicePixelRatio;
    if (key === size || r.width < 2 || r.height < 2) return r;
    size = key; renderer.setPixelRatio(DS.renderPixelRatio(devicePixelRatio, r.width)); renderer.setSize(r.width, r.height, false);
    const f = DS.cameraFrame(r.width, r.height, .4);
    eye.fov = f.fov; eye.aspect = f.fullWidth / f.fullHeight; eye.setViewOffset(f.fullWidth, f.fullHeight, f.offsetX, f.offsetY, f.width, f.height);
    return r;
  }
  function mirror(cam, frame, pose, cr) {
    if (!frame || frame.hidden || frame.offsetParent === null) return;
    const v = DS.viewportFromRect(frame.getBoundingClientRect(), cr);
    if (!v.visible) return;
    poseCamera(cam, pose, v.w / v.h);
    renderer.setViewport(v.x, v.y, v.w, v.h); renderer.setScissor(v.x, v.y, v.w, v.h); renderer.setScissorTest(true);
    renderer.render(world.scene, cam);
  }
  return {
    render(s, prefs, frames, time) {
      const cr = resize(); if (cr.width < 2) return;
      world.update(s, prefs, time);
      const pose = DS.driverCamera(s.c, prefs.side);
      eye.position.set(pose.position.x, pose.position.y, pose.position.z); eye.lookAt(pose.target.x, pose.target.y, pose.target.z);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, cr.width, cr.height); renderer.render(world.scene, eye);
      mirror(rear, frames.rear, DS.rearMirrorCamera(s.c), cr);
      if (frames.sides) { mirror(left, frames.left, DS.sideMirrorCamera(s.c, 'left'), cr); mirror(right, frames.right, DS.sideMirrorCamera(s.c, 'right'), cr); }
      renderer.setScissorTest(false);
    },
    dispose() { renderer.dispose(); }
  };
}

// Hand the factory to ui/app.js (it switches from the map to this view if WebGL works).
DS.view3dFactory = create;
window.dispatchEvent(new Event('ds-view3d'));
